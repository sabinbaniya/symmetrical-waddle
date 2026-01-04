import express from "express";
import * as rewardsController from "../controllers/rewards.controller.js";

const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

// GET /rewards - Get rewards history and free case countdown
router.get("/", requireAuth, rewardsController.getRewards);

// GET /rewards/deposit-bonus - Get deposit bonus status
router.get("/deposit-bonus", requireAuth, rewardsController.getDepositBonus);

// GET /rewards/free-cases/details - Get free case details
router.get("/free-cases/details", requireAuth, rewardsController.getFreeCaseDetails);

// POST /rewards/claim - Claim rakeback reward
router.post("/claim", requireAuth, rewardsController.claimRakeback);

// POST /rewards/promo-code - Redeem promo code
router.post("/promo-code", requireAuth, rewardsController.redeemPromoCode);

export default router;
