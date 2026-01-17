import Game, { ProvablyFair } from "./game.js";
import GamesDB from "../../models/Games.js";
import GetCase from "../../func/GetCase.js";
import { redis } from "../../lib/redis/client.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";
import { v4 as uuidv4 } from "uuid";
import GameplaysDB from "../../models/Gameplays.js";
import mongoose from "mongoose";
import Auth from "../../lib/auth.js";

const HE = 10 / 100; // House edge - 10%
const ALLOWED_GAMEMODES = ["1v1v1v1", "1v1v1", "1v1", "2v2"];
const MAX_CASES = 50;
const MAX_CASES_LIMIT = 2500; // $2500
const MAX_WIN_USD = 5_000;
const MAX_ROOMS = 200;
const SPIN_DURATION = 4_300;
const DELETE_GAME = 1000 * 60 * 2; // 2 minutes
const MAX_PARTICIPANTS_MAP = {
    "1v1v1v1": 4,
    "1v1v1": 3,
    "1v1": 2,
    "2v2": 4,
};

export default class Battles extends Game {
    constructor(betsDisabled) {
        super(betsDisabled);
        // Config
        this.resultArrayLength = 100;
        this.pf = new ProvablyFair();
        // Bot profile
        this.bot = {
            username: "BOT",
            avatar: "/icons/gray-bot.svg",
            steamid: "BOT",
        };
    }

    // --- PF helpers matching spec ---
    // Convert first 6 bytes of hex into fractional decimal per spec
    _pfHexToDecimalFraction(hex) {
        let decimal = 0;
        for (let i = 0; i < 6; i++) {
            const seg = hex.slice(i * 2, i * 2 + 2);
            decimal += parseInt(seg, 16) / Math.pow(256, i + 1);
        }
        return decimal;
    }

    // Compute ticket (1..qty) using HMAC-SHA256(serverSeed, `${publicSeed}-${round}-${position}`)
    _pfTicket(serverSeed, publicSeed, round, position, qty = 100000) {
        const msg = `${publicSeed}-${round}${position != null ? `-${position}` : ""}`;
        const pre = this.pf.computeHmacSha256(serverSeed, msg);
        const dec = this._pfHexToDecimalFraction(pre);
        return Math.floor(dec * qty) + 1;
    }

    async getGame(id) {
        try {
            const key = CACHE_KEYS.GAMES_BATTLES_BY_ID(id);
            const cached = await redis.get(key);
            if (cached) return JSON.parse(cached);

            const gameFromDB = await GameplaysDB.findOne({ gameID: id });
            if (gameFromDB) {
                await this.setGame(id, gameFromDB);
                return gameFromDB;
            }

            throw new Error("Game not found");
        } catch (e) {
            console.log("Battles:getGame", e);
            return null;
        }
    }

    async setGame(id, game) {
        try {
            return await redis.set(CACHE_KEYS.GAMES_BATTLES_BY_ID(id), JSON.stringify(game));
        } catch (e) {
            console.log("Battles:setGame", e);
            return null;
        }
    }

    async deleteGame(id) {
        try {
            return await redis.del(CACHE_KEYS.GAMES_BATTLES_BY_ID(id));
        } catch (e) {
            console.log("Battles:deleteGame", e);
            return null;
        }
    }

    async getCurrentGameIDs() {
        try {
            const raw = await redis.get(CACHE_KEYS.GAMES_BATTLES_IDS);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.log("Battles:getCurrentGameIDs", e);
            return [];
        }
    }

    async setCurrentGameIDs(ids) {
        try {
            return await redis.set(CACHE_KEYS.GAMES_BATTLES_IDS, JSON.stringify(ids));
        } catch (e) {
            console.log("Battles:setCurrentGameIDs", e);
            return null;
        }
    }

    async initPF(gameID) {
        try {
            const key = CACHE_KEYS.GAMES_BATTLES_BY_ID(gameID);
            const str = await redis.get(key);
            if (!str) return false;
            const game = JSON.parse(str);
            if (game?.pf?.serverSeedCommitment && game?.pf?.publicSeed) return true; // already

            const serverSeed = (await import("crypto")).randomBytes(32).toString("hex");
            const serverSeedCommitment = this.pf.computeServerSeedCommitment(serverSeed);
            const publicSeed = await this.pf.getHeadBlockId();

            game.pf = { serverSeedCommitment, publicSeed };
            // Keep plaintext serverSeed only in cache for spinning; don't persist until reveal
            game._serverSeed = serverSeed;

            await this.setGame(gameID, game);
            await GameplaysDB.updateOne(
                { gameID },
                { $set: { pf: { serverSeedCommitment, publicSeed } } },
            );
            return true;
        } catch (e) {
            console.log("Battles:initPF", e);
            return false;
        }
    }

    // Atomically push a new gameID to the list to avoid races
    async addCurrentGameID(gameID) {
        const idsKey = CACHE_KEYS.GAMES_BATTLES_IDS;
        while (true) {
            await redis.watch(idsKey);
            const raw = await redis.get(idsKey);
            const list = raw ? JSON.parse(raw) : [];
            if (!list.includes(gameID)) list.push(gameID);

            const tx = redis.multi();
            tx.set(idsKey, JSON.stringify(list));
            const res = await tx.exec();
            if (res !== null) return true;
            // conflict -> retry
        }
    }

    async removeCurrentGameID(gameID) {
        const idsKey = CACHE_KEYS.GAMES_BATTLES_IDS;
        while (true) {
            await redis.watch(idsKey);
            const raw = await redis.get(idsKey);
            const list = raw ? JSON.parse(raw) : [];
            const filtered = list.filter(id => id !== gameID);

            const tx = redis.multi();
            tx.set(idsKey, JSON.stringify(filtered));
            const res = await tx.exec();
            if (res !== null) return true;
        }
    }

    // ---------------------------
    // Game helpers
    // ---------------------------

    percentageToItem(percentage, items) {
        let cumulative = 0;
        const cumulativeDistribution = items.map(item => {
            cumulative += item.percentage;
            return { ...item, cumulative };
        });

        return cumulativeDistribution.find(item => percentage <= item.cumulative);
    }

    async extractPublicDataFromGame(gameID) {
        const game = await this.getGame(gameID);
        if (!game) return null;
        const publicData = {
            id: gameID,
            sponsor: game?.sponsor,
            participants: game.participants,
            maxParticipants: game.maxParticipants,
            avatars: game.avatars,
            status: game.status,
            names: game.names,
            cases: game.cases,
            round: game.round,
            date: game.date,
            cost: game.cost,
            items: game.items,
            forces: game.forces,
            itemPools: game.itemPools,
            isReversed: game.isReversed,
            isBot: game.isBot,
            gamemode: game.gamemode,
            prize: game.prize || 0,
            winners: game.winners || [],
            earnings: game.earnings || [],
        };
        if (game?.winners?.length) return publicData;
        // Optimize payload for ongoing games
        const itemPools_ = [...publicData.itemPools];
        const forces_ = [...publicData.forces];
        for (let i = 1; i < game.round - 1; i++) {
            itemPools_[i - 1] = [];
            forces_[i - 1] = [];
        }
        return { ...publicData, itemPools: itemPools_, forces: forces_ };
    }

    async create(user, data) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const gamesCount = (await this.getCurrentGameIDs()).length;
            if (!ALLOWED_GAMEMODES.includes(data.gamemode)) {
                await session.abortTransaction();
                return { status: false, message: "Invalid gamemode" };
            }
            if (gamesCount + 1 > MAX_ROOMS) {
                await session.abortTransaction();
                return { status: false, message: "Max rooms reached" };
            }
            // Validate cases
            if (!data?.cases?.length) {
                await session.abortTransaction();
                return { status: false, message: "You need to select at least one case" };
            }
            if (data.cases.length > MAX_CASES) {
                await session.abortTransaction();
                return { status: false, message: `Max cases amount is ${MAX_CASES}` };
            }

            let totalCaseCost = 0;
            for (let i = 0; i < data.cases.length; i++) {
                let case_ = await GetCase(data.cases[i]);
                if (!case_ || !case_.items?.length) {
                    case_ = await GetCase(data.cases[i], true);
                    if (!case_ || !case_.items?.length) {
                        await session.abortTransaction();
                        return { status: false, message: "Invalid case" };
                    }
                }

                const casePrice = parseFloat(case_.price);
                totalCaseCost += casePrice;
            }

            const cost = totalCaseCost + totalCaseCost * HE;

            // Check cost is lesser than MAX_CASES_LIMIT
            if (cost > MAX_CASES_LIMIT) {
                await session.abortTransaction();
                return { status: false, message: `Max case limit is ${MAX_CASES_LIMIT}` };
            }

            // Balance check + deduct (inside TX)
            const userBalance = await Auth.getUserBalance(user._id, null, session);
            if (userBalance < cost) {
                await session.abortTransaction();
                return { status: false, message: "Insufficient balance" };
            }
            await this.addBalance(null, -cost, user._id, null, session);
            // Construct game
            const gameID = uuidv4();
            const maxParticipants = MAX_PARTICIPANTS_MAP[data.gamemode] || 0;
            const participants = Array(maxParticipants).fill(null);
            const avatars = Array(maxParticipants).fill(null);
            const names = Array(maxParticipants).fill(null);
            participants[0] = user._id;
            avatars[0] = user.avatar;
            names[0] = user.username;
            // Fill with bots if requested
            if (data.isBot) {
                for (let i = 1; i < maxParticipants; i++) {
                    participants[i] = this.bot.steamid + (i - 1);
                    avatars[i] = this.bot.avatar;
                    names[i] = this.bot.username;
                }
            }
            const gameDoc = {
                gameID,
                participants,
                avatars,
                names,
                maxParticipants,
                cases: data.cases,
                status: "waiting",
                isPrivate: !!data.isPrivate,
                isReversed: !!data.isReversed,
                date: Date.now(),
                round: 1,
                cost: cost,
                items: [],
                itemPools: [],
                forces: [],
                gamemode: data.gamemode,
                isBot: !!data.isBot,
                isSpinning: false,
                lastUpdated: Date.now(),
                sponsor: Array(maxParticipants).fill(0), // Initialize sponsor array
                usedBalanceType: user.activeBalanceType,
            };
            // Persist to Mongo inside TX for durability
            await GameplaysDB.updateOne({ gameID }, { $set: gameDoc }, { upsert: true, session });
            await session.commitTransaction();
            session.endSession();
            // Cache to Redis (write-through) and update IDs atomically
            await this.setGame(gameID, gameDoc);
            await this.addCurrentGameID(gameID);
            // Auto start if bot-filled
            if (data.isBot) {
                setTimeout(async () => {
                    const game = await this.getGame(gameID);
                    if (!game) return;
                    game.status = "in-game";
                    await this.setGame(gameID, game);
                    // Also reflect in Mongo for consistency
                    await GameplaysDB.updateOne(
                        { gameID: gameID },
                        { $set: { status: "in-game" } },
                    );
                    await this.initPF(gameID);
                    try {
                        const g = await this.getGame(gameID);
                        if (g?.pf?.serverSeedCommitment) {
                            const pfPayload = {
                                serverSeedCommitment: g.pf.serverSeedCommitment,
                                publicSeed: g.pf.publicSeed,
                                round: g.round,
                                gameID,
                            };
                            console.log("[Battles] Emitting battles:pf", pfPayload);
                            this.io.to(gameID).emit("battles:pf", pfPayload);
                        }
                    } catch {}
                    this.spin(gameID);
                }, SPIN_DURATION);
            }
            return { status: true, gameID };
        } catch (e) {
            try {
                await session.abortTransaction();
            } catch {}
            session.endSession();
            console.log("Battles:create error", e);
            return { status: false, gameID: null, message: "Something went wrong!" };
        }
    }

    async join(user, gameID, spot = null) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Load the game doc within the TX
            const gameDoc = await GameplaysDB.findOne({ gameID }).session(session);
            if (!gameDoc) {
                await session.abortTransaction();
                return { status: false, message: "Game not found" };
            }
            // Quick validations
            const filled = gameDoc.participants.filter(p => p).length;
            if (filled >= gameDoc.maxParticipants) {
                await session.abortTransaction();
                return { status: false, message: "Game is full" };
            }
            if (gameDoc.status !== "waiting") {
                await session.abortTransaction();
                return { status: false, message: "Game already started" };
            }
            // BOT join path (no balance)
            if (user === "BOT") {
                if (
                    spot == null ||
                    spot < 0 ||
                    spot >= gameDoc.maxParticipants ||
                    gameDoc.participants[spot]
                ) {
                    await session.abortTransaction();
                    return { status: false, message: "Invalid spot" };
                }
                // Claim seat atomically: set only if seat is still null
                const update = await GameplaysDB.updateOne(
                    { gameID, [`participants.${spot}`]: null },
                    {
                        $set: {
                            [`participants.${spot}`]: this.bot.steamid + spot,
                            [`avatars.${spot}`]: this.bot.avatar,
                            [`names.${spot}`]: this.bot.username,
                        },
                    },
                    { session },
                );
                if (update.modifiedCount !== 1) {
                    await session.abortTransaction();
                    return { status: false, message: "Spot already taken" };
                }
                await session.commitTransaction();
                session.endSession();
                // Refresh Redis cache with latest doc
                const fresh = await GameplaysDB.findOne({ gameID });
                await this.setGame(gameID, fresh);
                return { status: true };
            }
            // Human user path
            // Already joined?
            if (
                gameDoc.participants.some(p => p?.toString() === user._id.toString()) &&
                process.env.NODE_ENV !== "development"
            ) {
                await session.abortTransaction();
                return { status: false, message: "You already joined" };
            }

            if (user.activeBalanceType !== gameDoc.usedBalanceType) {
                await session.abortTransaction();
                return {
                    status: false,
                    message: `Please join games that are played with ${user.activeBalanceType}`,
                };
            }

            // Determine sponsored spot
            const isSponsored = spot != null && gameDoc?.sponsor && gameDoc?.sponsor?.[spot];
            // If not sponsored, charge inside the TX
            if (!isSponsored) {
                const gameCost = gameDoc.cost;

                const userBalance = await Auth.getUserBalance(user._id, null, session);
                if (userBalance < gameCost) {
                    await session.abortTransaction();
                    return { status: false, message: "Insufficient balance" };
                }
                await this.addBalance(null, -gameCost, user._id, null, session);
            }
            // Resolve target spot
            let targetSpot = spot;
            if (targetSpot == null) {
                targetSpot = gameDoc.participants.findIndex(p => !p);
                if (targetSpot === -1) {
                    await session.abortTransaction();
                    return { status: false, message: "No empty spots" };
                }
            } else {
                if (
                    targetSpot < 0 ||
                    targetSpot >= gameDoc.maxParticipants ||
                    gameDoc.participants[targetSpot]
                ) {
                    await session.abortTransaction();
                    return { status: false, message: "Invalid spot" };
                }
            }
            // Atomically claim the seat (only if it is still null)
            const update = await GameplaysDB.updateOne(
                { gameID, [`participants.${targetSpot}`]: null },
                {
                    $set: {
                        [`participants.${targetSpot}`]: user._id,
                        [`avatars.${targetSpot}`]: user.avatar,
                        [`names.${targetSpot}`]: user.username,
                    },
                },
                { session },
            );
            if (update.modifiedCount !== 1) {
                await session.abortTransaction();
                return { status: false, message: "Spot already taken" };
            }
            await session.commitTransaction();
            session.endSession();
            // Write-through cache refresh
            const fresh = await GameplaysDB.findOne({ gameID });
            await this.setGame(gameID, fresh);
            return { status: true };
        } catch (err) {
            try {
                await session.abortTransaction();
            } catch {}
            session.endSession();
            console.error(err.message);
            return { status: false, message: "Join failed, please try again!" };
        }
    }

    async leave(user, gameID) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Load game doc inside TX
            const gameDoc = await GameplaysDB.findOne({ gameID }).session(session);
            if (!gameDoc) {
                await session.abortTransaction();
                return { status: false, message: "Game not found" };
            }
            if (gameDoc.status !== "waiting") {
                await session.abortTransaction();
                return { status: false, message: "Game already started" };
            }
            // Check if user is part of participants
            const spotIndex = gameDoc.participants.findIndex(p => p?.toString() === user._id.toString());
            if (spotIndex === -1) {
                await session.abortTransaction();
                return { status: false, message: "You are not in this game" };
            }
            // Check if the user is the creator (index 0)
            const isCreator = spotIndex === 0;
            // Check if the spot was sponsored
            const isSponsored = gameDoc.sponsor && gameDoc.sponsor[spotIndex];
            // Atomically clear only if still occupied by this user
            const update = await GameplaysDB.updateOne(
                { gameID, [`participants.${spotIndex}`]: user._id },
                {
                    $set: {
                        [`participants.${spotIndex}`]: null,
                        [`sponsor.${spotIndex}`]: 0, // Reset sponsorship if leaving
                    },
                },
                { session },
            );
            if (update.modifiedCount !== 1) {
                await session.abortTransaction();
                return { status: false, message: "Leave failed, spot already empty" };
            }
            // If the user is the creator, refund all sponsored spots
            if (isCreator) {
                if (gameDoc.sponsor) {
                    for (let i = 0; i < gameDoc.maxParticipants; i++) {
                        if (gameDoc.sponsor[i]) {
                            await this.addBalance(
                                null,
                                gameDoc.cost,
                                gameDoc.participants[0],
                                null,
                                session,
                            );
                        }
                    }
                }
            } else if (isSponsored) {
                // Refund the sponsor (creator) if the spot was sponsored
                await this.addBalance(null, gameDoc.cost, gameDoc.participants[0], null, session);
            } else {
                // Refund the leaving player if the spot was not sponsored
                await this.addBalance(null, gameDoc.cost, user._id, null, session);
            }
            await session.commitTransaction();
            session.endSession();
            // Refresh cache with latest game state
            const fresh = await GameplaysDB.findOne({ gameID });
            await this.setGame(gameID, fresh);
            return { status: true };
        } catch (err) {
            try {
                await session.abortTransaction();
            } catch {}
            session.endSession();
            return { status: false, message: err.message || "Leave failed" };
        }
    }

    async spin(gameID) {
        const gameKey = CACHE_KEYS.GAMES_BATTLES_BY_ID(gameID);

        while (true) {
            await redis.watch(gameKey);
            const gameStr = await redis.get(gameKey);
            if (!gameStr) {
                await redis.unwatch();
                return;
            }

            const game = JSON.parse(gameStr);
            if (game.isSpinning) {
                await redis.unwatch();
                return;
            }

            // Set isSpinning to true and update lastUpdated timestamp
            game.isSpinning = true;
            game.lastUpdated = Date.now();
            const multi = redis.multi();
            multi.set(gameKey, JSON.stringify(game));
            const result = await multi.exec();

            if (result === null) {
                // Transaction failed, retry
                continue;
            }

            // Successfully set isSpinning to true
            try {
                // Ensure PF is initialized
                if (
                    !game?._serverSeed ||
                    !game?.pf?.publicSeed ||
                    !game?.pf?.serverSeedCommitment
                ) {
                    await this.initPF(gameID);
                    const refreshed = await this.getGame(gameID);
                    if (refreshed) Object.assign(game, refreshed);
                }

                const serverSeed = game._serverSeed; // ephemeral
                const publicSeed = game?.pf?.publicSeed || null;

                // Process the spin deterministically (per spec)
                for (let i = 0; i < game.participants.length; i++) {
                    const resultItems = [];
                    const case_ = await GetCase(game.cases[game.round - 1]);
                    const items = case_.items;

                    // Compute ticket and map to percentage
                    const position = i + 1; // 1..4 from left to right
                    const ticketQty = 100000;
                    const ticket = this._pfTicket(
                        serverSeed,
                        publicSeed,
                        game.round,
                        position,
                        ticketQty,
                    );
                    const pct = ((ticket - 1) / ticketQty) * 100; // 0..100
                    const selectedItem = this.percentageToItem(Math.round(pct * 100) / 100, items);

                    // Build a visual pool and choose a force index near the end
                    const max = this.resultArrayLength - 20;
                    const min = this.resultArrayLength - 40;
                    const span = max - min + 1;
                    const forceSeed = this.pf.computeHmacSha256(
                        serverSeed,
                        `${publicSeed}-${game.round}-force-${position}`,
                    );
                    const force = min + (parseInt(forceSeed.slice(0, 8), 16) % span);

                    // Fill pool ensuring selected item is at `force`
                    for (let k = 0, j = 0; k < this.resultArrayLength; k++) {
                        if (k === force) {
                            resultItems[k] = selectedItem;
                        } else {
                            // cycle through items as filler
                            resultItems[k] = items[j % items.length];
                            j++;
                        }
                    }
                    const item = selectedItem;
                    if (i === 0) {
                        game.items.push([]);
                        game.forces.push([]);
                        game.itemPools.push([]);
                    }
                    game.items[game.round - 1].push(item);
                    game.forces[game.round - 1].push(force);
                    game.itemPools[game.round - 1].push(resultItems);
                }
                game.round++;
                game.isSpinning = false;
                game.lastUpdated = Date.now();

                // Persist after spin step
                await this.setGame(gameID, game);
                await GameplaysDB.updateOne(
                    { gameID },
                    {
                        $set: {
                            items: game.items,
                            forces: game.forces,
                            itemPools: game.itemPools,
                            round: game.round,
                            isSpinning: false,
                            lastUpdated: game.lastUpdated,
                        },
                    },
                );

                // Broadcast
                this.io
                    .to(gameID)
                    .emit("battles:spin", await this.extractPublicDataFromGame(gameID));
                console.log("[Battles] Emitted battles:spin", { gameID, round: game.round });

                // Next action
                if (game.round - 1 === game.cases.length) {
                    const retry = () => {
                        setTimeout(async () => {
                            const success = await this.result(gameID);
                            if (!success) {
                                retry();
                            }
                        }, SPIN_DURATION);
                    };
                    retry();
                } else {
                    // Generate a random delay between 7000 and 13000 milliseconds (7 to 13 seconds)
                    const randomDelay = Math.floor(Math.random() * (13000 - 7000 + 1)) + 7000;

                    setTimeout(() => {
                        this.spin(gameID);
                    }, randomDelay);
                }
                return;
            } catch (error) {
                console.error(`Error during spin for game ${gameID}:`, error);
                // Reset isSpinning to false and update lastUpdated
                game.isSpinning = false;
                game.lastUpdated = Date.now();
                await this.setGame(gameID, game);
                // throw error;
                return { status: false, message: "Spin failed" };
            }
        }
    }

    async result(gameID) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const game = await this.getGame(gameID);
            if (!game) return false;

            if (game.isSpinning) {
                game.isSpinning = false;
                await this.setGame(gameID, game);
            }

            game.status = "finished";
            const items = game.items;
            let winners = [];
            const earnings = [];

            for (let i = 0; i < items.length; i++) {
                for (let j = 0; j < items[i].length; j++) {
                    const earning = parseFloat(items[i][j].price.replace("$", ""));
                    if (i === 0) {
                        earnings.push(earning);
                    } else {
                        earnings[j] += earning;
                    }
                }
            }

            // Determine winners
            if (game.gamemode === "2v2") {
                const teamA = earnings[0] + earnings[1];
                const teamB = earnings[2] + earnings[3];
                if (!game.isReversed) {
                    if (teamA > teamB) winners = [game.participants[0], game.participants[1]];
                    else if (teamB > teamA) winners = [game.participants[2], game.participants[3]];
                    else
                        winners = [
                            game.participants[0],
                            game.participants[1],
                            game.participants[2],
                            game.participants[3],
                        ];
                } else {
                    if (teamA < teamB) winners = [game.participants[0], game.participants[1]];
                    else if (teamB < teamA) winners = [game.participants[2], game.participants[3]];
                    else
                        winners = [
                            game.participants[0],
                            game.participants[1],
                            game.participants[2],
                            game.participants[3],
                        ];
                }
            } else {
                const most = Math.max(...earnings);
                const least = Math.min(...earnings);

                if ((game.isReversed && least !== 0) || (!game.isReversed && most !== 0)) {
                    for (let i = 0; i < earnings.length; i++) {
                        if (
                            (game.isReversed && earnings[i] === least) ||
                            (!game.isReversed && earnings[i] === most)
                        ) {
                            winners.push(game.participants[i]);
                        }
                    }
                }
            }

            let totalEarnings = earnings.reduce((a, b) => a + b, 0);
            let prizeDollars = totalEarnings / winners.length;

            if (totalEarnings > MAX_WIN_USD) {
                totalEarnings = MAX_WIN_USD;
                prizeDollars = MAX_WIN_USD / winners.length;
            }

            // Payouts
            for (let i = 0; i < winners.length; i++) {
                const w = winners[i];
                if (typeof w === "string" && w === "BOT") continue;
                await this.addBalance(null, prizeDollars, w, null, session);
            }

            // Store prize and earnings
            await this.setGame(gameID, {
                ...game,
                winners,
                prize: prizeDollars,
                earnings: earnings,
                status: "finished",
            });

            await GameplaysDB.updateOne(
                { gameID },
                { $set: { status: "finished", winners, prize: prizeDollars, earnings: earnings } },
                { session },
            );

            // Emit event with prize in dollars + PF reveal inline (as requested)
            const resultPayload = {
                gameID,
                winners,
                prize: prizeDollars,
                serverSeed: game?._serverSeed || null,
                serverSeedCommitment: game?.pf?.serverSeedCommitment || null,
                publicSeed: game?.pf?.publicSeed || null,
                round: game.round - 1,
            };
            this.io.to(gameID).emit("battles:result", resultPayload);
            console.log("[Battles] Emitted battles:result", resultPayload);

            // Reveal PF server seed after result (immediately upon finish)
            try {
                if (game?._serverSeed && game?.pf?.serverSeedCommitment) {
                    await GameplaysDB.updateOne(
                        { gameID, "pf.serverSeedCommitment": game.pf.serverSeedCommitment },
                        { $set: { "pf.serverSeed": game._serverSeed } },
                    );
                    // Also update Games history PF with serverSeed for each participant record
                    try {
                        await GamesDB.updateMany(
                            {
                                game: "Battles",
                                "pf.serverSeedCommitment": game.pf.serverSeedCommitment,
                            },
                            { $set: { "pf.serverSeed": game._serverSeed } },
                        );
                    } catch (e) {
                        console.warn(
                            "[Battles] Failed to update GamesDB PF serverSeed",
                            e?.message || e,
                        );
                    }
                    // Emit explicit PF reveal for clients
                    const proofPayload = {
                        serverSeed: game._serverSeed,
                        serverSeedCommitment: game.pf.serverSeedCommitment,
                        publicSeed: game.pf.publicSeed,
                        round: game.round - 1,
                        gameID,
                    };
                    console.log("[Battles] Emitting battles:proof", proofPayload);
                    this.io.to(gameID).emit("battles:proof", proofPayload);
                }
            } catch {}

            // Save wager records (convert earnings and cost to dollars)
            const pfForRecord = {
                serverSeedCommitment: game?.pf?.serverSeedCommitment || "",
                publicSeed: game?.pf?.publicSeed || "",
                round: (game?.round || 1) - 1,
            };
            if (game?._serverSeed) pfForRecord.serverSeed = game._serverSeed;
            const records = [];
            for (let i = 0; i < game.participants.length; i++) {
                const u = game.participants[i];
                if (typeof u === "string" && u === "BOT") continue;
                records.push({
                    game: "Battles",
                    user: u,
                    wager: game.cost,
                    earning: earnings[i] || 0,
                    pf: pfForRecord,
                });
            }

            // Commit the transactional updates first, then write history outside TX to avoid aborts
            await session.commitTransaction();
            session.endSession();

            try {
                await this.saveGame(records, null, game.usedBalanceType);
            } catch (e) {
                console.error("[Battles] saveGame failed post-commit", e?.message || e);
            }

            // Schedule cleanup once
            setTimeout(async () => {
                try {
                    await this.deleteGame(gameID);
                    await this.removeCurrentGameID(gameID);
                } catch (err) {
                    console.error(`Failed to clean up game ${gameID}:`, err);
                }
            }, DELETE_GAME);

            return true;
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error(`Error during result processing for game ${gameID}:`, error);
            return false;
        }
    }

    listen(io, socket) {
        this.io = io;
        socket.on("battles:create", async data => {
            if (!this.rateLimit(socket, "battles:create")) return;
            if (await this.betsDisabled()) {
                return socket.emit("battles:create", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }
            const user = await this.user(socket.cookie);
            if (!user)
                return socket.emit("battles:create", { status: false, message: "Invalid user" });
            const createResponse = await this.create(user, data);
            if (!createResponse.status)
                return socket.emit("battles:create", {
                    status: false,
                    message: createResponse.message,
                });
            socket.join(createResponse.gameID);
            return socket
                .to(createResponse.gameID)
                .emit("battles:create", { status: true, gameID: createResponse.gameID });
        });
        socket.on("battles:join", async data => {
            if (!this.rateLimit(socket, "battles:join")) return;
            const user = await this.user(socket.cookie);
            if (!user)
                return socket.emit("battles:join", { status: false, message: "Invalid user" });
            const game = await this.getGame(data.gameID);
            if (!game)
                return socket.emit("battles:join", { status: false, message: "Game not found" });
            if (data?.addingBot && user._id.toString() !== game.participants[0].toString())
                return socket.emit("battles:join", {
                    status: false,
                    message: "You are not the creator of this game",
                });
            if (data?.addingBot && data?.spot == null)
                return socket.emit("battles:join", {
                    status: false,
                    message: "You need to specify a spot for the bot",
                });
            const joinResponse = await this.join(
                data?.addingBot ? "BOT" : user,
                data.gameID,
                data?.spot,
            );
            if (!joinResponse.status)
                return socket.emit("battles:join", {
                    status: false,
                    message: joinResponse.message,
                });
            // Reload to check if full and maybe start
            const updated = await this.getGame(data.gameID);
            if (
                updated.participants.filter(u => u).length === updated.maxParticipants &&
                updated.status === "waiting"
            ) {
                setTimeout(async () => {
                    const fresh = await this.getGame(data.gameID);
                    if (!fresh) return;
                    fresh.status = "in-game";
                    await this.setGame(data.gameID, fresh);
                    await GameplaysDB.updateOne(
                        { gameID: data.gameID },
                        { $set: { status: "in-game" } },
                    );
                    await this.initPF(data.gameID);
                    try {
                        const g = await this.getGame(data.gameID);
                        if (g?.pf?.serverSeedCommitment) {
                            const pfPayload = {
                                serverSeedCommitment: g.pf.serverSeedCommitment,
                                publicSeed: g.pf.publicSeed,
                                round: g.round,
                                gameID: data.gameID,
                            };
                            console.log("[Battles] Emitting battles:pf", pfPayload);
                            this.io.to(data.gameID).emit("battles:pf", pfPayload);
                        }
                    } catch {}
                    this.spin(data.gameID);
                }, 5000);
            }
            // Broadcast updated details
            io.to(data.gameID).emit(
                "battles:details",
                await this.extractPublicDataFromGame(data.gameID),
            );
            // Ensure the caller joins the room regardless of addingBot flag
            try {
                socket.join(data.gameID);
            } catch {}
            return socket.emit("battles:join", { status: true });
        });
        socket.on("battles:games", async () => {
            if (!this.rateLimit(socket, "battles:games")) return;

            const user = await this.user(socket.cookie);

            const publicGames = [];
            const gameIds = await this.getCurrentGameIDs();
            for (const gameID of gameIds) {
                const game = await this.getGame(gameID);
                if (!game || game.isPrivate) continue;

                if (user && game.usedBalanceType && game.usedBalanceType !== user.activeBalanceType)
                    continue;
                if (user && !game.usedBalanceType && user.activeBalanceType !== "balance") continue;

                publicGames.push(await this.extractPublicDataFromGame(gameID));
            }
            publicGames.sort((a, b) => b.date - a.date);

            return socket.emit("battles:games", publicGames);
        });
        socket.on("battles:details", async data => {
            if (!this.rateLimit(socket, "battles:details")) return;
            socket.join(data.gameID);
            socket.emit("battles:details", await this.extractPublicDataFromGame(data.gameID));
        });
        socket.on("battles:sponsor", async data => {
            if (!this.rateLimit(socket, "battles:sponsor")) return;
            const user = await this.user(socket.cookie);
            if (!user)
                return socket.emit("battles:sponsor", { status: false, message: "Invalid user" });
            const game = await this.getGame(data.gameID);
            if (!data?.gameID || !game)
                return socket.emit("battles:sponsor", { status: false, message: "Game not found" });
            if (data?.spot == null || data.spot < 0 || data.spot >= game.maxParticipants)
                return socket.emit("battles:sponsor", {
                    status: false,
                    message: "Invalid spot",
                });
            // Only creator can sponsor
            if (game.participants[0].toString() !== user._id.toString())
                return socket.emit("battles:sponsor", {
                    status: false,
                    message: "You are not the creator of this game",
                });
            // Check if the spot is already sponsored
            if (game.sponsor && game.sponsor[data.spot]) {
                return socket.emit("battles:sponsor", {
                    status: false,
                    message: "This spot is already sponsored",
                });
            }
            // Check if the sponsor is trying to sponsor their own spot
            if (game.participants[0].toString() === game.participants[data.spot]?.toString()) {
                return socket.emit("battles:sponsor", {
                    status: false,
                    message: "You cannot sponsor your own spot",
                });
            }
            // Reduce balance
            await this.addBalance(null, -game.cost, user._id);
            // Persist sponsor flag
            await this.setGame(data.gameID, game);
            await GameplaysDB.updateOne(
                { gameID: data.gameID },
                { $set: { sponsor: game.sponsor } },
                { upsert: true },
            );
            // Notify users in the room
            this.io
                .to(data.gameID)
                .emit("battles:details", await this.extractPublicDataFromGame(data.gameID));
            socket.emit("battles:sponsor", { status: true });
        });
    }
}
