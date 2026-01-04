import express from "express";
import {
    getInventoryController,
    getTransactionsController,
} from "../controllers/p2p.controller.js";

const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

// GET /p2p/inventory?appid=...
router.get("/inventory", requireAuth, getInventoryController);

// GET /p2p/transactions
router.get("/transactions", requireAuth, getTransactionsController);

export default router;
