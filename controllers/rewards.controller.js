import Rewards from "../lib/rewards.js";

export const getRewards = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const [rewardsResponse, freeCaseResponse] = await Promise.all([
            Rewards.getRewards(user._id),
            Rewards.getFreeCases(user._id),
        ]);

        return res.json({
            history: rewardsResponse,
            freeCaseCountdown: freeCaseResponse,
        });
    } catch (e) {
        console.error("Get rewards error:", e);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const getDepositBonus = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const bonus = await Rewards.getDepositBonus(user._id);
        return res.json(bonus); // Frontend expects null or value directly, wrapping might be needed if frontend expects { status: true, data: ... }? checking frontend action: returns pure value or null. So json(bonus) is correct.
    } catch (e) {
        console.error("Get deposit bonus error:", e);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const getFreeCaseDetails = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const response = await Rewards.freeCases(user._id, false);
        return res.json(response);
    } catch (e) {
        console.error("Get free case details error:", e);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const claimRakeback = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ status: false, error: "You must log in" });
        }

        const { type } = req.body;
        if (!["daily", "weekly", "monthly"].includes(type)) {
            return res.status(400).json({ status: false, error: "Invalid reward type" });
        }

        const response = await Rewards.claimRakebackRewards(user._id, type);
        return res.json(response);
    } catch (e) {
        console.error("Claim rakeback error:", e);
        return res.status(500).json({ status: false, error: "Internal server error" });
    }
};

export const redeemPromoCode = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Unknown user" });
        }

        const { promoCode } = req.body;
        if (!promoCode) {
            return res.status(400).json({ message: "Promo code required" });
        }

        const response = await Rewards.promoCode(user, promoCode);
        if (response?.error) {
            return res.json({ message: response.error }); // Frontend expects { message: ... } on error from action.
        }

        return res.json({ prize: response.prize });
    } catch (e) {
        console.error("Redeem promo code error:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
};
