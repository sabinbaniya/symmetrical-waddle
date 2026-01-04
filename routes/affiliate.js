import express from "express";
import Affiliate from "../func/affiliate.js";

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ status: false, message: "Unauthorized" });
    }
    next();
};

// GET /affiliate/stats - Get affiliate statistics for authenticated user
router.get("/stats", requireAuth, async (req, res) => {
    try {
        const affiliateStats = await Affiliate.getAffiliates(req.user.steamid);
        res.json(affiliateStats);
    } catch (error) {
        console.error("Error fetching affiliate stats:", error);
        res.status(500).json({ status: false, message: "Failed to fetch affiliate statistics" });
    }
});

// GET /affiliate/overview - Get affiliate overview (totals)
router.get("/overview", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const [
            totalAffiliates,
            totalEarnings,
            totalDeposited,
            totalWithdrawn,
            availableEarnings,
            commissionPercentage,
        ] = await Promise.all([
            Affiliate.getTotalAffiliates(user.steamid),
            Affiliate.getTotalEarnings(user.steamid),
            Affiliate.totalDepositedByAffiliates(user.steamid),
            Affiliate.totalWithdrawnByAffiliates(user.steamid),
            Affiliate.getCurrentEarnings(user.steamid),
            Affiliate.getAffiliateShare(user.steamid),
        ]);

        return res.json({
            commissionPercentage,
            totalDeposits: totalDeposited,
            totalWithdraws: totalWithdrawn,
            totalAffiliates,
            totalEarnings,
            availableEarnings,
        });
    } catch (error) {
        console.error("Error fetching affiliate overview:", error);
        res.status(500).json({ status: false, message: "Failed to fetch affiliate overview" });
    }
});

// POST /affiliate/set-code - Set affiliate code for authenticated user
router.post("/set-code", requireAuth, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ status: false, message: "Code is required" });
        }

        const user = req.user;

        // Check if user already has a code
        if (code?.toUpperCase() === user?.affiliate?.code) {
            return res.status(400).json({
                status: false,
                message: "Your haven't done any changes in your promo code.",
            });
        }

        if (user?.affiliate?.code) {
            return res.status(400).json({
                status: false,
                message: "You already have a promo code set.",
            });
        }

        const response = await Affiliate.setCode(user.steamid, code);

        if (response.status === false) {
            return res.status(400).json(response);
        }

        res.json({ status: true, message: "Affiliate code set successfully" });
    } catch (error) {
        console.error("Error setting affiliate code:", error);
        res.status(500).json({ status: false, message: "Failed to set affiliate code" });
    }
});

// POST /affiliate/use-code - Use an affiliate code
router.post("/use-code", requireAuth, async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ status: false, message: "Code is required" });
        }

        const user = req.user;

        // Check if user has already used a code
        if (user?.affiliate?.used) {
            return res.status(400).json({
                status: false,
                message: "You've already used a promo code.",
            });
        }

        const response = await Affiliate._useCode(user.steamid, code);

        if (response.status === false) {
            return res.status(400).json(response);
        }

        res.json({
            status: true,
            message: "Affiliate code applied successfully! You received 0.2 bonus.",
        });
    } catch (error) {
        console.error("Error using affiliate code:", error);
        res.status(500).json({
            status: false,
            message: "An error occurred while using the affiliate code.",
        });
    }
});

export default router;
