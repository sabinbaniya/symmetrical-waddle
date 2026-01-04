import pkg from "mongoose";
const { model, models, Schema } = pkg;

const pendingCryptoWithdrawSchema = new Schema({
    txID: {
        type: String,
        required: true,
    },
    steamid: {
        type: String,
        required: true,
    },
    to: {
        type: String,
        required: true,
    },
    asset: {
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

export default models?.pending_crypto_withdraws || model("pending_crypto_withdraws", pendingCryptoWithdrawSchema);
