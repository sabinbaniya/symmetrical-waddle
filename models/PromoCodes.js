import pkg from "mongoose";
const { model, models, Schema } = pkg;

const promoCodesSchema = new Schema({
    code: {
        type: String,
        required: true,
    },
    limit: {
        type: Number,
        default: 0,
    },
    prize: {
        type: Number,
        default: 0,
    },
    usedBy: {
        type: Array,
        default: [],
    },
});

export default models?.promo_codes || model("promo_codes", promoCodesSchema);
