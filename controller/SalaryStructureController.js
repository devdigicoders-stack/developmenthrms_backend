import SalaryStructure from "../models/SalaryStructureSchema.js";
import User from "../models/UserSchema.js";

// Compute monthly totals from components + basic
const computeTotals = (basic, components) => {
    let grossEarnings = basic;
    let totalDeductions = 0;

    components.forEach(c => {
        const amount = c.calcType === "percentage" ? parseFloat(((c.value / 100) * basic).toFixed(2)) : c.value;
        if (c.type === "earning") grossEarnings += amount;
        else totalDeductions += amount;
    });

    return {
        grossEarnings: parseFloat(grossEarnings.toFixed(2)),
        totalDeductions: parseFloat(totalDeductions.toFixed(2)),
        netSalary: parseFloat((grossEarnings - totalDeductions).toFixed(2)),
    };
};

// POST /api/payroll/salary-structure
export const createSalaryStructure = async (req, res) => {
    try {
        const { userId, effectiveFrom, ctc, basic, components } = req.body;
        if (!userId || !effectiveFrom || !ctc || !basic)
            return res.status(400).json({ message: "userId, effectiveFrom, ctc and basic are required", success: false });

        const reqUser = await User.findById(req.user.userId).select("companyId");
        const targetUser = await User.findById(userId).select("companyId");
        if (!targetUser) return res.status(404).json({ message: "Employee not found", success: false });

        // Deactivate previous active structure for this employee
        await SalaryStructure.updateMany({ userId, isActive: true }, { $set: { isActive: false } });

        const totals = computeTotals(basic, components || []);

        const structure = await SalaryStructure.create({
            userId,
            companyId: targetUser.companyId,
            effectiveFrom,
            ctc,
            basic,
            components: components || [],
            ...totals,
            createdBy: req.user.userId,
        });

        res.status(201).json({ structure, message: "Salary structure created", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PUT /api/payroll/salary-structure/:id
export const updateSalaryStructure = async (req, res) => {
    try {
        const { effectiveFrom, ctc, basic, components } = req.body;
        const structure = await SalaryStructure.findById(req.params.id);
        if (!structure) return res.status(404).json({ message: "Salary structure not found", success: false });

        if (effectiveFrom) structure.effectiveFrom = effectiveFrom;
        if (ctc) structure.ctc = ctc;
        if (basic !== undefined) structure.basic = basic;
        if (components) structure.components = components;

        const totals = computeTotals(structure.basic, structure.components);
        Object.assign(structure, totals);
        structure.updatedBy = req.user.userId;
        await structure.save();

        res.status(200).json({ structure, message: "Salary structure updated", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/payroll/salary-structure/user/:userId
export const getUserSalaryStructures = async (req, res) => {
    try {
        const structures = await SalaryStructure.find({ userId: req.params.userId })
            .populate("userId", "firstName lastName employeeCode")
            .sort({ effectiveFrom: -1 });
        res.status(200).json({ structures, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/payroll/salary-structure/company  — all active structures for company
export const getCompanySalaryStructures = async (req, res) => {
    try {
        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        const filter = { isActive: true };
        if (reqUser.role?.name !== "super_admin") filter.companyId = reqUser.companyId;

        const structures = await SalaryStructure.find(filter)
            .populate("userId", "firstName lastName employeeCode department designation profilePic")
            .sort({ createdAt: -1 });
        res.status(200).json({ structures, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// DELETE /api/payroll/salary-structure/:id
export const deleteSalaryStructure = async (req, res) => {
    try {
        await SalaryStructure.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Salary structure deleted", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
