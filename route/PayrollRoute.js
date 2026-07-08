import express from "express";
import { protect, hasPermission } from "../middleware/authMiddleware.js";
import {
    createSalaryStructure, updateSalaryStructure,
    getUserSalaryStructures, getCompanySalaryStructures, deleteSalaryStructure,
} from "../controller/SalaryStructureController.js";
import {
    generatePayroll, getPayrollRuns, getMyPayslips,
    approvePayroll, bulkApprovePayroll, markPayrollPaid, bulkMarkPaid,
    deletePayrollRun, getPayrollSummary,
} from "../controller/PayrollController.js";

const router = express.Router();

// Salary Structure
router.post("/salary-structure",           protect, hasPermission("MANAGE_PAYROLL"), createSalaryStructure);
router.put("/salary-structure/:id",        protect, hasPermission("MANAGE_PAYROLL"), updateSalaryStructure);
router.delete("/salary-structure/:id",     protect, hasPermission("MANAGE_PAYROLL"), deleteSalaryStructure);
router.get("/salary-structure/company",    protect, hasPermission("MANAGE_PAYROLL"), getCompanySalaryStructures);
router.get("/salary-structure/user/:userId", protect, hasPermission("MANAGE_PAYROLL"), getUserSalaryStructures);

// Payroll Run
router.post("/run",                        protect, hasPermission("MANAGE_PAYROLL"), generatePayroll);
router.get("/run",                         protect, hasPermission("MANAGE_PAYROLL"), getPayrollRuns);
router.get("/summary",                     protect, hasPermission("MANAGE_PAYROLL"), getPayrollSummary);
router.patch("/run/bulk-approve",          protect, hasPermission("APPROVE_PAYROLL"), bulkApprovePayroll);
router.patch("/run/bulk-mark-paid",        protect, hasPermission("APPROVE_PAYROLL"), bulkMarkPaid);
router.patch("/run/:id/approve",           protect, hasPermission("APPROVE_PAYROLL"), approvePayroll);
router.patch("/run/:id/mark-paid",         protect, hasPermission("APPROVE_PAYROLL"), markPayrollPaid);
router.delete("/run/:id",                  protect, hasPermission("MANAGE_PAYROLL"), deletePayrollRun);

// Employee — own payslips
router.get("/my",                          protect, getMyPayslips);

export default router;
