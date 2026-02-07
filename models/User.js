import pkg from "mongoose";
const { model, models, Schema } = pkg;

const logins = ["steam", "discord", "google", "email"];

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
    },
    steamid: {
        type: String,
        unique: true,
        sparse: true,
    },
    secondaryID: {
        type: String,
        required: false,
    },
    email: {
        type: String,
        required: false,
    },
    avatar: {
        type: String,
        required: true,
    },
    registerMethod: {
        type: String,
        enum: logins,
        default: "steam",
    },
    replacedRegisterMethod: {
        type: String,
        enum: logins,
        required: false,
    },
    tradeURL: {
        type: String,
        required: false,
    },
    password: {
        type: String,
        select: false,
    },
    role: {
        type: String,
        default: "user",
        required: false,
    },
    affiliate: {
        type: new Schema(
            {
                code: {
                    type: String,
                    default: "",
                },
                used: {
                    type: String,
                    default: "",
                },
            },
            { _id: false },
        ),
        required: false,
        default: {
            code: "",
            used: "",
        },
    },
    geo: {
        type: new Schema(
            {
                country: {
                    type: String,
                },
                city: {
                    type: String,
                },
                continent: {
                    type: String,
                },
            },
            { _id: false },
        ),
        required: false,
    },
    kyc: {
        type: Boolean,
        default: false,
    },
    experience: {
        // Level: Math.floor(experience / 1000)
        type: Number,
        default: 0,
        required: true,
    },
    registerDate: {
        type: Number, // Miliseconds
        required: true,
    },
    balance: {
        type: Number,
        default: 0,
    },
    vaultBalance: {
        type: Number,
        default: 0,
    },
    sweepstakeBalance: {
        type: Number,
        default: 0,
    },
    activeBalanceType: {
        type: String,
        default: "balance",
        enum: ["balance", "sweepstakeBalance"],
    },
    vaultLock: {
        type: Date,
    },
    banned: {
        type: Boolean,
        default: false,
    },
    muted: {
        type: Date,
        required: false,
    },
    withdrawLock: {
        type: Boolean,
        default: false,
    },
    requiredWagerBalance: {
        type: Number,
        default: 0,
    },
    clientSeed: {
        type: String,
        required: false,
        default: "",
    },
});

export default models?.users || model("users", userSchema);
