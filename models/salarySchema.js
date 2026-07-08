import mongoose from "mongoose";

const salarySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },
  baseSalary: Number,
  bonus: Number,
  deductions: Number,

  effectiveFrom: Date,
  effectiveTo: Date
}, { timestamps: true });

const SalaryModel = mongoose.model("Salary", salarySchema);
export default SalaryModel;