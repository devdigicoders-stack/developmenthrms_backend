import mongoose from "mongoose";

const ResignationSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        default: null
    },
    reason: {
        type: String,
        required: true,
        trim: true
    },
    requestedLastWorkingDay: {
        type: Date,
        required: true
    },
    approvedLastWorkingDay: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected", "Withdrawn"],
        default: "Pending"
    },
    remarks: {
        type: String,
        default: "",
        trim: true
    },
    clearanceStatus: {
        type: String,
        enum: ["Pending", "Completed"],
        default: "Pending"
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true });

const ResignationModel = mongoose.model("Resignation", ResignationSchema);
export default ResignationModel;
