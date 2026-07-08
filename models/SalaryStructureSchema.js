import mongoose from "mongoose";

// Each component: Basic, HRA, Conveyance, Medical, Special Allowance, etc.
const componentSchema = new mongoose.Schema({
    name:       { type: String, required: true },  // "Basic", "HRA", "PF", etc.
    type:       { type: String, enum: ["earning", "deduction"], required: true },
    calcType:   { type: String, enum: ["fixed", "percentage"], default: "fixed" },
    value:      { type: Number, required: true },   // amount or % of basic
    taxable:    { type: Boolean, default: true },
}, { _id: false });

const SalaryStructureSchema = new mongoose.Schema({
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyId:  { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    effectiveFrom: { type: String, required: true }, // "YYYY-MM-DD"
    ctc:        { type: Number, required: true },    // annual CTC
    basic:      { type: Number, required: true },    // monthly basic
    components: { type: [componentSchema], default: [] },
    // Computed monthly totals (stored for quick access)
    grossEarnings:  { type: Number, default: 0 },
    totalDeductions:{ type: Number, default: 0 },
    netSalary:      { type: Number, default: 0 },
    isActive:   { type: Boolean, default: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

SalaryStructureSchema.index({ userId: 1, effectiveFrom: -1 });

export default mongoose.model("SalaryStructure", SalaryStructureSchema);
