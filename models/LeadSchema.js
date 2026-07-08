import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
    changedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedAt:  { type: Date, default: Date.now },
    changes:    { type: Object },
}, { _id: false });

const communicationSchema = new mongoose.Schema({
    subject:     { type: String, required: true },
    description: { type: String, required: true },
    addedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    addedAt:     { type: Date, default: Date.now },
}, { _id: true });

const LeadSchema = new mongoose.Schema({
    companyId:     { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    contactNumber: { type: String, required: true, trim: true },
    orgName:       { type: String, required: true, trim: true },
    address:       { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    email:         { type: String, trim: true, lowercase: true },
    status: {
        type: String,
        enum: ["New Lead", "Contacted", "Meeting Scheduled", "Proposal Sent",
               "Sent to Project Team", "Project Done", "On Hold", "Cancelled"],
        default: "New Lead",
    },
    assignedTo:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    customFields:   { type: Map, of: String, default: {} }, // key → value for admin-configured extra fields
    history:        [historySchema],
    communications: [communicationSchema],
}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary lookup — exact contact number per company (unique)
LeadSchema.index({ companyId: 1, contactNumber: 1 }, { unique: true });

// Default list sort — companyId + createdAt covers the most common query
LeadSchema.index({ companyId: 1, createdAt: -1 });

// Pagination + status filter
LeadSchema.index({ companyId: 1, status: 1, createdAt: -1 });

// Assigned-to filter
LeadSchema.index({ companyId: 1, assignedTo: 1, createdAt: -1 });

// Full-text search across name, org, email, contact person
LeadSchema.index(
    { orgName: "text", contactPerson: "text", email: "text", contactNumber: "text" },
    { weights: { contactNumber: 10, orgName: 5, contactPerson: 3, email: 2 }, name: "lead_text_search" }
);

export default mongoose.model("Lead", LeadSchema);
