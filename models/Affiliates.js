import pkg from "mongoose";
const { model, models, Schema } = pkg;

const affiliateSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },
    affiliates: {
        type: [Schema.Types.ObjectId],
        ref: "users",
        default: [],
    },
    code: {
        type: String,
        required: true,
    },
    earning: {
        type: Number,
        default: 0,
    },
    totalEarnings: {
        type: Number,
        default: 0,
    },
    lastClaimed: {
        type: Date,
        default: null,
    },
    deposits: {
        type: [
            new Schema(
                {
                    user: {
                        type: Schema.Types.ObjectId,
                        ref: "users",
                        required: true,
                    },
                    amount: {
                        type: Number,
                        required: true,
                    },
                    date: {
                        type: Date,
                        required: true,
                    },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
    withdraws: {
        type: [
            new Schema(
                {
                    user: {
                        type: Schema.Types.ObjectId,
                        ref: "users",
                        required: true,
                    },
                    amount: {
                        type: Number,
                        required: true,
                    },
                    date: {
                        type: Date,
                        required: true,
                    },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
    bonuses: {
        type: [
            new Schema(
                {
                    user: {
                        type: Schema.Types.ObjectId,
                        ref: "users",
                        required: true,
                    },
                    amount: {
                        type: Number,
                        required: true,
                    },
                    date: {
                        type: Date,
                        required: true,
                    },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
});

export default models?.affiliates || model("affiliates", affiliateSchema);
