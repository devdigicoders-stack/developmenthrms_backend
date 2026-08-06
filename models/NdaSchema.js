import mongoose from "mongoose";

const ndaSchema = new mongoose.Schema({
  title: { type: String, required: true },
  document: { 
    url: { type: String, required: true },
    publicId: { type: String }
  },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null }, // Null means global NDA
  targetAudience: { type: String, enum: ["Employee", "Intern", "Both", "Client"], default: "Both" },
  status: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true
});

const NdaModel = mongoose.model("Nda", ndaSchema);
export default NdaModel;
