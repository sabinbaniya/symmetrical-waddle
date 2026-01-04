import pkg from "mongoose";
const { model, models, Schema } = pkg;

const cryptoWithdrawSchema = new Schema({
    steamid: {
        type: String,
        required: true,
    },
    to: {
        type: String,
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
    date: {
        type: Date,
        required: true,
    },
});

export default models?.crypto_withdraws || model("crypto_withdraws", cryptoWithdrawSchema);
