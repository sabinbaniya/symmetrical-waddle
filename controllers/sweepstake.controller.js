import {
    GetUsdToSweepstakeValue,
    GetSweepstakeBalanceForDeposit,
} from "../func/GetUsdToSweepstakeValue.js";

export const getSweepstakeValue = async (req, res) => {
    try {
        const value = await GetUsdToSweepstakeValue();
        return res.json({ value });
    } catch (error) {
        console.error("Error getting sweepstake value:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const calculateDeposit = async (req, res) => {
    try {
        const { amount } = req.query;

        if (!amount || isNaN(amount)) {
            return res.status(400).json({ error: "Invalid amount" });
        }

        const value = await GetSweepstakeBalanceForDeposit(parseFloat(amount));
        return res.json({ value });
    } catch (error) {
        console.error("Error calculating sweepstake deposit:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
