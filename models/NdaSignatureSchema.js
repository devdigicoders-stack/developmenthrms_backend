import mongoose from "mongoose";

const ndaSignatureSchema = new mongoose.Schema({
  ndaId: { type: mongoose.Schema.Types.ObjectId, ref: "Nda", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  signatureBase64: { type: String, required: true },
  signedDocumentUrl: { type: String }, // Store the stamped PDF URL
}, {
  timestamps: true
});

const NdaSignatureModel = mongoose.model("NdaSignature", ndaSignatureSchema);
export default NdaSignatureModel;
