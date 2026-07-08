import mongoose from "mongoose";

const designationSchema = new mongoose.Schema({
  name: String,
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department"
  },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
  isdeleted: {
    type: Boolean,
    default: false
  },
  status: {
    type: Boolean,
    default: true
  }
});

const DesignationModel = mongoose.model("Designation", designationSchema);
export default DesignationModel;