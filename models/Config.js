import pkg from "mongoose";
const { model, models, Schema } = pkg;

const configSchema = new Schema(
    {
        key: {
            type: String,
            enum: [
                "disableAllBets",
                "configuredKinguinWebhook",
                "xpBoostPromo", // object
                "usdToSweepstakeBalance", // integer, 5$ = 4 sweepstake balance
            ],
            required: true,
            unique: true,
        },
        value: {
            type: Schema.Types.Mixed,
            required: true,
        },
    },
    {
        collection: "config",
    },
);

export default models?.config || model("config", configSchema);
