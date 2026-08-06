import mongoose from "mongoose";

const SystemSettingsSchema = new mongoose.Schema({
    upiDetails: {
        upiId: { type: String },
        payeeName: { type: String }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true });

const SystemSettingsModel = mongoose.model("SystemSettings", SystemSettingsSchema);
export default SystemSettingsModel;
