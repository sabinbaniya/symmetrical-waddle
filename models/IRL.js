import pkg from "mongoose";
const { model, models, Schema } = pkg;

const irlSchema = new Schema(
    {
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
        price: {
            type: Number,
            default: 0,
        },
        items: {
            type: [
                new Schema(
                    {
                        id: {
                            type: String,
                            required: true,
                        },
                        price: {
                            type: String,
                            required: true,
                        },
                        image: {
                            type: String,
                            required: true,
                        },
                        name: {
                            type: String,
                            required: true,
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
        spins: {
            type: Number,
            default: 0,
        },
    },
    {
        collection: "irl",
    },
);

export default models?.irl || model("irl", irlSchema);
