import userDB from "../models/User.js";
import { expToLevel } from "./helpers.js";
import affiliateDB from "../models/Affiliates.js";
import { getEffectiveXP } from "./xpBoostPromo.js";
import GamesDB from "../models/Games.js";

export default class Affiliate {
    /**
     * @param {"deposit" | "withdraw" | "bonus"} method
     */
    static async update(method, steamid, amount, options = {}) {
        // Check if user has used an affiliate code
        const used = await userDB.findOne(
            { steamid },
            { "affiliate.used": 1 },
            { session: options?.session },
        );
        if (!used || !used.affiliate || !used.affiliate.used) return false;

        const affiliateCode = used.affiliate.used;
        const owner = await userDB.findOne({ "affiliate.code": affiliateCode }, null, {
            session: options?.session,
        });
        if (!owner) return false;

        let $push = {};
        const record = {
            user: steamid,
            amount,
            date: new Date(),
        };

        switch (method) {
            case "deposit":
                $push = {
                    deposits: record,
                };
                break;
            case "withdraw":
                $push = {
                    withdraws: record,
                };
                break;
            case "bonus":
                $push = {
                    bonuses: record,
                };
                break;
        }

        await affiliateDB.updateOne(
            { user: owner.steamid },
            { $push },
            { session: options?.session },
        );

        // Calculate current earning
        const currentEarnings = await Affiliate.calculateCurrentEarnings(owner.steamid);

        await affiliateDB.updateOne(
            { user: owner.steamid },
            {
                $set: {
                    earning: currentEarnings,
                },
            },
            { session: options?.session },
        );
    }

    static async distribute() {
        // Get all affiliates
        const affiliates = await affiliateDB.find({
            earning: { $gt: 0 },
        });

        for (const affiliate of affiliates) {
            console.log("Distributing earnings for affiliate:", affiliate.user);
            await Affiliate.claim(affiliate.user);
        }

        console.log("Affiliate earnings distribution completed.");
    }

    static async claim(steamid) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record) return { status: false, message: "No affiliate record found." };

        // Check if earning is positive
        if (record.earning <= 0) return { status: false, message: "No earnings to claim." };

        // Clear earning and add balance to user
        const addAmount = record.earning;
        await Promise.all([
            userDB.findOneAndUpdate({ steamid }, { $inc: { balance: addAmount } }),
            affiliateDB.updateOne(
                { user: steamid },
                {
                    $set: {
                        earning: 0,
                        lastClaimed: new Date(),
                    },
                    $inc: {
                        totalEarnings: addAmount,
                    },
                },
            ),
        ]);

        return { status: true };
    }

    static async getAffiliateShare(userId) {
        const lifetimeLoss = await this.sumNegativeEarnings(userId);

        if (lifetimeLoss >= 100_000) return 0.25;
        else if (lifetimeLoss >= 50_000) return 0.2;
        else if (lifetimeLoss >= 10_000) return 0.12;
        else if (lifetimeLoss >= 5_000) return 0.1;
        return 0.08;

        // const level = expToLevel(exp);

        // if (level < 10) return 0.01;
        // if (level < 25) return 0.03;
        // else return 0.05;
    }

    static async sumNegativeEarnings(userId) {
        try {
            const result = await GamesDB.aggregate([
                { $match: { user: userId, earning: { $lt: 0 } } },
                { $group: { _id: null, totalLoss: { $sum: { $abs: "$earning" } } } },
            ]);
            return result.length ? result[0].totalLoss : 0;
        } catch (err) {
            console.error("Error summing negative earnings:", err);
            throw err;
        }
    }

    static async calculateCurrentEarnings(steamid) {
        const record = await affiliateDB.findOne({ user: steamid }, { lastClaimed: 1 });
        const lastClaimed = record?.lastClaimed;

        console.log("Calculating current earnings for", steamid, "last claimed:", lastClaimed);

        const [deposits, withdraws, bonuses] = await Promise.all([
            this.totalDepositedByAffiliates(steamid, lastClaimed),
            this.totalWithdrawnByAffiliates(steamid, lastClaimed),
            this.totalBonusByAffiliates(steamid, lastClaimed),
        ]);

        const user = await userDB.findOne({ steamid }, { experience: 1 });

        // const userEffectiveExp = await getEffectiveXP(user.experience);
        const share = Affiliate.getAffiliateShare(user.steamid);

        const earnings = (deposits - (withdraws + bonuses)) * share;
        console.log(
            "Deposits:",
            deposits,
            "Withdraws:",
            withdraws,
            "Bonuses:",
            bonuses,
            "Earnings:",
            earnings,
        );
        return earnings;
    }

    static async getCurrentEarnings(steamid) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record) return 0;
        return record?.earning || 0;
    }

    static async getTotalEarnings(steamid) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record) return 0;
        return record?.totalEarnings || 0;
    }

    static async totalDepositedByAffiliates(steamid, lastClaimed = null) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record || record?.deposits?.length === 0) return 0;

        const deposits = record.deposits.filter(d => {
            if (!lastClaimed) return true;
            return new Date(d.date) > new Date(lastClaimed);
        });

        const totalDeposited = deposits.reduce((acc, deposit) => acc + deposit.amount, 0);
        return totalDeposited;
    }

    static async totalWithdrawnByAffiliates(steamid, lastClaimed = null) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record || record?.withdraws?.length === 0) return 0;

        const withdraws = record.withdraws.filter(w => {
            if (!lastClaimed) return true;
            return new Date(w.date) > new Date(lastClaimed);
        });

        const totalWithdrawn = withdraws.reduce((acc, withdraw) => acc + withdraw.amount, 0);
        return totalWithdrawn;
    }

    static async totalBonusByAffiliates(steamid, lastClaimed = null) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record || record?.bonuses?.length === 0) return 0;

        const bonuses = record.bonuses.filter(b => {
            if (!lastClaimed) return true;
            return new Date(b.date) > new Date(lastClaimed);
        });

        const totalBonuses = bonuses.reduce((acc, bonus) => acc + bonus.amount, 0);
        return totalBonuses;
    }
}
