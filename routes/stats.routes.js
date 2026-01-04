import express from "express";
import {
    getFairnessController,
    getGameHistoryController,
    getPaymentsController,
    getProfileStatsController,
} from "../controllers/stats.controller.js";

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

// GET /stats/fairness - Get fairness data (mines, battles, games)
router.get("/fairness", requireAuth, getFairnessController);

// GET /stats/games - Get game history
router.get("/games", requireAuth, getGameHistoryController);

// GET /stats/payments - Get payments history
router.get("/payments", requireAuth, getPaymentsController);

// GET /stats/profile - Get profile stats (wagers, earnings, deposits, withdrawals)
router.get("/profile", requireAuth, getProfileStatsController);

export default router;
