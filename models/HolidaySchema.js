import mongoose from "mongoose";

const HolidaySchema = new mongoose.Schema({
    name: { type: String, required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    description: { type: String },
    type: { type: String, enum: ["national", "optional", "restricted"], default: "national" },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

HolidaySchema.index({ date: 1, companyId: 1 }, { unique: true });

export default mongoose.model("Holiday", HolidaySchema);
