import pkg from "mongoose";
const { model, models, Schema } = pkg;

const rainSchema = new Schema({
    pot: {
        type: Number,
        default: 0,
        required: true,
    },
    participants: {
        type: [
            {
                userId: {
                    type: Schema.Types.ObjectId,
                    ref: "users",
                    required: true,
                },
                username: {
                    type: String,
                    required: true,
                },
                avatar: {
                    type: String,
                    required: true,
                },
                level: {
                    type: Number,
                    required: true,
                },
                wager7d: {
                    type: Number,
                    default: 0,
                },
                joinedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        default: [],
    },
    status: {
        type: String,
        enum: ["idle", "raining", "distributing"],
        default: "idle",
    },
    rainStartTime: {
        type: Date,
        required: false,
    },
    rainDuration: {
        type: Number,
        default: 60000, // 60 seconds to join
    },
    nextDistribution: {
        type: Date,
        required: true,
    },
    lastDistribution: {
        type: Date,
        required: false,
    },
    distributionInterval: {
        type: Number,
        default: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    },
    history: {
        type: [
            {
                amount: Number,
                participants: Number,
                distributedAt: Date,
                winners: [
                    {
                        userId: { type: Schema.Types.ObjectId, ref: "users" },
                        username: String,
                        amount: Number,
                        level: Number,
                        wager7d: Number,
                    },
                ],
            },
        ],
        default: [],
    },
    tips: {
        type: [
            {
                userId: { type: Schema.Types.ObjectId, ref: "users" },
                username: String,
                amount: Number,
                date: Date,
            },
        ],
        default: [],
    },
});

export default models?.rain || model("rain", rainSchema);
