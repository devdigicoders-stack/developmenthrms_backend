import mongoose from "mongoose"; 

const employmentStatusSchema = new mongoose.Schema({
  name: String,
  description: String,
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
  status: { type: Boolean, default: true },
  isdeleted: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true
});

const EmploymentStatusModel = mongoose.model("EmploymentStatus", employmentStatusSchema);
export default EmploymentStatusModel;
