import Auth from "./auth.js";
import Stats from "./stats.js";
import userDB from "../models/User.js";
import casesDB from "../models/Cases.js";
import gamesDB from "../models/Games.js";
import rewardsDB from "../models/Rewards.js";
import promoCodesDB from "../models/PromoCodes.js";
import { getEffectiveXP } from "./xpBoostPromo.js";

const MINIMUM_DEPOSIT = 1;
const FREE_CASES_LIMIT = 3;
const WAGER_MULTIPLIER = 0.05;
const DAY = 1000 * 60 * 60 * 24;

export default class Rewards {
    static async getRewards(userId, session = null) {
        const rewards = await rewardsDB
            .findOne({ userId }, { _id: 0, history: 1 }, { session })
            .lean();
        return rewards?.history || {};
    }

    static async getFreeCases(userId) {
        const rewards = await rewardsDB.findOne({ userId }).lean();
        const latestFreeCase = rewards?.latestFreeCase;

        if (latestFreeCase && Date.now() - latestFreeCase.getTime() >= DAY) {
            await rewardsDB.updateOne(
                { userId },
                {
                    latestFreeCase: null,
                },
            );
            return latestFreeCase;
        } else if (!latestFreeCase) {
            return 0;
        }
        return new Date(rewards.latestFreeCase).getTime() + DAY || 0;
    }

    static async claimRakebackRewards(userId, type) {
        // Check if user is eligible for the reward
        const depositAmount = await Stats.getDepositAmount(userId);
        if (depositAmount < MINIMUM_DEPOSIT) {
            return {
                status: false,
                error: `You need to deposit at least $${MINIMUM_DEPOSIT}`,
            };
        }

        let multiplier;
        switch (type) {
            case "daily":
                multiplier = 1;
                break;
            case "weekly":
                multiplier = 7;
                break;
            case "monthly":
                multiplier = 30;
                break;
        }

        const addition = DAY * multiplier;

        // Get last reward claim
        const rewards = await rewardsDB.findOne({ userId });

        if (rewards?.history?.[type]) {
            // User claimed a rewards at least one time
            // Check reward timeout
            if (Date.now() < rewards.history[type] + addition)
                return { status: false, error: "You've already claimed the prize" };
        }

        const history = rewards?.history || {};
        history[type] = Date.now();

        // Calculate reward amount
        const result = await gamesDB.aggregate([
            {
                $match: {
                    u_id: userId,
                    date: {
                        $gte: new Date(Date.now() - addition),
                        $lte: new Date(),
                    },
                },
            },
            {
                $group: {
                    _id: null, // No grouping key, total sum for all matched documents
                    totalWager: { $sum: "$wager" }, // Replace `wager` with your field name
                },
            },
        ]);

        const rewardAmount = result[0]?.totalWager * WAGER_MULTIPLIER || 0;

        // Update rewards date
        await rewardsDB.updateOne({ userId }, { history });
        await userDB.updateOne({ userId }, { $inc: { balance: rewardAmount } });

        return { status: true, reward: rewardAmount };
    }

    static async promoCode(user, code) {
        const userId = user.userId;
        const secondaryID = user.secondaryID || null;

        // Check if promo code exists
        const promoCode = await promoCodesDB.findOne({ code });
        if (!promoCode) return { status: false, error: "Invalid promo code" };

        // Check if promo code has been used
        if (promoCode.usedBy.includes(userId) || promoCode.usedBy.includes(secondaryID))
            return { status: false, error: "Promo code has been already used" };

        // Check promo code limit
        if (promoCode.usedBy.length + 1 >= promoCode.limit)
            return { status: false, error: "Promo code has been expired" };

        // Update promo code usedBy
        await promoCodesDB.updateOne({ code }, { $push: { _id: userId } });

        // Update user balance
        await userDB.updateOne({ userId }, { $inc: { balance: promoCode.prize } });

        return { status: true, prize: promoCode.prize };
    }

    static async dailyCases(userId, caseLevel, session = null) {
        // This approach is deprecated.
        // Check if user level is sufficient
        const user = await userDB
            .findOne(
                { userId },
                { _id: 0, experience: 1 },
                {
                    session,
                },
            )
            .lean();

        const userEffectiveExp = await getEffectiveXP(user.experience);
        const userLevel = Auth.expToLevel(userEffectiveExp);
        if (userLevel < caseLevel) return { status: false, message: "Insufficient level" };

        const rewards = await Rewards.getRewards(userId, session);
        const levels = (
            await casesDB.find(
                {
                    id: { $regex: /^level-\d+$/ },
                },
                {
                    session,
                },
            )
        )
            .map(c => parseInt(c.id.replace("level-", "")))
            .sort((a, b) => a - b);

        Object.keys(rewards?.dailyCases || {}).map(d => {
            const level = parseInt(d.replace("level-", ""));
            rewards.dailyCases[level] = rewards.dailyCases[d];
            delete rewards.dailyCases[d];
        });

        // Check if enough time has passed
        if (rewards?.dailyCases && rewards.dailyCases[caseLevel] > Date.now())
            return { status: false, message: "You must wait" };

        // Check the closest level case
        // If user is level 15, he can open level 14 case but cannot open level 13 case
        // Case level doesn't have to be equal to user level, it should be closest to user level among other cases
        let closestLevel = 0;
        for (let level of levels) {
            if (level <= userLevel) closestLevel = level;
            else break;
        }

        if (closestLevel === 0 || closestLevel !== caseLevel)
            return { status: false, message: "You cannot open this case" };

        // Update rewards
        rewards.dailyCases = {
            ...(rewards?.dailyCases || {}),
            [`level-${caseLevel}`]: Date.now() + DAY,
        };
        await rewardsDB.updateOne(
            { userId },
            { history: rewards },
            {
                session,
            },
        );

        return { status: true };

        // Level cases can be opened only once.
        // If user has opened a level case in past, he cannot open it again.
        // If user is 15 level, he can open all the cases from 1 to 15.
        /*const user = await userDB.findOne({ userId }, { _id: 0, experience: 1 }).lean();
        const userLevel = Auth.expToLevel(user.experience);
        if (userLevel < caseLevel) return { status: false, message: "Insufficient level" };

        const rewards = await Rewards.getRewards(userId);*/
    }

    static async freeCases(userId, update = true, session = null) {
        // Check if user level is sufficient
        const rewards = await rewardsDB
            .findOne(
                { userId },
                {
                    session,
                },
            )
            .lean();

        const IS_FREE_CASE_DISABLED = true;

        if (IS_FREE_CASE_DISABLED) {
            return {
                status: false,
                message: "Free case is disabled for now, please try again later!",
            };
        }

        if (isNaN(rewards?.freeCases)) {
            return {
                status: false,
                message: "You have to use a affiliate code to open daily free cases.",
            };
        }

        let freeCaseCount = rewards.freeCases || 0;
        const latestFreeCase = rewards?.latestFreeCase;

        if (freeCaseCount >= FREE_CASES_LIMIT && update)
            return { status: false, message: "You can't open the case" };

        // Check if user has deposited 5$ as a minimum
        // const depositAmount = await Stats.getDepositAmount(userId);
        // if (depositAmount < MINIMUM_DEPOSIT) {
        //     return {
        //         status: false,
        //         message: `You need to deposit at least $${MINIMUM_DEPOSIT}`,
        //     };
        // }

        if (latestFreeCase && update) {
            // User has already opened a free case today
            return { status: false, message: "You have already opened a free case today" };
        }

        if (update) {
            // Update rewards
            await rewardsDB.updateOne(
                { userId },
                {
                    $inc: { freeCases: 1 },
                    latestFreeCase: new Date(),
                },
                {
                    session,
                },
            );
            freeCaseCount += 1;
        }

        return { status: true, freeCases: freeCaseCount };
    }

    static async getDepositBonus(userId) {
        return (
            (await rewardsDB.findOne({ userId }, { _id: 0, depositBonus: 1 }))?.depositBonus ||
            false
        );
    }

    static async useDepositBonus(userId) {
        await rewardsDB.updateOne(
            { userId },
            {
                $set: { depositBonus: false },
            },
        );
        return true;
    }
}
