import pkg from "mongoose";
const { model, models, Schema } = pkg;

const gamesSchema = new Schema({
    game: {
        type: String,
        required: true,
        index: true,
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
        index: true,
    },
    wager: {
        type: Number,
        required: true,
    },
    earning: {
        type: Number,
        required: true,
    },
    multiplier: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        required: true,
        index: true,
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
});

export default models?.games || model("games", gamesSchema);
