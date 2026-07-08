import mongoose from "mongoose";

const profileHistorySchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ["created", "updated", "deleted"],
            required: true,
        },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changedAt: { type: Date, default: Date.now },
        summary: { type: String, trim: true },
        changes: { type: Object },
        snapshot: { type: Object },
    },
    { _id: true }
);

const fileAssetSchema = new mongoose.Schema(
    {
        url: { type: String },
        publicId: { type: String },
    },
    { _id: false }
);

const QuoteProfileSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },
        name: { type: String, required: true, trim: true },
        companyName: { type: String, required: true, trim: true },
        tagline: { type: String, trim: true, default: "#TeamDigiCoders" },
        email: { type: String, trim: true },
        phone: { type: String, trim: true },
        website: { type: String, trim: true },
        address: { type: String, trim: true },
        gstNote: {
            type: String,
            trim: true,
            default: "18% GST (Tax) — Excluded unless specified",
        },
        validityDays: { type: Number, default: 30 },
        /** Legacy combined block — auto-built from parts when empty */
        paymentNotes: { type: String, trim: true },
        paymentTerms: { type: String, trim: true, default: "" },
        paymentBankDetails: { type: String, trim: true, default: "" },
        paymentTimeline: { type: String, trim: true, default: "" },
        paymentOtherNotes: { type: String, trim: true, default: "" },
        policies: [{ type: String, trim: true }],
        logo: fileAssetSchema,
        paymentQr: fileAssetSchema,
        isDefault: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        history: [profileHistorySchema],
    },
    { timestamps: true }
);

QuoteProfileSchema.index({ companyId: 1, isDeleted: 1, name: 1 });
QuoteProfileSchema.index({ companyId: 1, isDefault: 1 });

export default mongoose.model("QuoteProfile", QuoteProfileSchema);
