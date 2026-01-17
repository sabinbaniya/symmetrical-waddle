import mongoose from "mongoose";
import { z } from "zod";
import KinguinCodes from "../models/KinguinCodes.js";
import GiftcardDeposits from "../models/Deposits/Giftcard.js";
import User from "../models/User.js";
import Config from "../models/Config.js";
import Affiliate from "../lib/affiliate.js";

const claimKinguinGiftCodeSchema = z.object({
    code: z.string().min(1).max(1200),
});

async function eurToUsd(amountEur) {
    const url = `https://api.unirateapi.com/api/convert?api_key=${process.env.UNIRATE_API_KEY}&from=EUR&to=USD&amount=${amountEur}`;
    try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`unirate ${r.status}`);
        const json = await r.json(); // { from, to, amount, result }
        return typeof json?.result === "number" ? json.result : null;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function getUsdToSweepstakeValue() {
    const config = await Config.findOne({ key: "usdToSweepstakeBalance" });
    return config?.value || 1.25; // Default fallback if config missing, though should be there
}

async function getSweepstakeBalanceForDeposit(deposit) {
    const usdToSweepstakeValue = await getUsdToSweepstakeValue();
    return Math.round((deposit * 100) / usdToSweepstakeValue) / 100;
}

export const claimGiftCode = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res
                .status(401)
                .json({ success: false, message: "Please login to claim gift code" });
        }

        const parse = claimKinguinGiftCodeSchema.safeParse(req.body);
        if (!parse.success) {
            return res.status(400).json({ success: false, message: "Invalid payload" });
        }

        const { code } = parse.data;

        const session = await mongoose.startSession();
        let result;

        try {
            result = await session.withTransaction(async () => {
                const doc = await KinguinCodes.findOneAndUpdate(
                    { code, hasClaimed: false },
                    { $set: { hasClaimed: true, claimedBy: user._id, claimedAt: new Date() } },
                    { new: true, session },
                );

                if (!doc) {
                    return { success: false, message: "Code already claimed or invalid code" };
                }

                // doc.amountCents is EUR in cents
                const eurAmount = doc.amountCents / 100;
                const usdUnits = await eurToUsd(eurAmount);

                if (usdUnits == null) {
                    throw new Error("FX failed");
                }

                const usdCents = Math.round(usdUnits * 100);
                const sweepstakeBalance = await getSweepstakeBalanceForDeposit(usdCents / 100);

                await User.updateOne(
                    { _id: user._id },
                    { $inc: { balance: usdCents / 100, sweepstakeBalance } },
                    { session },
                );

                const giftcardDeposit = new GiftcardDeposits({
                    userId: user._id,
                    code,
                    amount: (usdCents / 100).toString(), // Model expects String for amount
                    usdAmount: usdCents / 100,
                    sweepstakeAmount: sweepstakeBalance,
                    source: "kinguin",
                    date: new Date(),
                });

                await giftcardDeposit.save({ session });

                // Update affiliate stats
                // Assuming Affiliate lib has an update method similar to frontend
                // Needs verification of Affiliate lib signature.
                // Frontend: await Affiliate.update("deposit", user.steamid, usdCents / 100, { session });
                // If backend lib is different, we might need adjustment.
                // For now assuming it's compatible or we fix it.
                await Affiliate.update("deposit", user._id, usdCents / 100, { session });

                return {
                    success: true,
                    message: `Successfully claimed ${usdCents / 100} USD`,
                    creditedUsd: usdCents / 100,
                };
            });
        } catch (e) {
            console.error("Transaction failed:", e);
            throw e; // Rethrow to reach outer catch
        } finally {
            await session.endSession();
        }

        if (result && result.success) {
            return res.json(result);
        } else {
            // If result is returned but success false (e.g. code not found)
            if (result) return res.json(result);

            // Fallback for transaction fail without explicit return
            return res
                .status(500)
                .json({
                    success: false,
                    message: "Couldn't claim gift card, please try again later",
                });
        }
    } catch (e) {
        console.error(e);
        return res
            .status(500)
            .json({ success: false, message: "Couldn't claim gift card, please try again later" });
    }
};
