import { randomBytes } from "crypto";
import Game, { ProvablyFair } from "./game.js";
import { redis } from "../../lib/redis/client.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";
import MinesGame from "../../models/MinesGame.js";
import mongoose from "mongoose";

const HE = 10 / 100; // House edge
const MINES_TEMPLATE = Array(25).fill(0);
const MAX_WIN_USD = 5_000;
const MAX_BET_USD = 50;

export default class Mines extends Game {
    constructor(betsDisabled) {
        super(betsDisabled);
        this.pf = new ProvablyFair();
        this._serverSeeds = new Map();
    }

    // Helper method to acquire and release locks
    async withLock(userId, callback, maxRetries = 3, retryDelay = 100) {
        const lockKey = `lock:mines:${userId}`;
        const lockValue = Math.random().toString(36).substring(2);
        const lockTimeout = 5000; // 5 seconds

        let attempt = 0;
        let lastError = null;

        while (attempt < maxRetries) {
            attempt++;
            try {
                // Try to acquire lock
                const acquired = await redis.set(lockKey, lockValue, "NX", "PX", lockTimeout);
                if (!acquired) {
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    } else {
                        lastError = new Error("Could not acquire lock after retries");
                        throw lastError;
                    }
                }

                try {
                    // Call the callback with the lock held
                    return await callback();
                } finally {
                    // Release lock if we hold it
                    const currentLockValue = await redis.get(lockKey);
                    if (currentLockValue === lockValue) {
                        await redis.del(lockKey);
                    }
                }
            } catch (error) {
                lastError = error;
                throw error;
            }
        }
        throw lastError || new Error("Could not acquire lock after retries");
    }

    // Helper method to get game state
    async getGame(userID) {
        try {
            const key = CACHE_KEYS.GAMES_MINES_BY_USER(userID);
            const cached = await redis.get(key);
            if (cached) return JSON.parse(cached);

            const gameFromDB = await MinesGame.findOne({
                userID,
                status: "ongoing",
            });

            if (gameFromDB) {
                await this.setGame(userID, gameFromDB);
                return gameFromDB;
            }
            return null;
        } catch (e) {
            console.log("Mines:getGame", e);
            return null;
        }
    }

    // Helper method to set game state in cache
    async setGame(userID, gameState) {
        try {
            const key = CACHE_KEYS.GAMES_MINES_BY_USER(userID);
            return await redis.set(key, JSON.stringify(gameState));
        } catch (e) {
            console.log("Mines:setGame", e);
            return null;
        }
    }

    // Helper method to delete game state
    async deleteGame(userID) {
        try {
            const key = CACHE_KEYS.GAMES_MINES_BY_USER(userID);
            await redis.del(key);

            // Also update in MongoDB
            await MinesGame.updateOne(
                { userID, status: "ongoing" },
                { $set: { status: "completed" } },
            );
            return true;
        } catch (e) {
            console.log("Mines:deleteGame", e);
            return false;
        }
    }

    // Deprecated: random mines; now using ProvablyFair
    setMines() {
        throw new Error("setMines is deprecated; use ProvablyFair.generateMinesBoard");
    }

    async updateMultiplier(userID, mineCount) {
        const game = await this.getGame(userID);
        if (!game) return;

        const revealed = game.mines.filter(area => area === 2).length;
        const unrevealed = 25 - revealed;
        let ratio = game.currentMultiplier * (unrevealed / (unrevealed - mineCount)) * (1 - HE);
        let divisor = unrevealed - mineCount - 1;

        // Create an updated game object
        const updatedGame = { ...game };
        updatedGame.currentMultiplier = ratio;
        if (divisor === 0) {
            updatedGame.nextMultiplier = ratio * 2 * (1 - HE);
        } else {
            updatedGame.nextMultiplier = ratio * ((unrevealed - 1) / divisor) * (1 - HE);
        }

        // Save back to storage
        await this.setGame(userID, updatedGame);
        await MinesGame.updateOne(
            { userID, status: "ongoing" },
            {
                $set: {
                    currentMultiplier: ratio,
                    nextMultiplier:
                        divisor === 0
                            ? ratio * 2 * (1 - HE)
                            : ratio * ((unrevealed - 1) / divisor) * (1 - HE),
                },
            },
        );
    }

    async lose(userID, activeBalanceType) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Save game to database with lost status
            await MinesGame.updateOne(
                { userID, status: "ongoing" },
                {
                    $set: {
                        status: "lost",
                        payout: 0,
                        completedAt: Date.now(),
                    },
                },
                { session },
            );

            // Save to history
            const game = await this.getGame(userID);
            if (game) {
                await this.saveGame(
                    [
                        {
                            game: "mines",
                            user: userID,
                            wager: game.betAmount,
                            earning: 0,
                        },
                    ],
                    session,
                    activeBalanceType,
                );
            }

            await session.commitTransaction();
            await this.deleteGame(userID);
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async cashout(cookie, userID, calculateNext = false, activeBalanceType) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const game = await this.getGame(userID);
            if (!game) {
                await session.abortTransaction();
                return null;
            }

            // Calculate winning amount
            const multiplier = calculateNext ? game.nextMultiplier : game.currentMultiplier;
            let winningAmount = game.betAmount * multiplier;

            if (winningAmount > MAX_WIN_USD) {
                winningAmount = MAX_WIN_USD;
            }

            // Add balance within the transaction
            await this.addBalance(cookie, winningAmount, null, null, session);

            // Mark game as completed in DB
            await MinesGame.updateOne(
                { userID, status: "ongoing" },
                {
                    $set: {
                        status: "completed",
                        payout: winningAmount,
                        completedAt: Date.now(),
                    },
                },
                { session },
            );

            // Save game result to history
            await this.saveGame(
                [
                    {
                        game: "mines",
                        user: userID,
                        wager: game.betAmount,
                        earning: winningAmount,
                    },
                ],
                session,
                activeBalanceType,
            );

            await session.commitTransaction();
            await this.deleteGame(userID);

            return winningAmount;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    listen(io, socket) {
        this.io = io; // Store io for announcements

        socket.on("disconnect", async () => {
            const user = await this.user(socket.cookie);
            if (!user) return;
            const game = await this.getGame(user.steamid);
            if (!game) return;

            try {
                await this.withLock(
                    user.steamid,
                    async () => {
                        if (game.mines.includes(2)) {
                            await this.cashout(
                                socket.cookie,
                                user.steamid,
                                false,
                                user.activeBalanceType,
                            );
                        } else {
                            // Give back the bet amount
                            const session = await mongoose.startSession();
                            session.startTransaction();
                            try {
                                await this.addBalance(
                                    socket.cookie,
                                    game.betAmount,
                                    null,
                                    null,
                                    session,
                                );
                                await MinesGame.updateOne(
                                    { userID: user.steamid, status: "ongoing" },
                                    {
                                        $set: {
                                            status: "abandoned",
                                            payout: game.betAmount,
                                            completedAt: Date.now(),
                                        },
                                    },
                                    { session },
                                );
                                await session.commitTransaction();
                                await this.deleteGame(user.steamid);
                            } catch (error) {
                                await session.abortTransaction();
                                console.error("Error handling disconnect:", error);
                            } finally {
                                session.endSession();
                            }
                        }
                    },
                    1,
                ); // Only retry once for disconnect handling
            } catch (error) {
                console.warn("Could not acquire lock for disconnect handling:", error.message);
                // Silently ignore since the user is disconnecting
            }
        });

        socket.on("mines:cashout", async () => {
            if (!this.rateLimit(socket, "mines:cashout")) return;
            const user = await this.user(socket.cookie);
            if (!user) {
                return socket.emit("mines:cashout", {
                    status: false,
                    message: "Invalid user",
                });
            }

            try {
                await this.withLock(user.steamid, async () => {
                    // Check for ongoing game
                    const game = await this.getGame(user.steamid);
                    if (!game) {
                        return socket.emit("mines:cashout", {
                            status: false,
                            message: "You don't have an ongoing game",
                        });
                    }
                    // Check if at least one area is revealed
                    if (!game.mines.includes(2)) {
                        return socket.emit("mines:cashout", {
                            status: false,
                            message: "You must reveal at least one area",
                        });
                    }
                    // Additional safeguard: Check if game is already being processed
                    if (game.processing) {
                        return socket.emit("mines:cashout", {
                            status: false,
                            message: "Cashout already in progress",
                        });
                    }

                    try {
                        const winningAmount = await this.cashout(
                            socket.cookie,
                            user.steamid,
                            false,
                            user.activeBalanceType,
                        );
                        socket.emit("mines:cashout", {
                            status: true,
                            winningAmount,
                            mines: game.mines,
                        });
                        // Emit proof after successful cashout
                        const serverSeed = this._serverSeeds.get(user.steamid);
                        if (serverSeed && game.pf) {
                            socket.emit("mines:proof", {
                                serverSeed,
                                serverSeedCommitment: game.pf.serverSeedCommitment,
                                clientSeed: game.pf.clientSeed,
                                nonce: game.pf.nonce,
                            });
                            // Persist revealed server seed for history
                            try {
                                await MinesGame.updateOne(
                                    {
                                        userID: user.steamid,
                                        status: "completed",
                                        "pf.serverSeedCommitment": game.pf.serverSeedCommitment,
                                    },
                                    { $set: { "pf.serverSeed": serverSeed } },
                                );
                            } catch (e) {}
                            this._serverSeeds.delete(user.steamid);
                        }
                        // Live game announcement
                        this.announce(io, null, {
                            game: "Mines",
                            date: Date.now(),
                            pfp: game.pfp,
                            user: user.username,
                            wager: game.betAmount,
                            multiplier: game.currentMultiplier,
                            payout: winningAmount,
                        });
                    } catch (error) {
                        console.error("Mines cashout error:", error);
                        socket.emit("mines:cashout", {
                            status: false,
                            message: "An error occurred during cashout",
                        });
                    }
                });
            } catch (error) {
                if (error.message === "Could not acquire lock after retries") {
                    return socket.emit("mines:cashout", {
                        status: false,
                        message: "Another operation is in progress. Please try again.",
                    });
                }
                console.error("Error in mines:cashout:", error);
                socket.emit("mines:cashout", {
                    status: false,
                    message: "An error occurred",
                });
            }
        });

        socket.on("mines:start", async data => {
            if (!this.rateLimit(socket, "mines:start")) return;
            if (await this.betsDisabled()) {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }

            // Validate mine count
            if (data.mineCount !== Math.round(data.mineCount)) {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Invalid mine count",
                });
            }
            if (data.mineCount < 1 || typeof data.mineCount !== "number") {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Mine count must be at least 1",
                });
            }
            if (data.mineCount > 24) {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Mine count must be at most 24",
                });
            }

            // Validate client seed
            if (!data.clientSeed || typeof data.clientSeed !== "string") {
                return socket.emit("mines:start", {
                    status: false,
                    message: "clientSeed is required",
                });
            }

            // Validate bet amount
            if (!data.betAmount || typeof data.betAmount !== "number" || isNaN(data.betAmount)) {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Invalid bet amount",
                });
            }
            data.betAmount = Math.round(data.betAmount * 100) / 100;
            if (data.betAmount <= 0 || typeof data.betAmount !== "number") {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Invalid bet amount",
                });
            }
            if (data.betAmount > MAX_BET_USD) {
                return socket.emit("mines:start", {
                    status: false,
                    message: `Bet amount must be at most ${MAX_BET_USD} USD`,
                });
            }

            const user = await this.user(socket.cookie);
            if (!user) {
                return socket.emit("mines:start", {
                    status: false,
                    message: "Invalid user",
                });
            }

            try {
                await this.withLock(user.steamid, async () => {
                    // Check if user has an ongoing game
                    const existingGame = await this.getGame(user.steamid);
                    if (existingGame) {
                        return socket.emit("mines:start", {
                            status: false,
                            message: "You already have an ongoing game",
                        });
                    }
                    // Check for existing game in DB (in case cache is stale)
                    const existingGameDB = await MinesGame.findOne({
                        userID: user.steamid,
                        status: "ongoing",
                    });
                    if (existingGameDB) {
                        return socket.emit("mines:start", {
                            status: false,
                            message: "You already have an ongoing game",
                        });
                    }
                    // Start transaction for balance check and deduction
                    const session = await mongoose.startSession();
                    session.startTransaction();
                    try {
                        // Get fresh user balance within transaction
                        const freshUser = await this.user(socket.cookie, session);
                        if (!freshUser) {
                            await session.abortTransaction();
                            return socket.emit("mines:start", {
                                status: false,
                                message: "Invalid user",
                            });
                        }

                        if (freshUser[freshUser.activeBalanceType] < data.betAmount) {
                            await session.abortTransaction();
                            return socket.emit("mines:start", {
                                status: false,
                                message: "Insufficient balance",
                            });
                        }
                        // Deduct balance within the transaction
                        await this.addBalance(socket.cookie, -data.betAmount, null, null, session);
                        // Generate provably fair game state
                        const serverSeed = randomBytes(32).toString("hex");
                        const nonce = await redis.incr(
                            CACHE_KEYS.GAMES_MINES_NONCE_BY_USER(user.steamid),
                        );
                        // EOS head block id as public seed (best effort)
                        let publicSeed = null;
                        try {
                            publicSeed = await this.pf.getHeadBlockId();
                        } catch (e) {}
                        // IMPORTANT: Mines must use client seed (public seed is NOT used in RNG for Mines)
                        const mines = this.pf.generateMinesBoard(
                            serverSeed,
                            data.clientSeed,
                            nonce,
                            data.mineCount,
                        );
                        const serverSeedCommitment =
                            this.pf.computeServerSeedCommitment(serverSeed);
                        // Keep plaintext serverSeed in memory only for current round
                        this._serverSeeds.set(user.steamid, serverSeed);
                        const nextMultiplier = (25 / (25 - data.mineCount)) * (1 - HE);
                        const gameDoc = {
                            userID: user.steamid,
                            mines,
                            betAmount: data.betAmount,
                            mineCount: data.mineCount,
                            socketID: socket.id,
                            nextMultiplier,
                            currentMultiplier: 1,
                            pfp: user.avatar,
                            status: "ongoing",
                            createdAt: Date.now(),
                            pf: {
                                serverSeedCommitment,
                                clientSeed: data.clientSeed,
                                nonce,
                                publicSeed,
                            },
                        };
                        // Store in MongoDB
                        await MinesGame.updateOne(
                            { userID: user.steamid, status: "ongoing" },
                            { $set: gameDoc },
                            { upsert: true, session },
                        );
                        // Cache in Redis
                        await this.setGame(user.steamid, gameDoc);
                        await session.commitTransaction();

                        socket.emit("mines:start", {
                            status: true,
                            nextMultiplier: gameDoc.nextMultiplier,
                            pf: {
                                serverSeedCommitment,
                                clientSeed: data.clientSeed,
                                nonce,
                                publicSeed,
                            },
                        });
                    } catch (error) {
                        await session.abortTransaction();
                        console.error("Mines start error:", error);
                        return socket.emit("mines:start", {
                            status: false,
                            message: "An error occurred while starting the game",
                        });
                    } finally {
                        session.endSession();
                    }
                });
            } catch (error) {
                if (error.message === "Could not acquire lock after retries") {
                    return socket.emit("mines:start", {
                        status: false,
                        message: "Another operation is in progress. Please try again.",
                    });
                }
                console.error("Error in mines:start:", error);
                socket.emit("mines:start", {
                    status: false,
                    message: "An error occurred",
                });
            }
        });

        socket.on("mines:reveal", async data => {
            if (!this.rateLimit(socket, "mines:reveal")) return;
            const user = await this.user(socket.cookie);
            if (!user) {
                return socket.emit("mines:reveal", {
                    status: false,
                    message: "Invalid user",
                });
            }

            try {
                await this.withLock(user.steamid, async () => {
                    const game = await this.getGame(user.steamid);
                    if (!game) {
                        return socket.emit("mines:reveal", {
                            status: false,
                            message: "You don't have an ongoing game",
                        });
                    }

                    // Check if reveal index is valid
                    if (!Number.isInteger(data.index)) {
                        return socket.emit("mines:reveal", {
                            status: false,
                            message: "Invalid index",
                        });
                    }
                    if (data.index < 0 || data.index > 24) {
                        return socket.emit("mines:reveal", {
                            status: false,
                            message: "Invalid index",
                        });
                    }

                    // Check if area is already revealed
                    if (game.mines[data.index] === 2) {
                        return socket.emit("mines:reveal", {
                            status: false,
                            message: "Area is already revealed",
                        });
                    }
                    // Prepare updated game state
                    const updatedMines = [...game.mines];
                    const mineRevealed = updatedMines[data.index] === 1;
                    if (mineRevealed) {
                        const updatedGame = { ...game, mines: updatedMines };
                        // Update in cache and DB
                        await this.setGame(user.steamid, updatedGame);
                        await MinesGame.updateOne(
                            { userID: user.steamid, status: "ongoing" },
                            { $set: { mines: updatedMines } },
                        );
                        socket.emit("mines:reveal", {
                            status: true,
                            mineRevealed: true,
                            mines: updatedMines,
                        });
                        await this.lose(user.steamid, user.activeBalanceType);
                        // Live game announcement
                        this.announce(io, null, {
                            game: "Mines",
                            date: Date.now(),
                            pfp: game.pfp,
                            user: user.username,
                            wager: game.betAmount,
                            multiplier: 0,
                            payout: 0,
                        });
                        // Reveal server seed after conclusion (lose)
                        const serverSeed = this._serverSeeds.get(user.steamid);
                        if (serverSeed && game.pf) {
                            socket.emit("mines:proof", {
                                serverSeed,
                                serverSeedCommitment: game.pf.serverSeedCommitment,
                                clientSeed: game.pf.clientSeed,
                                nonce: game.pf.nonce,
                            });
                            // Persist revealed server seed for history
                            try {
                                await MinesGame.updateOne(
                                    {
                                        userID: user.steamid,
                                        status: { $in: ["lost", "abandoned"] },
                                        "pf.serverSeedCommitment": game.pf.serverSeedCommitment,
                                    },
                                    { $set: { "pf.serverSeed": serverSeed } },
                                );
                            } catch (e) {}
                            this._serverSeeds.delete(user.steamid);
                        }
                        return;
                    }
                    // Update mines array
                    updatedMines[data.index] = 2;
                    const updatedGame = { ...game, mines: updatedMines };
                    // Check if all areas are revealed
                    if (!updatedMines.includes(0)) {
                        await this.cashout(
                            socket.cookie,
                            user.steamid,
                            true,
                            user.activeBalanceType,
                        );
                        socket.emit("mines:reveal", {
                            status: true,
                            mines: updatedMines,
                        });
                        // Live game announcement
                        this.announce(io, null, {
                            game: "Mines",
                            date: Date.now(),
                            pfp: game.pfp,
                            user: user.username,
                            wager: game.betAmount,
                            multiplier: game.nextMultiplier,
                            payout: game.nextMultiplier * game.betAmount,
                        });
                        // Reveal server seed after conclusion (win via full clear)
                        const serverSeed2 = this._serverSeeds.get(user.steamid);
                        if (serverSeed2 && game.pf) {
                            socket.emit("mines:proof", {
                                serverSeed: serverSeed2,
                                serverSeedCommitment: game.pf.serverSeedCommitment,
                                clientSeed: game.pf.clientSeed,
                                nonce: game.pf.nonce,
                            });
                            this._serverSeeds.delete(user.steamid);
                        }
                        return;
                    }
                    // Update in cache and DB before updating multiplier
                    await this.setGame(user.steamid, updatedGame);
                    await MinesGame.updateOne(
                        { userID: user.steamid, status: "ongoing" },
                        { $set: { mines: updatedMines } },
                    );
                    // Update multiplier
                    await this.updateMultiplier(user.steamid, game.mineCount);
                    // Get updated game state after multiplier update
                    const finalUpdatedGame = await this.getGame(user.steamid);
                    socket.emit("mines:reveal", {
                        status: true,
                        index: data.index,
                        nextMultiplier: finalUpdatedGame.nextMultiplier,
                    });
                });
            } catch (error) {
                if (error.message === "Could not acquire lock after retries") {
                    return socket.emit("mines:reveal", {
                        status: false,
                        message: "Another operation is in progress. Please try again.",
                    });
                }
                console.error("Error in mines:reveal:", error);
                socket.emit("mines:reveal", {
                    status: false,
                    message: "An error occurred",
                });
            }
        });
    }
}
