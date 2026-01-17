import pkg from "mongoose";
const { model, models, Schema } = pkg;

const chatSchema = new Schema({
    room: {
        type: String,
        enum: ["English", "French", "Turkish"],
        default: "English",
        required: true,
    },
    messages: {
        type: [
            new Schema(
                {
                    user: new Schema(
                        {
                            userId: { type: Schema.Types.ObjectId, ref: "users" },
                            avatar: String,
                            username: String,
                            level: Number,
                        },
                        { _id: false },
                    ),
                    message: String,
                    date: Date,
                },
                { _id: false },
            ),
        ],
        default: [],
    },
});

export default models?.chats || model("chats", chatSchema);
