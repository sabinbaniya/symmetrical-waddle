import pkg from "mongoose";
const { model, models, Schema } = pkg;

const inventorySchema = new Schema({
    appid: {
        type: Number,
        required: true,
    },
    marketHashName: {
        type: String,
        required: true,
    },
    gunName: {
        type: String,
        required: true,
    },
    skinName: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    price: {
        type: String,
        required: true,
    },
    nextPriceFetch: {
        type: Number,
        default: Date.now(),
    },
    customPrice: {
        type: Boolean,
        default: false,
    },
});

export default models?.inventory || model("inventory", inventorySchema);
