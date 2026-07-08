import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: String,
  description: String,
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
  status: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true
});

const DepartmentModel = mongoose.model("Department", departmentSchema);
export default DepartmentModel; 