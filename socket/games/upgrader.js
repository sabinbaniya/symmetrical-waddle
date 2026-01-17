import { randomBytes } from "crypto";
import Game, { ProvablyFair } from "./game.js";
import GetItems from "../../func/GetItems.js";
import { formatPrice } from "../../lib/helpers.js";
import mongoose from "mongoose";
import { redis } from "../../lib/redis/client.js";
import Gameplays from "../../models/Gameplays.js";
import GamesDB from "../../models/Games.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";

const HE = 10 / 100; // House edge
const N = 5;
const MAX_BET_LIMIT = 1_000; // $10,000 max bet
const MIN_BET_LIMIT = 0.01; // 1 cent minimum bet
const MIN_ITEM_PRICE = 0.01; // 1 cent minimum item price
const MAX_ITEM_PRICE = 5_000; // $100,000 max item price
const MAX_WIN_USD = 5_000;

export default class Upgrader extends Game {
    constructor(betsDisabled) {
        super(betsDisabled);
        this.pf = new ProvablyFair();
        this.lastUpgrades = [];
        this.topUpgraded = [];
        this.fakeLiveUpgrader();
    }

    async withLock(userId, callback, maxRetries = 3, retryDelay = 100) {
        const lockKey = `lock:upgrader:${userId}`;
        const lockValue = Math.random().toString(36).substring(2);
        const lockTimeout = 5000; // 5 seconds
        let attempt = 0;
        let lastError = null;

        while (attempt < maxRetries) {
            attempt++;
            try {
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

    async getGame(userId) {
        try {
            const key = CACHE_KEYS.UPGRADER_GAME_BY_USER(userId.toString());
            const cached = await redis.get(key);
            let gameState = null;

            if (cached) {
                gameState = JSON.parse(cached);
                // If cached game is not ongoing, clear cache and check DB
                if (gameState.status !== "ongoing") {
                    await redis.del(key);
                    gameState = null;
                }
            }

            // If no valid cached game, check DB
            if (!gameState) {
                gameState = await Gameplays.findOne({
                    gamemode: "upgrader",
                    participants: userId.toString(),
                    status: "ongoing",
                });

                if (gameState) {
                    await this.setGame(userId.toString(), gameState);
                }
            }

            return gameState;
        } catch (e) {
            console.log("Upgrader:getGame", e);
            return null;
        }
    }

    async updateRedisCache(userId, gameState) {
        try {
            const key = CACHE_KEYS.UPGRADER_GAME_BY_USER(userId.toString());
            await redis.set(key, JSON.stringify(gameState), "EX", 3600);
            return true;
        } catch (e) {
            console.log("Upgrader:updateRedisCache", e);
            return false;
        }
    }

    async setGame(userId, gameState, session = null) {
        try {
            const key = CACHE_KEYS.UPGRADER_GAME_BY_USER(userId.toString());
            await redis.set(key, JSON.stringify(gameState), "EX", 3600);

            const options = { upsert: true };
            if (session) {
                options.session = session;
            }

            await Gameplays.updateOne(
                {
                    gamemode: "upgrader",
                    participants: userId.toString(),
                    status: "ongoing",
                },
                gameState,
                options,
            );
            return true;
        } catch (e) {
            console.log("Upgrader:setGame", e);
            return false;
        }
    }

    async deleteGame(userId, session = null) {
        try {
            const key = CACHE_KEYS.UPGRADER_GAME_BY_USER(userId.toString());
            await redis.del(key);

            const options = {};
            if (session) {
                options.session = session;
            }

            await Gameplays.updateOne(
                {
                    gamemode: "upgrader",
                    participants: userId.toString(),
                    status: "ongoing",
                },
                { $set: { status: "completed", updatedAt: Date.now() } },
                options,
            );
            return true;
        } catch (e) {
            console.log("Upgrader:deleteGame", e);
            return false;
        }
    }

    async spin(amount, item, randomPercentageValue = null) {
        const goal = formatPrice(item.price);

        // Calculate win chance without house edge
        const rawWinChance = 100 * (amount / goal); // n% chance to win

        // Calculate win chance with house edge
        const winChance = rawWinChance * (1 - HE);

        // Generate random number
        const random =
            randomPercentageValue !== null ? randomPercentageValue : this.randomPercentage();

        // Check if user won
        const success = random <= winChance;

        if (success) {
            this.lastUpgrades.unshift({
                image: item.image,
                price: item.price,
                marketHashName: item.marketHashName,
                percentage: item.percentage,
            });
            this.lastUpgrades = this.lastUpgrades.slice(-N);
            this.topUpgrades(item);
        }

        return {
            amount: success ? goal : 0,
            success,
        };
    }

    listen(io, socket) {
        this.io = io;
        socket.on("upgrader:spin", async data => {
            if (!this.rateLimit(socket, "upgrader:spin")) return;
            if (await this.betsDisabled()) {
                return socket.emit("upgrader:spin", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }

            const fail = message => {
                this.deleteGame(user._id).catch(err =>
                    console.error("Failed to clean up game:", err),
                );
                return socket.emit("upgrader:spin", { status: false, message });
            };

            // Check if user is already playing
            const user = await this.user(socket.cookie);
            if (!user) return fail("Invalid user");
            const existingGame = await this.getGame(user._id);
            if (existingGame) {
                return fail("You are already playing");
            }

            // Validate amount
            if (
                !data.amount ||
                typeof data.amount !== "number" ||
                isNaN(data.amount) ||
                !isFinite(data.amount)
            ) {
                return fail("Invalid amount");
            }
            data.amount = Math.round(data.amount * 100) / 100;

            if (data.amount <= 0) {
                return fail("Invalid amount");
            }
            if (data.amount > MAX_BET_LIMIT) {
                return fail(`Bet amount exceeds maximum limit of ${MAX_BET_LIMIT}`);
            }
            if (data.amount < MIN_BET_LIMIT) {
                return fail(`Bet amount is below minimum limit of ${MIN_BET_LIMIT}`);
            }

            // Validate item
            if (typeof data.item !== "string" || !data.item.trim()) {
                return fail("Invalid item format");
            }
            data.item = data.item.trim();

            if (!data.item) {
                return fail("Item name cannot be empty");
            }

            // Validate client seed
            if (!data.clientSeed || typeof data.clientSeed !== "string") {
                return fail("clientSeed is required");
            }

            try {
                await this.withLock(user._id, async () => {
                    const session = await mongoose.startSession();
                    try {
                        session.startTransaction();
                        if (!user) {
                            await session.abortTransaction();
                            return fail("Invalid user");
                        }
                        const userBalance = user[user.activeBalanceType];
                        if (userBalance < data.amount) {
                            await session.abortTransaction();
                            return fail("Not enough balance");
                        }
                        const items = await GetItems();
                        const item = items.find(item => item.marketHashName === data.item);
                        if (!item) {
                            await session.abortTransaction();
                            return fail("Invalid item");
                        }

                        const itemPrice = formatPrice(item.price);
                        if (itemPrice < MIN_ITEM_PRICE) {
                            await session.abortTransaction();
                            return fail("Item price is too low");
                        }
                        if (itemPrice > MAX_ITEM_PRICE) {
                            await session.abortTransaction();
                            return fail("Item price is too high");
                        }
                        if (itemPrice <= data.amount) {
                            await session.abortTransaction();
                            return fail("Item price must be greater than bet amount");
                        }

                        // Provably Fair seeds and commitment
                        const serverSeed = randomBytes(32).toString("hex");
                        const nonce = await redis.incr(
                            CACHE_KEYS.GAMES_UPGRADER_NONCE_BY_USER(user._id.toString()),
                        );
                        const serverSeedCommitment =
                            this.pf.computeServerSeedCommitment(serverSeed);
                        const pfStart = {
                            serverSeedCommitment,
                            clientSeed: data.clientSeed,
                            nonce,
                        };

                        // Send PF commitment before the spin animation/result
                        socket.emit("upgrader:pf", pfStart);

                        // Rest of the existing transaction code remains unchanged
                        const initialGameState = {
                            gamemode: "upgrader",
                            participants: [user._id],
                            status: "ongoing",
                            cost: data.amount,
                            multiplier: 1,
                            maxParticipants: 1,
                            date: Date.now(),
                            round: 1,
                            isPrivate: false,
                            isReversed: false,
                            isBot: false,
                            isSpinning: false,
                            cases: [],
                            avatars: [],
                            names: [],
                            items: [data.item], // marketHashName
                            itemPools: [],
                            forces: [],
                            gameID: `${user._id.toString()}-${Date.now()}`,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        };

                        await Gameplays.updateOne(
                            {
                                gamemode: "upgrader",
                                participants: user._id,
                                status: "ongoing",
                            },
                            initialGameState,
                            { upsert: true, session },
                        );

                        // Deterministic RNG percentage from PF
                        const pfPercentage =
                            Math.round(
                                ((this.pf.deriveUint32(serverSeed, data.clientSeed, nonce, 1) %
                                    1000000) /
                                    1000000) *
                                    100 *
                                    100,
                            ) / 100; // keep two decimals

                        // Emit raw PF percent for client
                        socket.emit("upgrader:pf", {
                            serverSeedCommitment,
                            clientSeed: data.clientSeed,
                            nonce,
                            percent: pfPercentage,
                        });

                        // Perform the spin operation with deterministic percentage
                        const result = await this.spin(data.amount, item, pfPercentage);

                        // Update the balance within the transaction
                        await this.addBalance(
                            user._id,
                            result.amount - data.amount,
                            null,
                            null,
                            session,
                        );

                        // Prepare and save the final game state within the transaction
                        const finalGameState = {
                            ...initialGameState,
                            result: {
                                success: result.success,
                                amount: result.amount,
                                item: item.marketHashName,
                            },
                            status: "completed",
                            updatedAt: Date.now(),
                        };

                        await Gameplays.updateOne(
                            {
                                gamemode: "upgrader",
                                participants: user._id,
                                status: "ongoing",
                            },
                            finalGameState,
                            { session },
                        );

                        await this.saveGame(
                            [
                                {
                                    game: "upgrader",
                                    user: user._id,
                                    wager: data.amount,
                                    earning: result.amount,
                                    pf: pfStart,
                                },
                            ],
                            session,
                            user.activeBalanceType,
                        );

                        await session.commitTransaction();

                        await this.updateRedisCache(user._id, finalGameState);

                        socket.emit("upgrader:spin", {
                            status: true,
                            result,
                        });

                        setTimeout(async () => {
                            try {
                                // Reveal PF proof after spin
                                socket.emit("upgrader:proof", {
                                    serverSeed,
                                    serverSeedCommitment: pfStart.serverSeedCommitment,
                                    clientSeed: data.clientSeed,
                                    nonce,
                                });
                                await GamesDB.updateOne(
                                    {
                                        user: user._id,
                                        game: "upgrader",
                                        "pf.serverSeedCommitment": pfStart.serverSeedCommitment,
                                    },
                                    { $set: { "pf.serverSeed": serverSeed } },
                                );
                            } catch (e) {}
                            this.announce(io, null, {
                                game: "Upgrader",
                                date: Date.now(),
                                pfp: user.avatar,
                                user: user.username,
                                payout: result.amount,
                                wager: data.amount,
                                multiplier: result.amount / data.amount,
                            });
                            this.lastUpgrades.unshift({
                                image: item.image,
                                price: item.price,
                                marketHashName: item.marketHashName,
                                percentage: item.percentage,
                            });
                            this.lastUpgrades = this.lastUpgrades.slice(0, N);
                            if (result.success) {
                                io.emit("unboxes", {
                                    items: this.lastUpgrades,
                                    type: "upgrader",
                                });
                            }
                        }, 6000);
                    } catch (error) {
                        await session.abortTransaction();
                        await this.deleteGame(user._id);
                        console.error("Transaction aborted:", error);
                        return fail("An error occurred during the transaction");
                    } finally {
                        session.endSession();
                    }
                });
            } catch (error) {
                await this.deleteGame(user._id);
                console.error("Error in upgrader:spin:", error);
                return fail(error.message || "An error occurred");
            }
        });

        socket.on("unboxes", () => {
            socket.emit("unboxes", {
                items: this.lastUpgrades,
                type: "upgrader",
            });
        });
        socket.on("top-unboxes", () => {
            socket.emit("top-unboxes", {
                items: this.topUpgraded,
                type: "upgrader",
            });
        });
    }

    topUpgrades(item) {
        // Check if item is in top N unboxed by its price
        if (
            this.topUpgraded.length === 0 ||
            formatPrice(this.topUpgraded.at(-1).price) < formatPrice(item.price)
        ) {
            // Insert item to correct index
            for (let i = 0; i < this.topUpgraded.length || 1; i++) {
                if ((formatPrice(this.topUpgraded[i]?.price) || 0) < formatPrice(item.price)) {
                    // Add item to index, shift array by one and slice first N elements
                    this.topUpgraded.splice(i, 0, {
                        image: item.image,
                        price: item.price,
                        marketHashName: item.marketHashName,
                        percentage: item.percentage,
                    });
                    this.topUpgraded = this.topUpgraded.slice(0, N);
                    break;
                }
            }
        }
    }

    /**
     * Simulates a live upgrader stream by randomly selecting 2 items every 30 seconds.
     */
    async fakeLiveUpgrader() {
        let counter = 0;
        let randomSeconds = null;

        const items = await GetItems();
        const cheapItems = items.filter(i => formatPrice(i.price) < 60);
        const expensiveItems = items.filter(i => formatPrice(i.price) >= 60);

        setInterval(() => {
            if (!this?.io) return;
            if (randomSeconds === null) randomSeconds = Math.floor(Math.random() * 9) + 1; // Random seconds between 1 and 9

            if (counter === randomSeconds || counter === 10 - randomSeconds) {
                // Stream a random upgrade
                const isExpensive = Math.random() < 0.05; // 5% chance to be expensive
                const targetItems = isExpensive ? expensiveItems : cheapItems;
                const randomItem = targetItems[Math.floor(Math.random() * targetItems.length)];
                if (!randomItem) return;

                this.lastUpgrades.unshift({
                    image: randomItem.image,
                    price: randomItem.price,
                    marketHashName: randomItem.marketHashName,
                    percentage: Math.random() * (100 - Number.EPSILON),
                });
                this.lastUpgrades = this.lastUpgrades.slice(0, N);

                this.topUpgrades(randomItem);

                this.io.emit("unboxes", {
                    items: this.lastUpgrades,
                    type: "upgrader",
                });

                this.io.emit("top-unboxes", {
                    items: this.topUpgraded,
                    type: "upgrader",
                });
            }

            counter++;

            if (counter >= 10) {
                counter = 0;
                randomSeconds = null;
            }
        }, 1000);
    }
}
