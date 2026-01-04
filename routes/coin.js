import express from "express";
import axios from "axios";
import cryptoDepositsDB from "../models/Deposits/Crypto.js";
import cryptoWithdrawsDB from "../models/Withdraws/Crypto.js";

const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

// GET /coin/deposits
router.get("/deposits", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        const deposits = await cryptoDepositsDB.find({ steamid: user.steamid }, { _id: 0 }).lean();
        return res.json(deposits.reverse());
    } catch (e) {
        console.error("Get deposits error:", e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// GET /coin/withdraws
router.get("/withdraws", requireAuth, async (req, res) => {
    try {
        const user = req.user;
        if (!user?.steamid) {
            return res.status(400).json({ error: "User not found" });
        }

        const withdraws = await cryptoWithdrawsDB
            .find({ steamid: user.steamid }, { _id: 0 })
            .lean();
        return res.json(withdraws.reverse());
    } catch (e) {
        console.error("Get withdraws error:", e);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Cache for prices
let priceCache = {
    data: null,
    lastUpdated: 0,
};

const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// GET /coin/prices
router.get("/prices", async (req, res) => {
    try {
        const now = Date.now();
        if (priceCache.data && now - priceCache.lastUpdated < CACHE_DURATION) {
            return res.json(priceCache.data);
        }

        const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin%2Cethereum%2Clitecoin&vs_currencies=usd`;
        const response = await axios.get(url, {
            headers: {
                accept: "application/json",
                "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
            },
        });
        const prices = response.data;

        if (!prices?.bitcoin) {
            return res.status(500).json({ error: "Failed to fetch prices" });
        }

        const formattedPrices = {
            Bitcoin: prices.bitcoin.usd,
            Ethereum: prices.ethereum.usd,
            Litecoin: prices.litecoin.usd,
            Tether: 1,
        };

        priceCache = {
            data: formattedPrices,
            lastUpdated: now,
        };

        return res.json(formattedPrices);
    } catch (e) {
        console.error("Get prices error:", e);
        // Serve stale cache if available
        if (priceCache.data) {
            return res.json(priceCache.data);
        }
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
