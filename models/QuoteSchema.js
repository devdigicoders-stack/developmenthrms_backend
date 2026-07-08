import mongoose from "mongoose";

const pageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    cost: { type: Number, required: true, default: 0 },
    descriptions: [{ type: String, trim: true }],
}, { _id: true });

const techStackSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true },
    value: { type: String, trim: true },
}, { _id: true });

const requirementSchema = new mongoose.Schema({
    requirement: { type: String, required: true, trim: true },
    term: { type: String, trim: true },
    price: { type: Number, default: 0 },
    priceType: { type: String, enum: ["amount", "client_side"], default: "amount" },
}, { _id: true });

const paymentDetailSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true },
    value: { type: String, trim: true, default: "" },
}, { _id: true });

const sendHistorySchema = new mongoose.Schema({
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    messageId: { type: String, trim: true },
    success: { type: Boolean, default: true },
    error: { type: String, trim: true },
    isResend: { type: Boolean, default: false },
}, { _id: true });

const activityLogSchema = new mongoose.Schema({
    action: {
        type: String,
        enum: [
            "created",
            "updated",
            "sent",
            "resend",
            "send_failed",
            "status_changed",
            "follow_up_added",
            "follow_up_updated",
            "follow_up_completed",
            "follow_up_cancelled",
            "deleted",
        ],
        required: true,
    },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    performedAt: { type: Date, default: Date.now },
    summary: { type: String, trim: true },
    meta: { type: mongoose.Schema.Types.Mixed },
}, { _id: true });

const followUpSchema = new mongoose.Schema({
    scheduledAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    status: {
        type: String,
        enum: ["pending", "completed", "cancelled"],
        default: "pending",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    completedAt: { type: Date },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: true });

const QuoteSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lead",
        required: true,
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        default: null,
    },
    quoteProfileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "QuoteProfile",
    },
    title: {
        type: String,
        default: "Project Quote",
        trim: true,
    },
    proposedSystemCategory: {
        type: String,
        trim: true,
        default: "Website",
    },
    proposedSystemOther: {
        type: String,
        trim: true,
        default: "",
    },
    proposedSystem: {
        type: String,
        required: true,
        trim: true,
    },
    systemName: {
        type: String,
        required: true,
        trim: true,
    },
    pages: [pageSchema],
    techStack: [techStackSchema],
    otherRequirements: [requirementSchema],
    paymentDetails: [paymentDetailSchema],

    totalPagesCost: {
        type: Number,
        default: 0,
    },
    totalRequirementsCost: {
        type: Number,
        default: 0,
    },
    grandTotal: {
        type: Number,
        default: 0,
    },

    notes: {
        type: String,
        trim: true,
    },
    paymentTerms: {
        type: String,
        trim: true,
    },
    paymentQrUrl: {
        type: String,
        trim: true,
    },
    leadFieldsToDisplay: {
        type: [String],
        default: [],
    },
    status: {
        type: String,
        enum: ["draft", "sent", "accepted", "rejected"],
        default: "draft",
    },
    sendHistory: [sendHistorySchema],
    activityLog: [activityLogSchema],
    followUps: [followUpSchema],
    lastSentAt: { type: Date },
    sendCount: { type: Number, default: 0 },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
}, { timestamps: true });

QuoteSchema.index({ leadId: 1, companyId: 1 });
QuoteSchema.index({ companyId: 1, createdAt: -1 });
QuoteSchema.index({ leadId: 1, status: 1 });

export default mongoose.model("Quote", QuoteSchema);
