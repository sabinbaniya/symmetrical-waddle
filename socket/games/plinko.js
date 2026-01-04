import Game, { ProvablyFair } from "./game.js";
import GamesDB from "../../models/Games.js";
import { redis } from "../../lib/redis/client.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";
import { PLINKO_DATA } from "../../data/plinko.js";
import { generateMultipliers, plinkoProbabilities } from "../../lib/binomial.js";
import mongoose from "mongoose";
import UserDB from "../../models/User.js";
import { v4 as uuidv4 } from "uuid";

const MAX_BET_AMOUNT = Number(process.env.PLINKO_MAX_BET_AMOUNT) || 10;

export default class Plinko extends Game {
    constructor(betsDisabled) {
        super(betsDisabled);
        this.pf = new ProvablyFair();
    }

    // Helper method to generate deterministic path index using PF + client seed
    deterministicPathIndex(rowCount, slot, serverSeed, clientSeed, nonce) {
        const slots = PLINKO_DATA["rows-" + rowCount];
        const paths = slots["slot-" + slot];
        // Derive a deterministic uint using our PF method; reuse Mines-style API via shuffle
        const indices = this.pf.deterministicShuffle(paths.length, serverSeed, clientSeed, nonce);
        return indices[0];
    }

    // Game logic to determine payout
    fire(rowCount, risk, serverSeed, clientSeed, nonce) {
        // Use deterministic RNG for slot selection
        const number =
            (this.pf.deriveUint32(serverSeed, clientSeed, nonce, 1) % 1_000_000) / 1_000_000;
        const probabilities = plinkoProbabilities(rowCount);
        let probSum = 0,
            slot = 0;
        for (let i = 0; i < probabilities.length; i++) {
            probSum += probabilities[i];
            if (number < probSum) {
                slot = i;
                break;
            }
        }
        const multipliers = generateMultipliers(rowCount, risk);
        const multiplier = multipliers[slot];
        const slots = PLINKO_DATA["rows-" + rowCount];
        const paths = slots["slot-" + slot];
        const pathIndex = this.deterministicPathIndex(
            rowCount,
            slot,
            serverSeed,
            clientSeed,
            nonce,
        );
        const path = paths[pathIndex];
        return {
            multiplier,
            path,
            slot,
        };
    }

    // Check if error is transient and can be retried
    isTransientError(error) {
        if (!error) return false;
        if (error.errorLabels && error.errorLabels.includes("TransientTransactionError")) {
            return true;
        }
        if (error.code === 112) {
            return true;
        }
        if (error.message && error.message.includes("Write conflict during plan execution")) {
            return true;
        }
        if (
            error.message &&
            (error.message.includes("WriteConflict") ||
                error.message.includes("conflict") ||
                error.message.includes("retry"))
        ) {
            return true;
        }
        return false;
    }

    // Process the bet in a single transaction
    async processBetTransaction(
        socket,
        user,
        betAmount,
        betId,
        rows,
        risk,
        result,
        payoutAmount,
        pfMeta,
    ) {
        const MAX_RETRIES = 5;
        let retryCount = 0;
        let lastError = null;

        while (retryCount < MAX_RETRIES) {
            try {
                const session = await mongoose.startSession();
                try {
                    await session.withTransaction(async () => {
                        // Get fresh user data within the transaction
                        const freshUser = await this.user(socket.cookie, session);
                        if (!freshUser) {
                            throw new Error("Invalid user");
                        }

                        // Check balance within the transaction
                        if (freshUser[freshUser.activeBalanceType] < betAmount) {
                            throw new Error("Insufficient balance");
                        }

                        // Deduct bet amount
                        const deductResponse = await this.addBalance(
                            socket.cookie,
                            -betAmount,
                            null,
                            freshUser,
                            session,
                        );

                        console.log(deductResponse, "deductResponse");

                        if (!deductResponse) {
                            throw new Error("Insufficient balance");
                        }

                        const creditResponse = await this.addBalance(
                            socket.cookie,
                            payoutAmount,
                            null,
                            freshUser,
                            session,
                        );

                        if (!creditResponse) {
                            throw new Error("Failed to credit payout");
                        }

                        // Save game result
                        await this.saveGame(
                            [
                                {
                                    game: "plinko",
                                    user: user.steamid,
                                    wager: betAmount,
                                    earning: payoutAmount,
                                    betId: betId,
                                    pf: pfMeta,
                                },
                            ],
                            session,
                            freshUser.activeBalanceType,
                        );
                    });
                    const userDetails = await this.userById(user.steamid);
                    if (userDetails) {
                        this.announce(this.io, null, {
                            game: "Plinko",
                            date: Date.now(),
                            pfp: userDetails.avatar,
                            user: userDetails.username,
                            wager: betAmount,
                            multiplier: result.multiplier,
                            payout: payoutAmount,
                            betId: betId,
                        });
                    }

                    // If we get here, the transaction was successful
                    return userDetails;
                } catch (error) {
                    await session.abortTransaction();
                    console.log(error, "error");

                    // If it's a non-retryable error or we've exhausted retries
                    if (retryCount === MAX_RETRIES - 1 || !this.isTransientError(error)) {
                        throw error;
                    }

                    // Wait before retrying
                    const delay = 100 * Math.pow(2, retryCount) + Math.random() * 50;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                } finally {
                    await session.endSession();
                }
            } catch (error) {
                console.log(error, "error", retryCount);
                lastError = error;
                // For non-transient errors, we'll stop retrying
                if (!this.isTransientError(error)) {
                    break;
                }
                retryCount++;
            }
        }

        // If we get here, all retries failed
        console.error(`Failed to process bet after ${MAX_RETRIES} retries:`, lastError);
        socket.emit("plinko:bet", {
            status: false,
            message: lastError.message || "Failed to process bet after multiple attempts",
            betId,
        });
        return false;
    }

    async userById(userId, session = null) {
        if (session) {
            return await UserDB.findOne({ steamid: userId }).session(session);
        } else {
            return await UserDB.findOne({ steamid: userId });
        }
    }

    listen(io, socket) {
        this.io = io;
        socket.on("plinko:bet", async data => {
            if (!this.rateLimit(socket, "plinko:bet")) return;
            if (await this.betsDisabled()) {
                return socket.emit("plinko:bet", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }

            const user = await this.user(socket.cookie);
            if (!user) {
                return socket.emit("plinko:bet", {
                    status: false,
                    message: "You must be logged in to play Plinko",
                });
            }

            let { rows, risk, betAmount, clientSeed } = data;

            if (risk === "high" && betAmount > 5) {
                return socket.emit("plinko:bet", {
                    status: false,
                    message: "High risk bet amount must be less than or equal to 5",
                });
            }

            // Validate inputs
            if (
                rows < 8 ||
                rows > 16 ||
                !betAmount ||
                betAmount <= 0 ||
                betAmount > MAX_BET_AMOUNT ||
                isNaN(betAmount) ||
                !Number.isFinite(betAmount) ||
                rows !== parseInt(rows) ||
                typeof rows !== "number" ||
                typeof betAmount !== "number" ||
                ["low", "medium", "high"].indexOf(risk) === -1 ||
                !clientSeed ||
                typeof clientSeed !== "string"
            ) {
                return socket.emit("plinko:bet", {
                    status: false,
                    message: "Invalid bet parameters",
                });
            }

            betAmount = Math.floor(betAmount * 100) / 100;
            const betId = uuidv4();

            try {
                // PF seeds
                const serverSeed = Buffer.from(uuidv4()).toString("hex");
                const nonce = await redis.incr(CACHE_KEYS.GAMES_PLINKO_NONCE_BY_USER(user.steamid));

                const result = this.fire(rows, risk, serverSeed, clientSeed, nonce);
                const multiplier = result.multiplier;
                const payoutAmount = betAmount * multiplier;

                // Send PF commitment details immediately (before animation)
                const pfStart = {
                    serverSeedCommitment: this.pf.computeServerSeedCommitment(serverSeed),
                    clientSeed,
                    nonce,
                };
                socket.emit("plinko:pf", pfStart);

                // Send path for animation
                socket.emit("plinko:fire", {
                    multiplier,
                    path: result.path,
                    betId,
                    pathDuration: result.path.pathDuration,
                });

                const pfMeta = pfStart;

                const userDetails = await this.processBetTransaction(
                    socket,
                    user,
                    betAmount,
                    betId,
                    rows,
                    risk,
                    result,
                    payoutAmount,
                    pfMeta,
                );

                if (!userDetails) {
                    // Error was already sent to client by processBetTransaction
                    return;
                }

                // Send final confirmation
                socket.emit("plinko:bet", {
                    status: true,
                    betId,
                    pathDuration: result.path.pathDuration,
                    multiplier: result.multiplier,
                    payout: payoutAmount,
                    userBalance: userDetails.balance,
                });

                // After ball has dropped, reveal server seed and persist into DB
                const delay = Number(result.path?.pathDuration || 0);
                setTimeout(async () => {
                    try {
                        socket.emit("plinko:proof", {
                            serverSeed,
                            serverSeedCommitment: pfMeta.serverSeedCommitment,
                            clientSeed,
                            nonce,
                        });
                        await GamesDB.updateOne(
                            {
                                user: user.steamid,
                                game: "plinko",
                                "pf.serverSeedCommitment": pfMeta.serverSeedCommitment,
                            },
                            { $set: { "pf.serverSeed": serverSeed } },
                        );
                    } catch (e) {}
                }, delay);
            } catch (error) {
                console.error("Error preparing bet:", error);
                socket.emit("plinko:bet", {
                    status: false,
                    message: error.message || "Error preparing bet",
                    betId,
                });
            }
        });
    }
}
