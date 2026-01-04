import pkg from "mongoose";
const { model, models, Schema } = pkg;

const notificationsSchema = new Schema({
    steamid: {
        type: String,
        required: true,
        index: true,
    },
    notifications: {
        type: [
            {
                title: String,
                message: String,
                date: Date,
            },
        ],
        default: [],
    },
});

export default models?.notifications || model("notifications", notificationsSchema);
