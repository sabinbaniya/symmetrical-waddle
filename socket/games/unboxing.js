/**
 * How it works ***********************************************
 *
 *   An array of items is created from the case data.
 *   A random "force" value is created between n and m.
 *     n > arrLength - 40 & m < arrLength - 20
 *   Force is used to determine the item that will be selected.
 */
import Game, { ProvablyFair } from "./game.js";
import GamesDB from "../../models/Games.js";
import Rewards from "../../lib/rewards.js";
import casesDB from "../../models/Cases.js";
import GetCase from "../../func/GetCase.js";
import GetCases from "../../func/GetCases.js";
import { formatPrice } from "../../lib/helpers.js";
import Affiliate from "../../lib/affiliate.js";
import PendingPayout from "../../models/PendingPayouts.js";
import User from "../../models/User.js";
import mongoose from "mongoose";
import { redis } from "../../lib/redis/client.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";

const ALLOWED_SPINNER_AMOUNTS = [1, 2, 3, 4];
const SPIN_DURATION = 4300;
const N = 5;
const MAX_WIN_USD = 5_000;

export default class Unboxing extends Game {
    constructor(betsDisabled) {
        super(betsDisabled);
        this.resultArrayLength = 100;
        this.pf = new ProvablyFair();
        this.initializeRedis().then(() => {
            this.fakeLiveUnboxing();
            this.startPendingPayoutProcessor();
            this.startDelayedJobProcessor();
        });
    }

    async initializeRedis() {
        try {
            // Initialize empty arrays if they don't exist
            const lastUnboxed = await this.getLastUnboxed();
            if (!lastUnboxed) {
                await this.setLastUnboxed([]);
            }
            const topUnboxed = await this.getTopUnboxed();
            if (!topUnboxed) {
                await this.setTopUnboxed([]);
            }
            // Initialize delayed jobs set if it doesn't exist
            const exists = await redis.exists(CACHE_KEYS.UNBOXING_DELAYED_JOBS);
            if (!exists) {
                await redis.zadd(CACHE_KEYS.UNBOXING_DELAYED_JOBS, 0, ""); // Initialize empty set
                await redis.zrem(CACHE_KEYS.UNBOXING_DELAYED_JOBS, ""); // Remove the dummy entry
            }
        } catch (e) {
            console.error("Error initializing Redis for Unboxing:", e);
        }
    }

    async getLastUnboxed() {
        try {
            const cached = await redis.get(CACHE_KEYS.UNBOXING_LAST_UNBOXED);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            console.error("Error getting last unboxed:", e);
            return [];
        }
    }

    async setLastUnboxed(items) {
        try {
            await redis.set(CACHE_KEYS.UNBOXING_LAST_UNBOXED, JSON.stringify(items));
        } catch (e) {
            console.error("Error setting last unboxed:", e);
        }
    }

    async getTopUnboxed() {
        try {
            const cached = await redis.get(CACHE_KEYS.UNBOXING_TOP_UNBOXED);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            console.error("Error getting top unboxed:", e);
            return [];
        }
    }

    async setTopUnboxed(items) {
        try {
            await redis.set(CACHE_KEYS.UNBOXING_TOP_UNBOXED, JSON.stringify(items));
        } catch (e) {
            console.error("Error setting top unboxed:", e);
        }
    }

    async updateLastUnboxed(newItems) {
        let currentItems = await this.getLastUnboxed();
        currentItems.unshift(...newItems);
        currentItems = currentItems.slice(0, N);
        await this.setLastUnboxed(currentItems);
        return currentItems;
    }

    isValidCaseId(caseId) {
        // Validate free-case
        if (caseId === "free-case") return true;
        // Validate level cases
        const levelCaseRegex = /^level-(\d+)$/;
        if (levelCaseRegex.test(caseId)) {
            const level = parseInt(caseId.replace("level-", ""));
            return level > 0 && level <= 10_000; // Assuming reasonable level bounds
        }
        // Validate regular case IDs (alphanumeric with some special chars)
        const regularCaseRegex = /^[a-zA-Z0-9-_]+$/;
        if (regularCaseRegex.test(caseId)) {
            return caseId.length <= 100; // Reasonable length limit
        }
        return false;
    }

    validateAndDecodeCaseId(encodedCaseId) {
        if (typeof encodedCaseId !== "string" || encodedCaseId.trim().length === 0) {
            throw new Error("Invalid case ID format");
        }
        if (encodedCaseId.length > 200) {
            throw new Error("Case ID too long");
        }
        // Check for potentially dangerous encoded characters
        if (
            encodedCaseId.includes("%00") || // null byte
            encodedCaseId.includes("%2f") || // forward slash
            encodedCaseId.includes("%5c") || // backslash
            encodedCaseId.includes("%2e%2e") || // .. (path traversal)
            encodedCaseId.includes("%25")
        ) {
            // percent sign (could be used for double encoding)
            throw new Error("Invalid characters in case ID");
        }
        let decodedCaseId;
        try {
            decodedCaseId = decodeURIComponent(encodedCaseId.trim());
        } catch (e) {
            throw new Error("Invalid URL encoding in case ID");
        }
        if (!this.isValidCaseId(decodedCaseId)) {
            throw new Error("Invalid case ID format after decoding");
        }
        return decodedCaseId;
    }

    percentageToItem(percentage, items) {
        let cumulative = 0;
        const cumulativeDistribution = items.map(item => {
            cumulative += item.percentage;
            return { ...item, cumulative };
        });
        return cumulativeDistribution.find(item => percentage <= item.cumulative);
    }

    async start(caseID, case__ = null, pfContext = null) {
        try {
            // Get the case
            let case_;
            if (case__) {
                case_ = case__;
            } else {
                try {
                    case_ = await GetCase(caseID);
                } catch (e) {
                    console.error(`Error fetching case ${caseID}:`, e);
                    return { status: false, message: "Error loading case" };
                }
            }

            // Validate case
            if (!case_ || !case_.items?.length) {
                return { status: false, message: "Invalid case" };
            }

            const items = case_.items;

            // Validate items have prices
            if (items.filter(i => i.price).length !== items.length) {
                console.error(`Case ${caseID} contains items without price`);
                return { status: false, message: "Case contains invalid items" };
            }

            // Create percentage array (deterministic if PF context provided)
            let percentages;
            try {
                if (
                    pfContext &&
                    pfContext.serverSeed &&
                    pfContext.clientSeed &&
                    pfContext.nonce != null
                ) {
                    // Deterministically generate 0..100 percentages using HMAC-based RNG
                    percentages = Array.from({ length: this.resultArrayLength }, (_, i) => {
                        const u32 = this.pf.deriveUint32(
                            pfContext.serverSeed,
                            pfContext.clientSeed,
                            pfContext.nonce,
                            i + 1,
                        );
                        const percent = ((u32 % 1_000_000) / 1_000_000) * 100;
                        return Math.round(percent * 100) / 100;
                    });
                } else {
                    percentages = this.createPercentageArray(this.resultArrayLength);
                }
            } catch (e) {
                console.error(`Error creating percentage array for case ${caseID}:`, e);
                return { status: false, message: "Error calculating probabilities" };
            }

            // Build result items
            const resultItems = [];
            for (let i = 0; i < this.resultArrayLength; i++) {
                try {
                    const item = this.percentageToItem(percentages[i], items);
                    if (!item) {
                        console.error(`Case ${caseID} contains invalid items at position ${i}`);
                        return { status: false, message: "Case contains invalid items" };
                    }
                    resultItems.push(item);
                } catch (e) {
                    console.error(`Error processing item ${i} in case ${caseID}:`, e);
                    return { status: false, message: "Error processing case items" };
                }
            }

            // Calculate force and select item
            let force, item, earning;
            try {
                const max = this.resultArrayLength - 20;
                const min = this.resultArrayLength - 40;
                if (
                    pfContext &&
                    pfContext.serverSeed &&
                    pfContext.clientSeed &&
                    pfContext.nonce != null
                ) {
                    // Deterministic force selection within [min, max]
                    const span = max - min + 1;
                    const u32 = this.pf.deriveUint32(
                        pfContext.serverSeed,
                        pfContext.clientSeed,
                        pfContext.nonce,
                        9999,
                    );
                    force = min + (u32 % span);
                } else {
                    force = Math.floor(Math.random() * (max - min + 1)) + min;
                }
                item = resultItems[force];

                // Parse the item price to calculate earning
                const priceStr = item.price.slice(1, item.price.length);
                const priceNum = parseFloat(priceStr);

                if (isNaN(priceNum)) {
                    throw new Error("Invalid item price format");
                }

                earning = Math.floor(priceNum * 100) / 100;
            } catch (e) {
                console.error(`Error selecting item from case ${caseID}:`, e);
                return { status: false, message: "Error selecting winner" };
            }

            // Prepare the result
            const result = {
                force,
                item,
                itemsArray: resultItems.map(i => ({
                    image: i.image,
                    price: i.price,
                    percentage: i.percentage,
                    marketHashName: i.marketHashName,
                })),
                earning,
            };

            return { status: true, data: result };
        } catch (e) {
            console.error(`Unexpected error in start method for case ${caseID}:`, e);
            return { status: false, message: "Unexpected error occurred" };
        }
    }

    async withLock(userId, callback, maxRetries = 3, retryDelay = 100) {
        const lockKey = `lock:unboxing:${userId}`;
        const lockValue = Math.random().toString(36).substring(2);
        const lockTimeout = 5000;
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
                    return await callback();
                } finally {
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

    async topUnboxes(results) {
        let currentTop = await this.getTopUnboxed();
        let updated = false;

        for (let i = 0; i < results.length; i++) {
            const itemPrice = formatPrice(results[i].item.price);
            if (currentTop.length < N || formatPrice(currentTop.at(-1)?.price) < itemPrice) {
                let inserted = false;
                // Create a new array to work with
                const newTop = [...currentTop];

                for (let j = 0; j < newTop.length + 1; j++) {
                    if (j === newTop.length || (formatPrice(newTop[j]?.price) || 0) < itemPrice) {
                        newTop.splice(j, 0, {
                            image: results[i].item.image,
                            price: results[i].item.price,
                            marketHashName: results[i].item.marketHashName,
                            percentage: results[i].item.percentage,
                        });
                        // Only keep top N
                        if (newTop.length > N) {
                            newTop.pop();
                        }
                        inserted = true;
                        break;
                    }
                }

                if (inserted) {
                    currentTop = newTop;
                    updated = true;
                }
            }
        }

        if (updated) {
            await this.setTopUnboxed(currentTop);
        }
    }

    async addDelayedJob(jobData, delay) {
        try {
            const executionTime = Date.now() + delay;
            const job = {
                executionTime,
                data: jobData,
            };
            await redis.zadd(CACHE_KEYS.UNBOXING_DELAYED_JOBS, executionTime, JSON.stringify(job));
        } catch (e) {
            console.error("Error adding delayed job:", e);
        }
    }

    async processDelayedJobs() {
        try {
            const now = Date.now();
            // Get all jobs with executionTime <= now
            const jobs = await redis.zrangebyscore(CACHE_KEYS.UNBOXING_DELAYED_JOBS, "-inf", now);
            if (jobs.length === 0) return;

            // Process each job
            for (const jobStr of jobs) {
                try {
                    const job = JSON.parse(jobStr);
                    if (job.type === "unboxing-spin-announcement") {
                        const { user, result } = job.data;
                        if (this.io) {
                            this.announce(this.io, null, {
                                game: "Unboxing",
                                date: Date.now(),
                                pfp: user.avatar,
                                user: user.username,
                                payout: result.totalEarning,
                                wager: result.wager,
                                multiplier: result.multiplier,
                            });
                        }

                        // Update Redis with the new items
                        await this.updateLastUnboxed(result.items);

                        // topUnboxes expects an array of results, each with item and force
                        // Since we don't have the force value, we'll create dummy results
                        const resultsForTopUnboxes = result.items.map(item => ({
                            item: item,
                            force: 0, // Placeholder value
                        }));

                        await this.topUnboxes(resultsForTopUnboxes);

                        // Get current values from Redis for broadcast
                        const lastUnboxed = await this.getLastUnboxed();
                        const topUnboxed = await this.getTopUnboxed();

                        if (this.io) {
                            // Make sure io is available
                            this.io.emit("unboxes", {
                                items: lastUnboxed,
                                type: "unboxing",
                            });
                            this.io.emit("top-unboxes", {
                                items: topUnboxed,
                                type: "unboxing",
                            });
                        }
                    }
                } catch (e) {
                    console.error("Error processing delayed job:", e);
                }
            }

            // Remove processed jobs
            await redis.zremrangebyscore(CACHE_KEYS.UNBOXING_DELAYED_JOBS, "-inf", now);
        } catch (e) {
            console.error("Error in processDelayedJobs:", e);
        }
    }

    startDelayedJobProcessor() {
        // Run immediately to catch any missed jobs
        this.processDelayedJobs().catch(e =>
            console.error("Error in initial delayed job processing:", e),
        );

        // Then run every second
        setInterval(async () => {
            try {
                await this.processDelayedJobs();
            } catch (e) {
                console.error("Error in delayed job processor:", e);
            }
        }, 1000);
    }

    listen(io, socket) {
        this.io = io;
        socket.on("unboxing:demo-spin", async data => {
            if (!this.rateLimit(socket, "unboxing:demo-spin")) return;
            if (await this.betsDisabled()) {
                return socket.emit("unboxing:demo-spin", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }
            if (data.caseID?.includes("level") || data.caseID === "free-case")
                return socket.emit("unboxing:demo-spin", {
                    status: false,
                    message: "You cannot demo spin level cases",
                });
            if (!ALLOWED_SPINNER_AMOUNTS.includes(data.spinnerAmount))
                return socket.emit("unboxing:demo-spin", {
                    status: false,
                    message: "Invalid amount",
                });
            try {
                data.caseID = this.validateAndDecodeCaseId(data?.caseID);
            } catch (err) {
                return socket.emit("unboxing:demo-spin", {
                    status: false,
                    message: err.message || "Invalid case ID",
                });
            }
            const results = [];
            let _status = true,
                _message;
            let totalEarning = 0;
            for (let i = 0; i < data.spinnerAmount; i++) {
                const { data: result, status, message } = await this.start(data.caseID);
                if (!status) {
                    _status = false;
                    _message = message;
                    break;
                }
                results.push(result);
                totalEarning += result.earning;
            }
            if (!_status)
                return socket.emit("unboxing:demo-spin", { status: _status, message: _message });
            socket.emit("unboxing:demo-spin", {
                status: _status,
                data: { pools: results, earning: totalEarning },
            });
        });

        socket.on("unboxing:spin", async data => {
            if (await this.betsDisabled()) {
                return socket.emit("unboxing:spin", {
                    status: false,
                    message: "Bets are currently disabled",
                });
            }
            if (!this.rateLimit(socket, "unboxing:spin")) return;
            const isLevelCase = data.caseID?.startsWith("level-");
            const isFreeCase = data.caseID === "free-case";
            const user = await this.user(socket.cookie);
            if (!user)
                return socket.emit("unboxing:spin", { status: false, message: "Invalid user" });
            if (
                !ALLOWED_SPINNER_AMOUNTS.includes(data.spinnerAmount) ||
                ((isLevelCase || isFreeCase) && data.spinnerAmount !== 1)
            )
                return socket.emit("unboxing:spin", {
                    status: false,
                    message: "Invalid amount",
                });
            try {
                data.caseID = this.validateAndDecodeCaseId(data?.caseID);
            } catch (err) {
                return socket.emit("unboxing:spin", {
                    status: false,
                    message: err.message || "Invalid case ID",
                });
            }
            let case_ = await GetCase(data.caseID);
            if (!case_ || !case_.items?.length) {
                case_ = await GetCase(data.caseID, true);
                if (!case_ || !case_.items?.length) {
                    return socket.emit("unboxing:spin", {
                        status: false,
                        message: "Invalid case",
                    });
                }
            }
            const casePrice = case_.price;
            // Require clientSeed for PF
            if (!data.clientSeed || typeof data.clientSeed !== "string") {
                return socket.emit("unboxing:spin", {
                    status: false,
                    message: "clientSeed is required",
                });
            }
            const session = await mongoose.startSession();
            // PF variables captured for post-spin reveal
            let _serverSeed = null;
            let _serverSeedCommitment = null;
            let _clientSeed = data.clientSeed;
            let _nonce = null;
            try {
                const result = await this.withLock(user.steamid, async () => {
                    session.startTransaction();
                    let pendingPayout;
                    try {
                        const updatedUser = await this.user(socket.cookie, session);
                        if (!updatedUser) {
                            throw new Error("Invalid user");
                        }
                        let rewardResponse;
                        if (isLevelCase) {
                            const levelStr = data.caseID.replace("level-", "");
                            const level = parseInt(levelStr, 10);

                            if (isNaN(level) || level <= 0 || level > 10000) {
                                throw new Error("Invalid level number extracted from case ID");
                            }

                            rewardResponse = await Rewards.dailyCases(user._id, level, session);
                            if (!rewardResponse?.status) {
                                throw new Error(
                                    rewardResponse.message || "Failed to claim daily case reward",
                                );
                            }
                        }
                        // NOTE: free case is disabled for now
                        // else if (isFreeCase) {
                        //     rewardResponse = await Rewards.freeCases(user.steamid, true, session);
                        //     if (!rewardResponse?.status) {
                        //         throw new Error(
                        //             rewardResponse.message || "Failed to claim free case reward",
                        //         );
                        //     }
                        // }
                        if (
                            (updatedUser[updatedUser.activeBalanceType] <
                                casePrice * data.spinnerAmount ||
                                casePrice * data.spinnerAmount <= 0) &&
                            !isLevelCase &&
                            !isFreeCase
                        ) {
                            throw new Error("Insufficient balance");
                        }
                        const serverSeed = this.randomBytes
                            ? this.randomBytes(32).toString("hex")
                            : (await import("crypto")).randomBytes(32).toString("hex");
                        const nonce = await redis.incr(
                            CACHE_KEYS.GAMES_UNBOXING_NONCE_BY_USER(user._id.toString()),
                        );
                        const serverSeedCommitment =
                            this.pf.computeServerSeedCommitment(serverSeed);
                        const pfStart = {
                            serverSeedCommitment,
                            clientSeed: data.clientSeed,
                            nonce,
                        };
                        socket.emit("unboxing:pf", pfStart);
                        // capture for later reveal
                        _serverSeed = serverSeed;
                        _serverSeedCommitment = serverSeedCommitment;
                        _nonce = nonce;

                        const results = [];
                        let totalEarning = 0;
                        for (let i = 0; i < data.spinnerAmount; i++) {
                            const {
                                data: result,
                                status,
                                message,
                            } = await this.start(null, case_, pfStart);
                            if (!status) {
                                throw new Error(message || "An error occurred during spin");
                            }
                            results.push(result);
                            totalEarning += result.earning;
                        }

                        if (totalEarning > MAX_WIN_USD) {
                            totalEarning = MAX_WIN_USD;
                        }

                        const betAmount =
                            isLevelCase || isFreeCase ? 0 : casePrice * data.spinnerAmount;
                        pendingPayout = new PendingPayout({
                            userId: user._id,
                            betAmount,
                            multiplier: betAmount > 0 ? totalEarning / betAmount : totalEarning,
                            payoutAmount: totalEarning,
                            game: "unboxing",
                            gameData: {
                                caseId: data.caseID,
                                spinnerAmount: data.spinnerAmount,
                                results: results.map(r => ({
                                    item: r.item,
                                    force: r.force,
                                })),
                            },
                            status: "pending",
                            scheduledFor: new Date(),
                            playedWithBalanceType: updatedUser.activeBalanceType,
                        });
                        await pendingPayout.save({ session });
                        let balanceResponse;
                        if (isLevelCase || isFreeCase) {
                            if (updatedUser.activeBalanceType === "sweepstake") {
                                await Affiliate.update("bonus", user._id, totalEarning, {
                                    session,
                                });
                            }

                            if (isFreeCase) {
                                await this.addRequiredWagerAmount(
                                    socket.cookie,
                                    totalEarning,
                                    null,
                                    null,
                                    session,
                                );
                            }

                            balanceResponse = await this.addBalance(
                                socket.cookie,
                                totalEarning,
                                null,
                                null,
                                session,
                            );
                        } else {
                            balanceResponse = await this.addBalance(
                                socket.cookie,
                                totalEarning - betAmount,
                                null,
                                null,
                                session,
                            );
                        }
                        if (!balanceResponse) {
                            throw new Error("Balance update failed");
                        }
                        await casesDB.updateOne(
                            { id: data.caseID },
                            { $inc: { spins: data.spinnerAmount } },
                            { session },
                        );
                        if (!isLevelCase && !isFreeCase) {
                            await this.saveGame(
                                [
                                    {
                                        game: "unboxing",
                                        user: user._id,
                                        wager: casePrice * data.spinnerAmount,
                                        earning: totalEarning,
                                        pf: pfStart,
                                    },
                                ],
                                session,
                                user.activeBalanceType,
                            );
                            if (case_.creator && case_.creator.toString() !== user._id.toString()) {
                                try {
                                    // First verify that the creator exists
                                    const creatorExists = await User.findOne(
                                        { _id: case_.creator },
                                        null,
                                        {
                                            session,
                                        },
                                    );
                                    if (!creatorExists) {
                                        console.warn(`Creator does not exist: ${case_.creator}`);
                                    } else {
                                        let creatorShare = 0.02;
                                        if (casePrice >= 25) creatorShare = 0.03;
                                        if (casePrice >= 50) creatorShare = 0.04;
                                        let reward = Math.floor(
                                            casePrice * data.spinnerAmount * creatorShare,
                                        );
                                        const balanceResult = await this.addBalance(
                                            null,
                                            reward,
                                            case_.creator,
                                            null,
                                            session,
                                        );
                                        if (!balanceResult) {
                                            console.error(
                                                `Failed to add balance for creator ${case_.creator}`,
                                            );
                                            throw new Error("Failed to add balance for creator");
                                        }
                                    }
                                } catch (error) {
                                    console.error("Error processing creator reward:", error);
                                    throw error;
                                }
                            }
                        }
                        await session.commitTransaction();
                        pendingPayout.status = "completed";
                        await pendingPayout.save();
                        return { results, totalEarning };
                    } catch (err) {
                        if (pendingPayout) {
                            try {
                                const currentRetryCount = pendingPayout.gameData?.retryCount || 0;
                                const maxRetries = 3;
                                const isRetryableError = ![
                                    "Insufficient balance",
                                    "Invalid user",
                                    "Invalid case",
                                    "Failed to claim daily case reward",
                                    "Failed to claim free case reward",
                                ].some(msg => err.message.includes(msg));
                                pendingPayout.status =
                                    isRetryableError && currentRetryCount < maxRetries
                                        ? "pending"
                                        : "failed";
                                pendingPayout.failureReason = err.message;
                                pendingPayout.gameData = pendingPayout.gameData || {};
                                pendingPayout.gameData.retryCount = currentRetryCount + 1;
                                pendingPayout.gameData.lastRetry = new Date();
                                if (isRetryableError && currentRetryCount < maxRetries) {
                                    const retryDelay = 5 * 60 * 1000; // 5 minutes
                                    pendingPayout.scheduledFor = new Date(Date.now() + retryDelay);
                                    console.log(
                                        `Payout failed but scheduled for retry (attempt ${currentRetryCount + 1}/${maxRetries})`,
                                    );
                                } else {
                                    console.log(
                                        `Payout failed and will not be retried automatically (attempts: ${currentRetryCount + 1}, error: ${err.message})`,
                                    );
                                }
                                await pendingPayout.save({ session });
                            } catch (saveErr) {
                                console.error("Failed to update pending payout status:", saveErr);
                            }
                        }
                        await session.abortTransaction();
                        throw err;
                    }
                });
                socket.emit("unboxing:spin", {
                    status: true,
                    data: { pools: result.results, earning: result.totalEarning },
                });

                // Replace setTimeout with addDelayedJob
                await this.addDelayedJob(
                    {
                        type: "unboxing-spin-announcement",
                        user: {
                            avatar: user.avatar,
                            username: user.username,
                        },
                        result: {
                            totalEarning: result.totalEarning,
                            wager: casePrice * data.spinnerAmount,
                            multiplier: result.totalEarning / (casePrice * data.spinnerAmount),
                            items: result.results.map(i => ({
                                image: i.item.image,
                                price: i.item.price,
                                marketHashName: i.item.marketHashName,
                                percentage: i.item.percentage,
                            })),
                        },
                    },
                    SPIN_DURATION,
                );

                // Reveal proof after ~4 seconds regardless of animation length
                setTimeout(async () => {
                    try {
                        if (_serverSeed && _serverSeedCommitment) {
                            socket.emit("unboxing:proof", {
                                serverSeed: _serverSeed,
                                serverSeedCommitment: _serverSeedCommitment,
                                clientSeed: _clientSeed,
                                nonce: _nonce,
                            });
                            await GamesDB.updateOne(
                                {
                                    user: user._id,
                                    game: "unboxing",
                                    "pf.serverSeedCommitment": _serverSeedCommitment,
                                },
                                { $set: { "pf.serverSeed": _serverSeed } },
                            );
                        }
                    } catch {}
                }, 4000);
            } catch (err) {
                console.error("Error during unboxing:", err);
                await session.abortTransaction();
                socket.emit("unboxing:spin", {
                    status: false,
                    message: err.message || "An error occurred",
                });
            } finally {
                session.endSession();
            }
        });

        socket.on("unboxes", async () => {
            const lastUnboxed = await this.getLastUnboxed();
            socket.emit("unboxes", {
                items: lastUnboxed,
                type: "unboxing",
            });
        });

        socket.on("top-unboxes", async () => {
            const topUnboxed = await this.getTopUnboxed();
            socket.emit("top-unboxes", {
                items: topUnboxed,
                type: "unboxing",
            });
        });
    }

    async fakeLiveUnboxing() {
        let counter = 0;
        let randomSeconds = null;
        const cases = await GetCases();
        setInterval(async () => {
            if (!this?.io) return;
            if (randomSeconds === null) randomSeconds = Math.floor(Math.random() * 9) + 1;
            if (counter === randomSeconds || counter === 10 - randomSeconds) {
                // Stream a random unboxing
                const randomCase = cases[Math.floor(Math.random() * cases.length)];
                if (!randomCase) return;
                // Simulate opening the case
                this.start(randomCase.id).then(async result => {
                    if (!result?.data?.item) return;

                    await this.updateLastUnboxed([
                        {
                            image: result.data.item.image,
                            price: result.data.item.price,
                            marketHashName: result.data.item.marketHashName,
                            percentage: result.data.item.percentage,
                        },
                    ]);

                    await this.topUnboxes([result.data]);

                    const lastUnboxed = await this.getLastUnboxed();
                    const topUnboxed = await this.getTopUnboxed();
                    this.io.emit("unboxes", {
                        items: lastUnboxed,
                        type: "unboxing",
                    });
                    this.io.emit("top-unboxes", {
                        items: topUnboxed,
                        type: "unboxing",
                    });
                });
            }
            counter++;
            if (counter >= 10) {
                counter = 0;
                randomSeconds = null;
            }
        }, 1000);
    }

    async processPendingPayouts() {
        try {
            console.log("Processing pending payouts...");
            const now = new Date();
            const pendingPayouts = await PendingPayout.find({
                game: "unboxing",
                status: "pending",
                scheduledFor: { $lte: now },
                "gameData.retryCount": { $exists: true },
            }).limit(10);
            if (pendingPayouts.length === 0) {
                console.log("No pending payouts to process");
                return;
            }
            console.log(`Found ${pendingPayouts.length} pending payouts to process`);
            for (const pendingPayout of pendingPayouts) {
                try {
                    const { userId, gameData, playedWithBalanceType } = pendingPayout;
                    const { caseId, spinnerAmount, retryCount = 0 } = gameData || {};
                    // Validate caseId format before processing
                    if (typeof caseId !== "string" || !this.isValidCaseId(caseId)) {
                        console.error(
                            `Invalid case ID format in payout ${pendingPayout._id}: ${caseId}`,
                        );
                        pendingPayout.status = "failed";
                        pendingPayout.failureReason = "Invalid case ID format";
                        await pendingPayout.save();
                        continue;
                    }
                    if (!userId || !caseId || spinnerAmount === undefined) {
                        console.error("Invalid pending payout data:", pendingPayout);
                        pendingPayout.status = "failed";
                        pendingPayout.failureReason = "Invalid payout data";
                        await pendingPayout.save();
                        continue;
                    }
                    console.log(
                        `Processing retry for payout ${pendingPayout._id} (attempt ${retryCount + 1})`,
                    );
                    const session = await mongoose.startSession();
                    try {
                        session.startTransaction();
                        const case_ = await GetCase(caseId);
                        if (!case_ || !case_.items?.length) {
                            throw new Error("Invalid case");
                        }
                        const user = await User.findById(userId, { session });
                        if (!user) {
                            throw new Error("Invalid user");
                        }
                        const isLevelCase = caseId.startsWith("level-");
                        const isFreeCase = caseId === "free-case";
                        const casePrice = case_.price;
                        const betAmount = isLevelCase || isFreeCase ? 0 : casePrice * spinnerAmount;
                        // For retries, we need to check eligibility again if it's a free/level case
                        if (isLevelCase) {
                            const response = await Rewards.dailyCases(
                                userId,
                                parseInt(caseId.replace("level-", "")),
                                session,
                            );
                            if (!response?.status) {
                                // If the retry fails because they already claimed, we should not retry again
                                if (response.message.includes("already claimed")) {
                                    pendingPayout.status = "failed";
                                    pendingPayout.failureReason = "Already claimed";
                                    await pendingPayout.save({ session });
                                    await session.abortTransaction();
                                    return;
                                }
                                throw new Error(
                                    response.message ||
                                        "Failed to claim daily case reward during retry",
                                );
                            }
                        }
                        // Note: free case is disabled for now
                        // else if (isFreeCase) {
                        //     const response = await Rewards.freeCases(userId, null, session);
                        //     if (!response?.status) {
                        //         // If the retry fails because they already claimed, we should not retry again
                        //         if (response.message.includes("already claimed")) {
                        //             pendingPayout.status = "failed";
                        //             pendingPayout.failureReason = "Already claimed";
                        //             await pendingPayout.save({ session });
                        //             await session.abortTransaction();
                        //             return;
                        //         }
                        //         throw new Error(
                        //             response.message ||
                        //                 "Failed to claim free case reward during retry",
                        //         );
                        //     }
                        // }
                        const results = [];
                        let totalEarning = 0;
                        for (let i = 0; i < spinnerAmount; i++) {
                            const { data: result } = await this.start(null, case_);
                            results.push(result);
                            totalEarning += result.earning;
                        }

                        if (totalEarning > MAX_WIN_USD) {
                            totalEarning = MAX_WIN_USD;
                        }

                        pendingPayout.gameData.results = results.map(r => ({
                            item: r.item,
                            force: r.force,
                        }));
                        pendingPayout.payoutAmount = totalEarning;
                        pendingPayout.multiplier =
                            betAmount > 0 ? totalEarning / betAmount : totalEarning;

                        if (!isLevelCase && !isFreeCase) {
                            // const currentBalance = user.balance;
                            const currentBalance = user[playedWithBalanceType] || 0;
                            if (currentBalance < betAmount) {
                                throw new Error("Insufficient balance during retry");
                            }
                        }
                        let balanceResponse;
                        if (isLevelCase || isFreeCase) {
                            if (playedWithBalanceType === "sweepstakeBalance") {
                                await Affiliate.update("bonus", userId, totalEarning, { session });
                            }

                            if (isFreeCase) {
                                await this.addRequiredWagerAmount(
                                    socket.cookie,
                                    totalEarning,
                                    null,
                                    null,
                                    session,
                                );
                            }

                            balanceResponse = await this.addBalance(
                                null,
                                totalEarning,
                                userId,
                                null,
                                session,
                                playedWithBalanceType,
                            );
                        } else {
                            balanceResponse = await this.addBalance(
                                null,
                                totalEarning - betAmount,
                                userId,
                                null,
                                session,
                                playedWithBalanceType,
                            );
                        }
                        if (!balanceResponse) {
                            throw new Error("Balance update failed during retry");
                        }
                        await casesDB.updateOne(
                            { id: caseId },
                            { $inc: { spins: spinnerAmount } },
                            { session },
                        );
                        if (!isLevelCase && !isFreeCase) {
                            try {
                                await this.saveGame(
                                    [
                                        {
                                            game: "unboxing",
                                            user: userId,
                                            wager: betAmount,
                                            earning: totalEarning,
                                        },
                                    ],
                                    session,
                                    playedWithBalanceType,
                                );
                                if (case_.creator && userId.toString() !== case_.creator.toString()) {
                                    try {
                                        // First verify that the creator exists
                                        const creatorExists = await User.findById(case_.creator, {
                                            session,
                                        });
                                        if (!creatorExists) {
                                            console.warn(
                                                `Creator does not exist: ${case_.creator}`,
                                            );
                                        } else {
                                            let creatorShare = 0.02;
                                            if (casePrice >= 25) creatorShare = 0.03;
                                            if (casePrice >= 50) creatorShare = 0.04;
                                            let reward = Math.floor(
                                                casePrice * spinnerAmount * creatorShare,
                                            );

                                            const balanceResult = await this.addBalance(
                                                null,
                                                reward,
                                                case_.creator,
                                                null,
                                                session,
                                                case_.usedBalanceType,
                                            );
                                            if (!balanceResult) {
                                                console.error(
                                                    `Failed to add balance for creator ${case_.creator}`,
                                                );
                                                throw new Error(
                                                    "Failed to add balance for creator",
                                                );
                                            }
                                        }
                                    } catch (error) {
                                        console.error(
                                            "Error processing creator reward during retry:",
                                            error,
                                        );
                                        throw error;
                                    }
                                }
                            } catch (err) {
                                console.error("Failed to save game history for retry:", err);
                                // We don't rethrow this error because the main operations succeeded
                            }
                        }
                        pendingPayout.status = "completed";
                        pendingPayout.failureReason = null;
                        pendingPayout.gameData.retryCount =
                            (pendingPayout.gameData.retryCount || 0) + 1;
                        pendingPayout.scheduledFor = undefined;
                        await pendingPayout.save({ session });
                        await session.commitTransaction();
                        console.log(`Successfully processed retry for payout ${pendingPayout._id}`);
                    } catch (err) {
                        await session.abortTransaction();
                        console.error(
                            `Failed to process retry for payout ${pendingPayout._id}:`,
                            err.message,
                        );
                        const currentRetryCount = pendingPayout.gameData?.retryCount || 0;
                        const maxRetries = 3;
                        pendingPayout.status =
                            currentRetryCount < maxRetries ? "pending" : "failed";
                        pendingPayout.failureReason = err.message;
                        pendingPayout.gameData = pendingPayout.gameData || {};
                        pendingPayout.gameData.retryCount = currentRetryCount + 1;
                        pendingPayout.gameData.lastRetry = new Date();
                        if (currentRetryCount < maxRetries) {
                            const retryDelay = Math.min(
                                5 * 60 * 1000 * Math.pow(2, currentRetryCount),
                                24 * 60 * 60 * 1000,
                            );
                            pendingPayout.scheduledFor = new Date(Date.now() + retryDelay);
                            console.log(
                                `Scheduled next retry for ${new Date(Date.now() + retryDelay)} (attempt ${currentRetryCount + 2})`,
                            );
                        }
                        await pendingPayout.save();
                    } finally {
                        session.endSession();
                    }
                } catch (err) {
                    console.error(`Error processing retry for payout ${pendingPayout._id}:`, err);
                }
            }
        } catch (err) {
            console.error("Error processing pending payouts:", err);
        }
    }

    startPendingPayoutProcessor() {
        setInterval(
            async () => {
                try {
                    await this.processPendingPayouts();
                } catch (err) {
                    console.error("Error in pending payout processor:", err);
                }
            },
            5 * 60 * 1000,
        );
        setTimeout(async () => {
            try {
                await this.processPendingPayouts();
            } catch (err) {
                console.error("Error in initial pending payout processing:", err);
            }
        }, 1000);
    }
}
