import mongoose from "mongoose";

const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [String],
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  isdeleted: { type: Boolean, default: false },
  status: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true
});

const RoleModel = mongoose.model("Role", roleSchema);
export default RoleModel;