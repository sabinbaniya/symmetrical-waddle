import mongoose from "mongoose";

const pendingPayoutSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        betAmount: { type: Number, required: true },
        multiplier: { type: Number, required: true },
        payoutAmount: { type: Number, required: true },
        game: { type: String, required: true },
        gameData: { type: mongoose.Schema.Types.Mixed },
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed"],
            default: "pending",
        },
        scheduledFor: { type: Date, required: true },
        failureReason: { type: String },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        playedWithBalanceType: { type: String, default: "balance", enum: ["balance", "sweepstakeBalance"]}
    },
    { timestamps: true },
);

// Indexes
pendingPayoutSchema.index({ userId: 1 });
pendingPayoutSchema.index({ status: 1 });
pendingPayoutSchema.index({ scheduledFor: 1 });
pendingPayoutSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

const PendingPayout = mongoose.model("PendingPayout", pendingPayoutSchema);

export default PendingPayout;
