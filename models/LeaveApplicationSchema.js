import mongoose from "mongoose";

const LeaveApplicationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "LeaveType", required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    fromDate: { type: String, required: true }, // "YYYY-MM-DD"
    toDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "cancelled"],
        default: "pending"
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    isHalfDay: { type: Boolean, default: false },
    halfDayType: { type: String, enum: ["first_half", "second_half"] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin if bulk assigned
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model("LeaveApplication", LeaveApplicationSchema);
