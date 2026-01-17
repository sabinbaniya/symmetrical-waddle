import express from "express";
import Auth from "../lib/auth.js";
import userDB from "../models/User.js";

const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

// GET /profile/notifications - Get user notifications
router.get("/notifications", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        const data = await Auth.getNotifications(user._id);
        if (!data?.notifications || !data.notifications.length) {
            return res.json([]);
        }

        const notifications = data.notifications.map(notif => ({
            title: notif.title,
            message: notif.message,
            date: notif.date,
        }));

        return res.json(notifications);
    } catch (error) {
        console.error("Get notifications error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// DELETE /profile/notifications - Clear notifications
router.delete("/notifications", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        await Auth.clearNotifications(user._id);
        return res.json({ success: true });
    } catch (error) {
        console.error("Clear notifications error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// GET /profile/user/:id - Get public user data
router.get("/user/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const publicUser = await Auth.getPublicUser(id);

        if (!publicUser) {
            return res.status(404).json({ status: false, error: "User not found" });
        }

        return res.json({ status: true, user: publicUser });
    } catch (error) {
        console.error("Get public user error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// POST /profile/vault/lock - Lock coins in vault
router.post("/vault/lock", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        const { amount, deadline } = req.body;

        if (!amount || !deadline) {
            return res.status(400).json({ error: "Amount and deadline are required" });
        }

        if (amount < 0) {
            return res.status(400).json({ error: "Invalid amount" });
        }

        if (deadline < Date.now()) {
            return res.status(400).json({ error: "Invalid deadline" });
        }

        await userDB.updateOne(
            { _id: user._id },
            {
                $inc: {
                    balance: -amount,
                    vaultBalance: amount,
                },
                vaultLock: deadline,
            },
        );

        return res.json({ success: true });
    } catch (error) {
        console.error("Lock coins error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// POST /profile/vault/unlock - Unlock coins from vault
router.post("/vault/unlock", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        // Fetch fresh user data to get current vault balance and lock
        const currentUser = await userDB.findOne({ _id: user._id }).lean();

        if (!currentUser) {
            return res.status(400).json({ error: "User not found" });
        }

        if (currentUser.vaultBalance <= 0) {
            return res.status(400).json({ error: "Vault is empty" });
        }

        if (currentUser.vaultLock > Date.now()) {
            return res.status(400).json({ error: "Vault is still locked" });
        }

        await userDB.updateOne(
            { _id: user._id },
            {
                $inc: {
                    balance: currentUser.vaultBalance,
                },
                vaultBalance: 0,
                vaultLock: currentUser.vaultLock,
            },
        );

        return res.json({ success: true });
    } catch (error) {
        console.error("Unlock coins error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// PUT /profile/trade-url - Set trade URL
router.put("/trade-url", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: "Trade URL is required" });
        }

        if (!url.startsWith("https://steamcommunity.com/tradeoffer/new/?partner")) {
            return res.status(400).json({ error: "Invalid trade URL" });
        }

        await Auth.setTradeURL(user._id, url);
        return res.json({ success: true });
    } catch (error) {
        console.error("Set trade URL error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// PUT /profile/email - Update email
router.put("/email", requireAuth, async (req, res) => {
    try {
        // This feature is not available yet
        return res.status(501).json({ error: "This action is not available yet" });

        // Commented out implementation for future use
        /*
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/g.test(email)) {
            return res.status(400).json({ error: "Invalid email" });
        }

        await Auth.setEmail(user._id, email);
        return res.json({ success: true });
        */
    } catch (error) {
        console.error("Update email error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
