import pkg from "mongoose";
const { model, models, Schema } = pkg;

const p2pSchema = new Schema({
    buyer: {
        type: String,
    },
    seller: {
        type: String,
        required: true,
    },
    deadline: {
        type: Number,
    },
    payoutAt: {
        type: Number,
    },
    payoutReleased: {
        type: Boolean,
        default: false,
    },
    item: {
        type: new Schema(
            {
                id: {
                    type: String,
                    required: true,
                },
                appid: {
                    type: Number,
                    required: true,
                },
                gun: {
                    type: String,
                },
                skin: {
                    type: String,
                    required: true,
                },
                type: {
                    type: String,
                    required: true,
                },
                wear: {
                    type: String,
                },
                image: {
                    type: String,
                    required: true,
                },
                price: {
                    type: Number,
                    required: true,
                },
                rate: {
                    type: Number,
                    default: 0,
                },
            },
            { _id: false },
        ),
        required: true,
    },
    confirmations: {
        type: new Schema(
            {
                buyer: {
                    type: Boolean,
                    default: false,
                },
                seller: {
                    type: Boolean,
                    default: false,
                },
            },
            { _id: false },
        ),
        default: {
            buyer: false,
            seller: false,
        },
    },
    status: {
        type: String,
        required: true,
        enum: ["marketplace", "pending", "failed", "timeout", "success"],
    },
    sweepstakeBalance: {
        type: Number,
        required: true,
    },
});

export default models?.p2ps || model("p2ps", p2pSchema);
