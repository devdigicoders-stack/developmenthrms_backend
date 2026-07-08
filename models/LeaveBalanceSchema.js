import mongoose from "mongoose";

const LeaveBalanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "LeaveType", required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    year: { type: Number, required: true },
    allocated: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    pending: { type: Number, default: 0 }, // applied but not yet approved
    carried: { type: Number, default: 0 }, // carried forward from previous year
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

LeaveBalanceSchema.index({ userId: 1, leaveTypeId: 1, year: 1 }, { unique: true });

export default mongoose.model("LeaveBalance", LeaveBalanceSchema);
