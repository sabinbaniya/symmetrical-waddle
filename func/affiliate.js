import userDB from "../models/User.js";
import affiliateDB from "../models/Affiliates.js";
import rewardDB from "../models/Rewards.js";
import gamesDB from "../models/Games.js";

export default class Affiliate {
    static async validateCode(code) {
        if (!code) return { status: false, message: "Invalid code" };

        // Check if only letters & numbers
        if (!/^[A-Za-z0-9]+$/.test(code))
            return { status: false, message: "Promo code must only include letters and numbers." };

        // Check length
        if (code.length < 4 || code.length > 24)
            return { status: false, message: "Code length must be between 3 and 24 letters." };

        // Check existance
        const existance = await userDB.find({ "affiliate.code": code.toUpperCase() });

        if (existance.length > 0)
            return {
                status: false,
                message: "This promo code already has been claimed by someone else.",
            };

        return { status: true };
    }

    static async setCode(steamid, code) {
        const validated = await Affiliate.validateCode(code);

        if (validated.status === false) {
            return validated;
        }

        const newAffiliate = new affiliateDB({
            user: steamid,
            code: code.toUpperCase(),
        });

        await Promise.all([
            userDB.findOneAndUpdate({ steamid }, { "affiliate.code": code.toUpperCase() }),
            newAffiliate.save(),
        ]);

        return { status: true };
    }

    // Underscore is at the beginning is necessary, to distinguish this method from React hooks
    static async _useCode(steamid, code) {
        if (!code || typeof code !== "string")
            return { status: false, message: "Promo code is invalid" };

        code = code.toUpperCase();

        // Check if code is valid
        let promoCodeOwner;
        if (code.toUpperCase() !== "LUCKYRUST") {
            promoCodeOwner = await userDB.findOne({ "affiliate.code": code });
            if (!promoCodeOwner) return { status: false, message: "Promo code is invalid" };
            if (promoCodeOwner.steamid === steamid)
                return { status: false, message: "You cannot use your own promo code" };
        }

        await Promise.all([
            userDB.findOneAndUpdate(
                { steamid },
                { $set: { "affiliate.used": code }, $inc: { balance: 0.2 } },
            ),
            affiliateDB.updateOne(
                { user: promoCodeOwner.steamid },
                {
                    $push: {
                        affiliates: steamid,
                    },
                },
            ),
            rewardDB.findOneAndUpdate({ steamid }, { $set: { depositBonus: true, freeCases: 0 } }),
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
    }

    static async sumNegativeEarnings(userId) {
        try {
            const result = await gamesDB.aggregate([
                { $match: { user: userId, earning: { $lt: 0 } } },
                { $group: { _id: null, totalLoss: { $sum: { $abs: "$earning" } } } },
            ]);
            return result.length ? result[0].totalLoss : 0;
        } catch (err) {
            console.error("Error summing negative earnings:", err);
            throw err;
        }
    }

    static async getTotalAffiliates(steamid) {
        const record = await affiliateDB.findOne({ user: steamid });
        if (!record) return 0;

        return record.affiliates.length;
    }

    static async getAffiliates(steamid) {
        const res = [];
        const record = await affiliateDB.findOne({ user: steamid });
        const affiliates = record?.affiliates || [];

        const user = await userDB.findOne({ steamid }, { experience: 1 });

        const share = await Affiliate.getAffiliateShare(user.steamid);

        for (const affiliate of affiliates) {
            const { username, avatar } = await userDB.findOne(
                { steamid: affiliate },
                { _id: 0, username: 1, avatar: 1 },
            );

            const deposited = record.deposits
                .filter(d => d.user === affiliate)
                .reduce((acc, deposit) => acc + deposit.amount, 0);
            const withdraws = record.withdraws
                .filter(w => w.user === affiliate)
                .reduce((acc, withdraw) => acc + withdraw.amount, 0);
            const bonuses = record.bonuses
                .filter(b => b.user === affiliate)
                .reduce((acc, bonus) => acc + bonus.amount, 0);

            res.push({
                username,
                avatar,
                deposited,
                withdraws,
                steamid: affiliate,
                earned: (deposited - (withdraws + bonuses)) * share,
            });
        }

        res.sort((a, b) => b.earned - a.earned); // Sort by earned amount

        return res;
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

        const share = await Affiliate.getAffiliateShare(user.steamid);

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
}
