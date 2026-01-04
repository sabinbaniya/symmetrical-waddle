import express from "express";
import userDB from "../models/User.js";

const router = express.Router();

// Simple admin endpoint to update balance
router.post("/set-balance", async (req, res) => {
    try {
        const { username, balance } = req.body;

        if (!username || balance === undefined) {
            return res.status(400).json({ error: "Username and balance required" });
        }

        const result = await userDB.updateOne(
            { username },
            { $set: { balance: parseFloat(balance) } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            success: true,
            message: `Updated ${username} balance to ${balance}`,
            modified: result.modifiedCount
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// Trigger rain distribution manually
let rainInstance = null;

export function setRainInstance(rain) {
    rainInstance = rain;
}

router.post("/trigger-rain", async (req, res) => {
    try {
        if (!rainInstance) {
            return res.status(500).json({ error: "Rain system not initialized" });
        }

        await rainInstance.startRain();

        res.json({
            success: true,
            message: "Rain started successfully - users have 60 seconds to join"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
