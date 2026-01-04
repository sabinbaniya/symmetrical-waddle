import pkg from "mongoose";
const { model, models, Schema } = pkg;

const rolesSchema = new Schema({
    role: {
        type: String,
    },
    color: {
        type: String,
    },
});

export default models?.roles || model("roles", rolesSchema);
