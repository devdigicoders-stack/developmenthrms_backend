import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema({
    key:      { type: String, required: true },   // e.g. "budget"
    label:    { type: String, required: true },   // e.g. "Budget"
    type:     { type: String, required: true, enum: ["text", "number", "date", "dropdown"] },
    required: { type: Boolean, default: false },
    options:  [{ label: String, value: String }], // only for dropdown
    order:    { type: Number, default: 0 },
}, { _id: false });

const LeadFieldConfigSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, unique: true },
    fields:    [fieldSchema],
}, { timestamps: true });

export default mongoose.model("LeadFieldConfig", LeadFieldConfigSchema);
