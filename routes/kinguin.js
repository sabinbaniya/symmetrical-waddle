import express from "express";
import { claimGiftCode } from "../controllers/kinguin.controller.js";
const requireAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

const router = express.Router();

router.post("/claim", requireAuth, claimGiftCode);

export default router;
