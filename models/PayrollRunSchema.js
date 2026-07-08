import mongoose from "mongoose";

const payrollComponentSchema = new mongoose.Schema({
    name:   { type: String },
    type:   { type: String, enum: ["earning", "deduction"] },
    amount: { type: Number },
}, { _id: false });

const PayrollRunSchema = new mongoose.Schema({
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyId:  { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    salaryStructureId: { type: mongoose.Schema.Types.ObjectId, ref: "SalaryStructure" },
    month:      { type: String, required: true }, // "YYYY-MM"

    // Working days
    totalWorkingDays:  { type: Number, default: 0 },
    presentDays:       { type: Number, default: 0 }, // present + late + regularized + early-leave
    absentDays:        { type: Number, default: 0 },
    halfDays:          { type: Number, default: 0 },
    paidLeaveDays:     { type: Number, default: 0 },
    lopDays:           { type: Number, default: 0 }, // loss of pay

    // Salary breakdown (computed)
    components:        { type: [payrollComponentSchema], default: [] },
    grossEarnings:     { type: Number, default: 0 },
    totalDeductions:   { type: Number, default: 0 },
    lopDeduction:      { type: Number, default: 0 },
    netSalary:         { type: Number, default: 0 },

    // Status
    status: {
        type: String,
        enum: ["draft", "approved", "paid"],
        default: "draft",
    },
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt:  { type: Date },
    paidAt:      { type: Date },
    remarks:     { type: String },

    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

PayrollRunSchema.index({ userId: 1, month: 1 }, { unique: true });
PayrollRunSchema.index({ companyId: 1, month: 1 });

export default mongoose.model("PayrollRun", PayrollRunSchema);
