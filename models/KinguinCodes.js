import pkg from "mongoose";
const { model, models, Schema } = pkg;

const kinguinSchema = new Schema({
    code: {
        type: String,
        required: true,
        unique: true,
    },
    offerId: {
        type: String,
        required: true,
    },
    productId: {
        type: String,
        required: true,
    },
    reservationId: {
        type: String,
        required: true,
    },
    amountCents: {
        type: Number,
        required: true,
        // Represents value in EUR cents
    },
    currency: {
        type: String,
        required: true,
    },
    priceIWTR: {
        type: Number,
        required: true,
    },
    webhookStatus: {
        type: String,
        required: true,
    },
    hasClaimed: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    claimedBy: {
        type: String,
    },
    claimedAt: {
        type: Date,
    },
});

export default models?.kinguinCodes || model("kinguinCodes", kinguinSchema);
