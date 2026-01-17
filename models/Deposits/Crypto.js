import pkg from "mongoose";
const { model, models, Schema } = pkg;

const cryptoDepositSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },
    txhash: {
        type: String,
        required: true,
    },
    asset: {
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
    },
    date: {
        type: Date,
        required: true,
    },
});

export default models?.crypto_deposits || model("crypto_deposits", cryptoDepositSchema);
