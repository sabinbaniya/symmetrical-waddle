import p2pDB from "../models/P2P.js";
import userDB from "../models/User.js";
import rewardsDB from "../models/Rewards.js";
import Affiliate from "../lib/affiliate.js";
import Rewards from "../lib/rewards.js";

// Processes deferred P2P payouts. Should be run periodically.
export default async function ProcessP2PPayouts() {
    const now = Date.now();

    // Find successful CS2 trades whose payout time has arrived and not yet released
    const due = await p2pDB
        .find({
            status: "success",
            payoutReleased: { $ne: true },
            payoutAt: { $lte: now },
            "item.appid": 730,
        })
        .lean();

    if (!due?.length) return;

    for (const record of due) {
        try {
            // Compute seller payout, respecting deposit bonus if any
            const rewardRecord = await rewardsDB.findOne(
                { userId: record.seller },
                { depositBonus: 1 },
            );

            const addAmount = rewardRecord?.depositBonus
                ? record.item.price + (record.item.price * 5) / 100
                : record.item.price;

            const sweepstakeBalance = await GetSweepstakeBalanceForDeposit(addAmount);

            // increment the add amount and the sweepstake balance, as per the site's config
            await userDB.updateOne(
                { _id: record.seller },
                { $inc: { balance: addAmount, sweepstakeBalance } },
            );

            await Affiliate.update("deposit", record.seller, addAmount);
            await Affiliate.update("withdraw", record.buyer, record.item.price);

            if (rewardRecord?.depositBonus) {
                await Rewards.useDepositBonus(record.seller);
            }

            await p2pDB.updateOne(
                { seller: record.seller, "item.id": record.item.id },
                { $set: { payoutReleased: true, sweepstakeBalance } },
            );
        } catch (e) {
            console.error("[P2P] ProcessP2PPayouts error for", record?.item?.id, e);
        }
    }
}
