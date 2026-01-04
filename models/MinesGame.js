import pkg from "mongoose";
const { model, models, Schema } = pkg;

const minesGameSchema = new Schema(
    {
        userID: {
            type: String,
            required: true,
            index: true,
        },
        mines: {
            type: [Number], // 0 = unrevealed, 1 = mine, 2 = revealed safe spot
            required: true,
        },
        betAmount: {
            type: Number,
            required: true,
        },
        mineCount: {
            type: Number,
            required: true,
        },
        socketID: {
            type: String,
            required: true,
        },
        currentMultiplier: {
            type: Number,
            default: 1,
        },
        nextMultiplier: {
            type: Number,
            required: true,
        },
        pfp: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["ongoing", "completed", "lost", "abandoned"],
            default: "ongoing",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        completedAt: {
            type: Date,
        },
        payout: {
            type: Number,
        },
        pf: {
            serverSeedCommitment: {
                type: String,
                index: true,
            },
            serverSeed: {
                type: String,
            },
            clientSeed: {
                type: String,
                index: true,
            },
            nonce: {
                type: Number,
                index: true,
            },
            publicSeed: {
                type: String,
            },
        },
    },
    { timestamps: true },
);

export default models?.minesGames || model("minesGames", minesGameSchema);
