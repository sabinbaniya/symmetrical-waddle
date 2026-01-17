import pkg from "mongoose";
const { model, models, Schema } = pkg;

const rewardsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },
    history: {
        type: Object,
        default: {},
    },
    freeCases: {
        type: Number,
        default: 5,
    },
    latestFreeCase: {
        type: Date,
        default: null,
    },
    depositBonus: {
        type: Boolean,
        default: false,
    },
});

export default models?.rewards || model("rewards", rewardsSchema);
