import { randomBytes, randomInt, getRandomValues, createHmac, createHash } from "crypto";

import Auth from "../../lib/auth.js";
import userDB from "../../models/User.js";
import gamesDB from "../../models/Games.js";
import configDB from "../../models/Config.js";
import { expToLevel } from "../../lib/helpers.js";
import { GetUserByCookie } from "../../func/GetUserByCookie.js";
import { CACHE_KEYS } from "../../lib/redis/keys.js";
import { redis } from "../../lib/redis/client.js";
import { getEffectiveXP } from "../../lib/xpBoostPromo.js";

class Random {
    randomPercentage() {
        const randomBuffer = randomBytes(4);
        const randomInt = randomBuffer.readUInt32BE(0);
        const randomFloat = (randomInt / 0xffffffff) * 100;
        const roundedNum = Math.round(randomFloat * 100) / 100;
        return roundedNum;
    }

    createPercentageArray(size = 80) {
        const arr = [];
        for (let i = 0; i < size; i++) {
            arr.push(this.randomPercentage());
        }
        return arr;
    }

    randomNumber(min, max) {
        return randomInt(min, max + 1);
    }

    randomFraction() {
        const arr = new Uint32Array(2);
        getRandomValues(arr);
        const mantissa = arr[0] * Math.pow(2, 20) + (arr[1] >>> 12);
        return mantissa * Math.pow(2, -52);
    }
}

export class ProvablyFair {
    constructor(endpoint = null) {
        this.endpoint = (
            endpoint ||
            process.env.EOS_API_ENDPOINT ||
            "https://eos.greymass.com"
        ).replace(/\/$/, "");
        this._infoCache = null; // { data, ts }
        this._infoCacheMs = 500; // ms
    }

    // Compute HMAC-SHA256(secret, message) -> hex
    computeHmacSha256(secret, message) {
        return createHmac("sha256", Buffer.from(secret, "utf8"))
            .update(Buffer.from(message, "utf8"))
            .digest("hex");
    }

    // SHA256 hex of input
    sha256Hex(input) {
        return createHash("sha256").update(input, "utf8").digest("hex");
    }

    // Deterministic uint32 from HMAC(secret, `${clientSeed}:${nonce}:${round}[:${publicSeed}]`)
    deriveUint32(secret, clientSeed, nonce, round, publicSeed = null) {
        const msg = publicSeed
            ? `${clientSeed}:${nonce}:${round}:${publicSeed}`
            : `${clientSeed}:${nonce}:${round}`;
        const h = this.computeHmacSha256(secret, msg);
        const slice = h.slice(0, 8);
        return (parseInt(slice, 16) >>> 0) >>> 0;
    }

    // Fisher-Yates shuffle using deterministic rng derived from seeds
    deterministicShuffle(size, secret, clientSeed, nonce, publicSeed = null) {
        const arr = Array.from({ length: size }, (_, i) => i);
        for (let i = size - 1; i > 0; i--) {
            const rnd = this.deriveUint32(secret, clientSeed, nonce, i, publicSeed);
            const j = rnd % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Generate a mines board (25 cells) with `mineCount` mines placed provably-fairly
    generateMinesBoard(serverSeed, clientSeed, nonce, mineCount, publicSeed = null) {
        if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) {
            throw new Error("mineCount must be an integer between 1 and 24");
        }
        const indices = this.deterministicShuffle(25, serverSeed, clientSeed, nonce, publicSeed);
        const minePositions = new Set(indices.slice(0, mineCount));
        const board = Array(25).fill(0);
        for (const pos of minePositions) board[pos] = 1;
        return board;
    }

    // Commitment to server seed (SHA-256 of serverSeed as hex)
    computeServerSeedCommitment(serverSeed) {
        return this.sha256Hex(serverSeed);
    }

    async getInfo() {
        const now = Date.now();
        if (this._infoCache && now - this._infoCache.ts <= this._infoCacheMs)
            return this._infoCache.data;
        const res = await fetch(`${this.endpoint}/v1/chain/get_info`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        });
        const data = await res.json();
        this._infoCache = { data, ts: now };
        return data;
    }

    async getHeadBlockId() {
        const info = await this.getInfo();
        return info?.head_block_id || null;
    }
}

export class BetsDisabled {
    constructor() {}

    async isDisabled() {
        const cached = await redis.get(CACHE_KEYS.BETS_DISABLED);
        let cachedData = null;
        if (cached) {
            try {
                cachedData = JSON.parse(cached);
            } catch (e) {
                console.error("Failed to parse cached bets disabled state:", e);
            }
        }

        // Check if cached data is valid (not expired)
        if (
            cachedData &&
            !cachedData.value &&
            cachedData.ts &&
            Date.now() - cachedData.ts < 1000 * 60 * 3
        ) {
            return false;
        }

        // Fetch fresh data from DB
        const config = await configDB.findOne({ key: "disableAllBets" });
        const isDisabled = config?.value !== false;

        if (!isDisabled) {
            await redis.set(
                CACHE_KEYS.BETS_DISABLED,
                JSON.stringify({
                    value: false,
                    ts: Date.now(),
                }),
            );
            return false;
        }

        console.log("[WARNING] All bets are disabled");
        await redis.set(
            CACHE_KEYS.BETS_DISABLED,
            JSON.stringify({
                value: true,
                ts: Date.now(),
            }),
        );
        return true;
    }
}

export default class Game extends Random {
    constructor(betsDisabled) {
        super();

        if (betsDisabled) {
            this.betsDisabled = async () => {
                return await betsDisabled();
            };
        }
    }

    async user(cookie, session = null) {
        if (!cookie) return;
        return await GetUserByCookie(cookie, session);
    }

    async addBalance(
        cookie,
        amount,
        userId = null,
        user_ = null,
        session = null,
        _activeBalanceType = null,
    ) {
        let user;

        if (cookie) {
            user = await this.user(cookie);
            if (!user) return false;
        } else if (userId) {
            user = await userDB.findOne({ _id: userId }).session(session);
            if (!user) return false;
        } else {
            user = user_;
            if (!user) return false;
        }

        if (!user.activeBalanceType) {
            user.activeBalanceType = "balance";
        }

        if (!user.sweepstakeBalance) {
            user.sweepstakeBalance = 0;
        }

        if (typeof amount !== "number") return false;

        const userBalance = user[user.activeBalanceType]; // await Auth.getUserBalance(user.steamid, null, session);
        const activeBalanceType = _activeBalanceType || user.activeBalanceType;
        if (amount < 0 && userBalance < Math.abs(amount)) return false;

        await userDB
            .updateOne(
                {
                    _id: user._id,
                },
                {
                    $inc: {
                        [activeBalanceType]: amount,
                        requiredWagerBalance: -amount * 10,
                    },
                },
            )
            .session(session);

        return true;
    }

    async addRequiredWagerAmount(cookie, amount, userId = null, user_ = null, session = null) {
        let user;

        if (cookie) {
            user = await this.user(cookie);
            if (!user) return false;
        } else if (userId) {
            user = await userDB.findOne({ _id: userId }).session(session);
            if (!user) return false;
        } else {
            user = user_;
            if (!user) return false;
        }

        if (typeof amount !== "number") return false;
        if (amount < 0) return false;

        await userDB
            // requiredWagerBalance needs to be 10x the win amount
            .updateOne({ _id: user._id }, { $inc: { requiredWagerBalance: amount * 10 } })
            .session(session);

        return true;
    }

    /**
     * Saves game to database
     * @param {Array<{ game, user, wager, earning }>} records
     * @param {import("mongoose").ClientSession} session
     */
    async saveGame(records, session = null, activeBalanceType = null) {
        records = records.map(record => {
            record.multiplier = record.earning / record.wager;
            record.date = new Date().toISOString();
            return record;
        });

        await gamesDB.insertMany(records, { session });

        // Update xp and collect notifications
        const notifications = [];
        for (const record of records) {
            const user = await userDB.findOne({ _id: record.user }).session(session);

            if (activeBalanceType !== "balance") {
                await userDB.updateOne(
                    { _id: record.user },
                    { $inc: { experience: record.wager * 10 } },
                    { session: session },
                );
            }

            // Check and prepare notifications
            const userEffectiveExp = await getEffectiveXP(user.experience);
            const userLevel = expToLevel(userEffectiveExp);
            const modifiedUserLevel = expToLevel(userEffectiveExp + record.wager * 10);
            if (userLevel !== modifiedUserLevel) {
                notifications.push({
                    userId: record.user,
                    notification: {
                        date: Date.now(),
                        title: "Level Up!",
                        message: `You have reached level ${modifiedUserLevel}`,
                    },
                });
            }
        }

        for (const { userId, notification } of notifications) {
            try {
                await Auth.addNotification(userId, notification);
            } catch (error) {
                console.error("Failed to send notification:", error);
                // No need to throw error when sending notifications fails
            }
        }

        return true;
    }

    // Announce live bet
    async announce(io, socket, data, type = "live-bets") {
        try {
            if (data) {
                const now = Date.now();
                const betDataStr = JSON.stringify(data);

                // Get current count
                const count = await redis.zcard(CACHE_KEYS.LIVE_BETS);

                // If count is 9 or more, remove all except the latest 9
                if (count > 9) {
                    const toRemove = count - 9; // Number of elements to remove to leave 9
                    await redis.zremrangebyrank(CACHE_KEYS.LIVE_BETS, 0, toRemove - 1);
                }

                // Add the new bet
                await redis.zadd(CACHE_KEYS.LIVE_BETS, now, betDataStr);

                // Clean up bets older than 1 hour (3600000 ms)
                await redis.zremrangebyscore(CACHE_KEYS.LIVE_BETS, 0, now - 3600000);
            }
            // Get the latest 10 bets (newest first)
            const latestBetsRaw = await redis.zrange(CACHE_KEYS.LIVE_BETS, -10, -1, "REV");
            const betsToAnnounce = latestBetsRaw.map(bet => JSON.parse(bet));
            if (io) io.emit(type, betsToAnnounce);
            else if (socket) socket.emit(type, betsToAnnounce);
        } catch (error) {
            console.error("Error handling live bets:", error);
            if (io) io.emit(type, []);
            else if (socket) socket.emit(type, []);
        }
    }

    // User notification
    async notification(userId, { title, message }) {
        await Auth.addNotification(userId, {
            date: Date.now(),
            title,
            message,
        });
    }

    rateLimit(socket, event) {
        if (!socket.limiter) return true; // No rate limiter set

        if (!socket.limiter.isAllowed(socket, event)) {
            socket.emit(event, {
                status: false,
                message: "Please wait a moment.",
            });
            return false;
        }

        return true;
    }
}
