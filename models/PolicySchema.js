import mongoose from "mongoose";

const policySchema = new mongoose.Schema({
  title: { type: String, required: true }, // e.g., "Privacy Policy", "NDA"
  content: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null }, // Null means global policy
  status: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true
});

const PolicyModel = mongoose.model("Policy", policySchema);
export default PolicyModel; 
