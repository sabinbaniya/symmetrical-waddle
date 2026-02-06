import pkg from "mongoose";
const { model, models, Schema } = pkg;

const casesSchema = new Schema({
    id: {
        type: String,
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        index: true,
    },
    image: {
        type: String,
        required: false,
    },
    category: {
        type: String,
        default: "community",
    },
    price: {
        type: Number,
        default: 0,
    },
    items: {
        type: [
            new Schema(
                {
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
                        required: false,
                    },
                    skinName: {
                        type: String,
                        required: false,
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
                    percentage: {
                        type: Number,
                        required: true,
                    },
                },
                { _id: false },
            ),
        ],
        default: [],
    },
    creator: {
        type: String,
        required: false,
        index: true,
    },
    spins: {
        type: Number,
        default: 0,
    },
    type: {
        type: String,
        enum: ["cs2", "rust", "mixed"],
    },
});

export default models?.cases || model("cases", casesSchema);
