import Stats from "./stats.js";
import userDB from "../models/User.js";
import userDetailsDB from "../models/UserDetails.js";
import rewardsDB from "../models/Rewards.js";
import notificationsDB from "../models/Notifications.js";
import cryptoDepositsDB from "../models/Deposits/Crypto.js";
import cryptoWithdrawsDB from "../models/Withdraws/Crypto.js";
import { getEffectiveXP } from "./xpBoostPromo.js";

const USD_CAP_24H = 2000;
const DAY_MS = 24 * 60 * 60 * 1000; // 24h in ms

export default class Auth {
    static async getUserById(id, session = null) {
        const user = await userDB.findById(id, null, { session }).lean();

        if (!user) return null;

        user.experience = await getEffectiveXP(user.experience);

        if (!user.activeBalanceType) {
            user.activeBalanceType = "balance";
        }

        if (!user.sweepstakeBalance) {
            user.sweepstakeBalance = 0;
        }

        return user;
    }

    static async getUserByEmail(email) {
        const user = await userDB.findOne({ email }).lean();
        if (!user) return null;

        user.experience = await getEffectiveXP(user.experience);

        if (!user.activeBalanceType) {
            user.activeBalanceType = "balance";
        }

        if (!user.sweepstakeBalance) {
            user.sweepstakeBalance = 0;
        }

        return user;
    }

    static async registerUser(user_obj) {
        try {
            // Save userDB record
            const newUser = new userDB(user_obj);
            await newUser.save();

            // Save rewardsDB record
            const newRewards = new rewardsDB({ userId: newUser._id, history: {} });
            await newRewards.save();

            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    static async updateUser(userId, updateData) {
        try {
            // Update userDB record
            const result = await userDB.updateOne({ _id: userId }, { $set: updateData });
            if (result.modifiedCount === 0) return false;
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    static async getPublicUser(id) {
        const user = await userDB
            .findOne(
                { _id: id },
                { steamid: 1, username: 1, avatar: 1, experience: 1, registerDate: 1 },
            )
            .lean();

        if (!user) return null;

        // Calculate level based on experience
        const userEffectiveExp = await getEffectiveXP(user.experience);
        user.level = Auth.expToLevel(userEffectiveExp);
        user.experience = userEffectiveExp;

        if (!user.activeBalanceType) {
            user.activeBalanceType = "balance";
        }

        if (!user.sweepstakeBalance) {
            user.sweepstakeBalance = 0;
        }

        return user;
    }

    static async canWithdraw(id) {
        // Get total wager & deposit. Total wager must be 2x more than deposit
        const [totalWager, totalDeposit] = await Promise.all([
            Stats.getWagerAmount(id),
            Stats.getDepositAmount(id),
        ]);

        const neededWager = totalDeposit * 2 - totalWager;
        if (neededWager > 0) {
            return { status: false, amount: neededWager };
        }

        return { status: true };
    }

    /**
     * Check user's rolling 24h withdrawal usage and remaining limit.
     * Optionally pass `requestedUsd` to see if a new withdrawal fits now.
     *
     * @param {string} userId
     * @param {number} [requestedUsd=0]
     * @returns {Promise<{
     *   allowed: boolean,
     *   remainingUsd: number,
     *   usedUsd: number,
     *   windowStart: Date,
     *   windowEnd: Date,
     *   nextAvailableAt: Date | null
     * }>}
     */
    static async withdrawLimit(userId, requestedUsd = 0) {
        const now = new Date();
        const windowStart = new Date(now.getTime() - DAY_MS);

        const recent = await cryptoWithdrawsDB
            .find({
                userId: userId,
                date: { $gte: windowStart },
            })
            .select({ usdAmount: 1, date: 1, _id: 0 })
            .sort({ date: 1 })
            .lean();

        // Sum USD used in the rolling window
        const usedUsd = recent.reduce((sum, w) => sum + Number(w.usdAmount || 0), 0);
        const remainingUsd = Math.max(0, USD_CAP_24H - usedUsd);

        // If already within cap, it's allowed if the request fits in the remainder
        if (remainingUsd >= requestedUsd) {
            return {
                allowed: true,
                remainingUsd,
                usedUsd,
                windowStart,
                windowEnd: now,
                nextAvailableAt: null, // No wait needed
            };
        }

        // Otherwise, compute when enough of the 24h window expires to free up room.
        // We remove the oldest withdrawals until usage <= (cap - requestedUsd).
        const targetUsage = USD_CAP_24H - requestedUsd;
        let runningPrefix = 0;
        let nextAvailableAt = null;

        for (let i = 0; i < recent.length; i++) {
            runningPrefix += Number(recent[i].usdAmount || 0);
            const usageAfterDroppingOldestUpToI = usedUsd - runningPrefix;

            if (usageAfterDroppingOldestUpToI <= targetUsage) {
                // When this i-th withdrawal exits the window (date + 24h), the request fits
                nextAvailableAt = new Date(new Date(recent[i].date).getTime() + DAY_MS);
                break;
            }
        }

        // Fallback: if for some reason we didn’t break (e.g., requestedUsd is huge),
        // we must wait for the newest withdrawal to expire.
        if (!nextAvailableAt && recent.length > 0) {
            const newest = recent[recent.length - 1];
            nextAvailableAt = new Date(new Date(newest.date).getTime() + DAY_MS);
        }

        return {
            allowed: false,
            remainingUsd,
            usedUsd,
            windowStart,
            windowEnd: now,
            nextAvailableAt, // earliest time you can make the full requestedUsd withdrawal
        };
    }

    static async meetsWagerLimit(userId, requestedUsd) {
        if (requestedUsd <= 0) return false;

        const user = await userDB
            .findOne({ _id: userId }, { _id: 1, requiredWagerBalance: 1 })
            .lean();

        if (!user) return null;

        // requiredWagerBalance is 10xed the won amount from daily case,
        // so divide by 10 to get the actual won amount, that is the amount that can't be withdrawn
        // without the 10x wager

        const userBalance = this.getUserBalance(userId);
        const availableBalanceForWithdraw = userBalance - user.requiredWagerBalance / 10;

        if (availableBalanceForWithdraw < requestedUsd) return false;

        return true;
    }

    static async getUserActiveBalanceType(userId) {
        const user = await userDB
            .findOne({ _id: userId }, { _id: 1, activeBalanceType: 1 })
            .lean();

        return user.activeBalanceType;
    }

    static async setUserActiveBalanceType(userId, activeBalanceType) {
        await userDB.updateOne({ _id: userId }, { $set: { activeBalanceType } });
        return;
    }

    static async getUserBalance(userId, activeBalanceType = null, session = null) {
        const user = await userDB
            .findOne(
                { _id: userId },
                { _id: 1, balance: 1, activeBalanceType: 1, sweepstakeBalance: 1 },
            )
            .lean()
            .session(session);

        if (!user) return null;

        if (activeBalanceType) {
            return user[activeBalanceType];
        }

        return user[user.activeBalanceType];
    }

    static expToLevel(exp) {
        if (exp < 1000) return 0;

        let level = 0;
        let requiredExp = 1000;

        while (exp >= requiredExp) {
            exp -= requiredExp;
            level++;
            requiredExp = Math.floor(requiredExp * 1.05);
        }

        return level;
    }

    static async addEXP(userId, exp) {
        await userDB.findOneAndUpdate({ _id: userId }, { $inc: { experience: exp } });
        return;
    }

    static async getNotifications(userId) {
        const data = await notificationsDB.findOne({ userId });
        return data;
    }

    static async clearNotifications(userId) {
        await notificationsDB.updateOne({ userId }, { notifications: [] });
        return;
    }

    static async addNotification(userId, notification) {
        await notificationsDB.updateOne(
            { userId },
            {
                $push: {
                    notifications: {
                        $each: [notification],
                        $position: 0,
                        $slice: 20,
                    },
                },
            },
            { upsert: true },
        );
        return;
    }

    static async updateAvatar(userId, avatar) {
        await userDB.updateOne({ _id: userId }, { avatar });
        return;
    }

    static async setTradeURL(userId, url) {
        await userDB.updateOne({ _id: userId }, { tradeURL: url });
        return;
    }

    static async setEmail(userId, email) {
        await userDB.updateOne({ _id: userId }, { email });
        return;
    }

    static async getDeposits(userId) {
        const deposits = await cryptoDepositsDB.find({ userId }, { _id: 0 }).lean();
        return deposits;
    }

    static async getWithdraws(userId) {
        const withdraws = await cryptoWithdrawsDB.find({ userId }, { _id: 0 }).lean();
        return withdraws;
    }

    static async setClientSeed(userId, clientSeed) {
        await userDB.updateOne({ _id: userId }, { clientSeed });
        return;
    }

    static async getUserDetails(userId) {
        let details = await userDetailsDB.findOne({ userId }).lean();
        if (!details) {
            // Create default details if none exist
            const newDetails = new userDetailsDB({ userId });
            await newDetails.save();
            details = newDetails.toObject();
        }
        return details;
    }

    static async updateUserDetails(userId, updateData) {
        try {
            await userDetailsDB.updateOne({ userId }, { $set: updateData }, { upsert: true });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}
