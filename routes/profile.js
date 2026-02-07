import express from "express";
import Auth from "../lib/auth.js";
import userDB from "../models/User.js";
import { z } from "zod";

const router = express.Router();

const clientSeedSchema = z.object({
    clientSeed: z
        .string()
        .min(4, "Client seed must be at least 4 characters")
        .max(64, "Client seed must be at most 64 characters")
        .regex(/^[a-zA-Z0-9\-_]+$/, "Client seed can only contain alphanumeric characters, dashes, and underscores"),
});

const userDetailsUpdateSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username must be at most 30 characters").optional(),
    firstName: z.string().max(50, "First name is too long").optional(),
    lastName: z.string().max(50, "Last name is too long").optional(),
    phone: z.string().max(20, "Phone number is too long").optional(),
    shippingAddress: z.object({
        addressLine1: z.string().max(100).optional(),
        addressLine2: z.string().max(100).optional(),
        city: z.string().max(50).optional(),
        zipCode: z.string().max(20).optional(),
        state: z.string().max(50).optional(),
        country: z.string().max(50).optional(),
    }).optional(),
});

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
        if (!user?._id) {
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
        if (!user?._id) {
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
        if (!user?._id) {
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

        // Check if user has enough balance
        if (user.balance < amount) {
            return res.status(400).json({ error: "Insufficient balance" });
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
        if (!user?._id) {
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
                vaultLock: null,
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
        if (!user?._id) {
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

// PUT /profile/client-seed - Update client seed
router.put("/client-seed", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?._id) {
            return res.status(400).json({ error: "User not found" });
        }

        const validation = clientSeedSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: validation.error.issues[0].message });
        }

        const { clientSeed } = validation.data;

        await Auth.setClientSeed(user._id, clientSeed);
        return res.json({ success: true });
    } catch (error) {
        console.error("Update client seed error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// GET /profile/details - Get personal info and shipping address
router.get("/details", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?._id) {
            return res.status(400).json({ error: "User not found" });
        }

        const details = await Auth.getUserDetails(user._id);
        
        return res.json({
            success: true,
            data: {
                username: user.username,
                firstName: details.firstName,
                lastName: details.lastName,
                phone: details.phone,
                shippingAddress: details.shippingAddress,
            }
        });
    } catch (error) {
        console.error("Get profile details error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// PUT /profile/details - Update personal info and shipping address
router.put("/details", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?._id) {
            return res.status(400).json({ error: "User not found" });
        }

        const validation = userDetailsUpdateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: validation.error.issues[0].message });
        }

        const { username, firstName, lastName, phone, shippingAddress } = validation.data;

        // 1. Handle username update (User model)
        if (username && username !== user.username) {
            const existing = await userDB.findOne({ username, _id: { $ne: user._id } });
            if (existing) {
                return res.status(400).json({ error: "Username already taken" });
            }
            await userDB.updateOne({ _id: user._id }, { username });
        }

        // 2. Handle personal and shipping info (UserDetails model)
        const detailsUpdate = {};
        if (firstName !== undefined) detailsUpdate.firstName = firstName;
        if (lastName !== undefined) detailsUpdate.lastName = lastName;
        if (phone !== undefined) detailsUpdate.phone = phone;

        if (shippingAddress !== undefined) {
            // Use dot notation for nested shipping address fields to support partial updates
            for (const [key, value] of Object.entries(shippingAddress)) {
                if (value !== undefined) {
                    detailsUpdate[`shippingAddress.${key}`] = value;
                }
            }
        }

        if (Object.keys(detailsUpdate).length > 0) {
            await Auth.updateUserDetails(user._id, detailsUpdate);
        }

        return res.json({ success: true });
    } catch (error) {
        console.error("Update profile details error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
