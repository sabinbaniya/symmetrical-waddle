import pkg from "mongoose";
const { model, models, Schema } = pkg;

const userDetailsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
        unique: true,
        index: true,
    },
    firstName: {
        type: String,
        default: "",
    },
    lastName: {
        type: String,
        default: "",
    },
    phone: {
        type: String,
        default: "",
    },
    shippingAddress: {
        addressLine1: {
            type: String,
            default: "",
        },
        addressLine2: {
            type: String,
            default: "",
        },
        city: {
            type: String,
            default: "",
        },
        zipCode: {
            type: String,
            default: "",
        },
        state: {
            type: String,
            default: "",
        },
        country: {
            type: String,
            default: "",
        },
    },
});

export default models?.userDetails || model("userDetails", userDetailsSchema);
