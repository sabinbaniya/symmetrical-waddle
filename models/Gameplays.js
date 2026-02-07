import pkg from "mongoose";
const { model, models, Schema } = pkg;

const gameplaysSchema = new Schema(
    {
        participants: {
            type: [String],
            default: [],
        },
        avatars: {
            type: [String],
            default: [],
        },
        names: {
            type: [String],
            default: [],
        },
        sponsor: {
            type: [Number],
            default: [],
        },
        maxParticipants: {
            type: Number,
            required: true,
        },
        cases: {
            type: [String],
            default: [],
        },
        status: {
            type: String,
            default: "waiting",
        },
        isPrivate: {
            type: Boolean,
            default: false,
        },
        isReversed: {
            type: Boolean,
            default: false,
        },
        isBot: {
            type: Boolean,
            default: false,
        },
        isSpinning: {
            type: Boolean,
            default: false,
        },
        lastUpdated: {
            type: Number,
            default: Date.now,
        },
        multiplier: {
            type: Number,
            required: false,
        },
        date: {
            type: Number,
            required: true,
        },
        round: {
            type: Number,
            required: true,
        },
        cost: {
            type: Number,
            required: true,
        },
        items: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        itemPools: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        forces: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        gamemode: {
            type: String,
            required: true,
        },
        gameID: {
            type: String,
            required: true,
            index: true,
        },
        upgraderItemDetails: {
            price: Number,
            image: String,
            percentage: Number,
        },
        pf: {
            serverSeedCommitment: { type: String, index: true },
            serverSeed: { type: String },
            publicSeed: { type: String },
        },
        usedBalanceType: {
            type: String,
            required: true,
            enum: ["balance", "sweepstakeBalance"],
        },
        battleMode: {
            type: String,
            enum: ["normal", "share", "pointRush", "jackpot"],
            default: "normal",
        },
        isFastMode: {
            type: Boolean,
            default: false,
        },
        isLastChance: {
            type: Boolean,
            default: false,
        },
        winners: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        prize: {
            type: Number,
            default: 0,
        },
        earnings: {
            type: [Number],
            default: [],
        },
        fundingOptions: {
            percentage: { type: Number, default: 0 },
            minDeposit: { type: Number, default: 0 },
            period: { type: String, enum: ["all", "day", "week", "month"], default: "all" },
            onlyAffiliates: { type: Boolean, default: false },
        },
    },
    {
        timestamps: true,
    },
);

gameplaysSchema.index({ gamemode: 1, status: 1 });
gameplaysSchema.index({ participants: 1, status: 1 });
// gameplaysSchema.index({ gameID: 1 });

export default models?.gameplays || model("gameplays", gameplaysSchema);
