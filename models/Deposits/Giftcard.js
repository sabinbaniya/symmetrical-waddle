import pkg from "mongoose";
const { model, models, Schema } = pkg;

const giftCardDepositSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },
    code: {
        type: String,
        required: true,
    },
    amount: {
        type: String,
        required: true,
    },
    usdAmount: {
        type: Number,
        required: true,
    },
    sweepstakeAmount: {
        type: Number,
        required: true,
    },
    source: {
        type: String,
        required: true,
        enum: ["kinguin"],
    },
    date: {
        type: Date,
        required: true,
    },
});

export default models?.giftcard_deposits || model("giftcard_deposits", giftCardDepositSchema);
