import { Router } from "express";
import { getSweepstakeValue, calculateDeposit } from "../controllers/sweepstake.controller.js";

const router = Router();

// disabled for now for buzzed and heydrop
// router.get("/value", getSweepstakeValue);
// router.get("/calc-deposit", calculateDeposit);

export default router;
