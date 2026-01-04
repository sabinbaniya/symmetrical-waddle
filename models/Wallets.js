import pkg from "mongoose";
const { model, models, Schema } = pkg;

const walletsSchema = new Schema({
    vaultID: {
        type: String,
        required: true,
    },
    steamid: {
        type: String,
        required: true,
    },
    address: {
        type: String,
        required: true,
    },
    asset: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Number,
        required: true,
    },
});

export default models?.wallets || model("wallets", walletsSchema);
