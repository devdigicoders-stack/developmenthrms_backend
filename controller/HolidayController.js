import Holiday from "../models/HolidaySchema.js";
import User from "../models/UserSchema.js";

const getCompanyId = async (userId) => {
    const u = await User.findById(userId).select("companyId role").populate("role", "name");
    return { companyId: u?.companyId, isSuperAdmin: u?.role?.name === "super_admin" };
};

// GET /api/holidays?year=2025
export const getHolidays = async (req, res) => {
    try {
        const { year, companyId: qCompany } = req.query;
        const { companyId, isSuperAdmin } = await getCompanyId(req.user.userId);
        const filter = {};
        filter.companyId = isSuperAdmin && qCompany ? qCompany : companyId;
        if (year) filter.date = { $regex: `^${year}` };

        const holidays = await Holiday.find(filter)
            .populate("createdBy", "firstName lastName")
            .sort({ date: 1 });
        res.status(200).json({ holidays, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// POST /api/holidays
export const createHoliday = async (req, res) => {
    try {
        const { name, date, description, type, companyId: bodyCompany } = req.body;
        const { companyId, isSuperAdmin } = await getCompanyId(req.user.userId);
        const resolvedCompany = isSuperAdmin && bodyCompany ? bodyCompany : companyId;

        if (!name || !date) return res.status(400).json({ message: "Name and date are required", success: false });

        const holiday = await Holiday.create({
            name, date, description, type,
            companyId: resolvedCompany,
            createdBy: req.user.userId,
        });
        res.status(201).json({ holiday, message: "Holiday created", success: true });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Holiday already exists on this date", success: false });
        res.status(500).json({ message: err.message, success: false });
    }
};

// POST /api/holidays/bulk
export const bulkCreateHolidays = async (req, res) => {
    try {
        const { holidays, companyId: bodyCompany } = req.body;
        const { companyId, isSuperAdmin } = await getCompanyId(req.user.userId);
        const resolvedCompany = isSuperAdmin && bodyCompany ? bodyCompany : companyId;

        if (!Array.isArray(holidays) || !holidays.length)
            return res.status(400).json({ message: "holidays array is required", success: false });

        const docs = holidays.map(h => ({
            name: h.name, date: h.date, description: h.description,
            type: h.type || "national",
            companyId: resolvedCompany,
            createdBy: req.user.userId,
        }));

        const result = await Holiday.insertMany(docs, { ordered: false });
        res.status(201).json({ inserted: result.length, message: `${result.length} holidays added`, success: true });
    } catch (err) {
        // ordered:false — partial inserts possible; report what was inserted
        const inserted = err.result?.nInserted || 0;
        if (inserted > 0) return res.status(207).json({ inserted, message: `${inserted} holidays added (some duplicates skipped)`, success: true });
        res.status(500).json({ message: err.message, success: false });
    }
};

// POST /api/holidays/csv-upload  — parse CSV and bulk insert
export const csvUploadHolidays = async (req, res) => {
    try {
        const { companyId: bodyCompany } = req.body;
        const { companyId, isSuperAdmin } = await getCompanyId(req.user.userId);
        const resolvedCompany = isSuperAdmin && bodyCompany ? bodyCompany : companyId;

        if (!req.file) return res.status(400).json({ message: "CSV file is required", success: false });

        const csvText = req.file.buffer.toString("utf-8");
        const lines = csvText.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return res.status(400).json({ message: "CSV must have a header row and at least one data row", success: false });

        // Parse header: name, date, type (optional), description (optional)
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf("name");
        const dateIdx = headers.indexOf("date");
        const typeIdx = headers.indexOf("type");
        const descIdx = headers.indexOf("description");

        if (nameIdx === -1 || dateIdx === -1)
            return res.status(400).json({ message: "CSV must have 'name' and 'date' columns", success: false });

        const validTypes = ["national", "optional", "restricted"];
        const docs = [];
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
            const name = cols[nameIdx];
            const rawDate = cols[dateIdx];
            if (!name || !rawDate) { errors.push(`Row ${i + 1}: name and date are required`); continue; }

            // Accept both dd-mm-yyyy and yyyy-mm-dd
            let date;
            if (/^\d{2}-\d{2}-\d{4}$/.test(rawDate)) {
                const [dd, mm, yyyy] = rawDate.split("-");
                date = `${yyyy}-${mm}-${dd}`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                date = rawDate;
            } else {
                errors.push(`Row ${i + 1}: date must be dd-mm-yyyy or yyyy-mm-dd format`); continue;
            }

            const type = typeIdx !== -1 && validTypes.includes(cols[typeIdx]) ? cols[typeIdx] : "national";
            const description = descIdx !== -1 ? cols[descIdx] : "";
            docs.push({ name, date, description, type, companyId: resolvedCompany, createdBy: req.user.userId });
        }

        if (!docs.length) return res.status(400).json({ message: "No valid rows found", errors, success: false });

        let inserted = 0;
        try {
            const result = await Holiday.insertMany(docs, { ordered: false });
            inserted = result.length;
        } catch (bulkErr) {
            // ordered:false — partial inserts; nInserted counts successful ones
            inserted = bulkErr.result?.nInserted ?? bulkErr.insertedDocs?.length ?? 0;
            if (inserted === 0) return res.status(400).json({ message: "All rows failed (possibly duplicates)", errors, success: false });
        }
        res.status(201).json({ inserted, skipped: docs.length - inserted, errors, message: `${inserted} holiday${inserted !== 1 ? "s" : ""} imported`, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PUT /api/holidays/:id
export const updateHoliday = async (req, res) => {
    try {
        const { name, date, description, type } = req.body;
        const holiday = await Holiday.findById(req.params.id);
        if (!holiday) return res.status(404).json({ message: "Holiday not found", success: false });
        if (name) holiday.name = name;
        if (date) holiday.date = date;
        if (description !== undefined) holiday.description = description;
        if (type) holiday.type = type;
        holiday.updatedBy = req.user.userId;
        await holiday.save();
        res.status(200).json({ holiday, message: "Holiday updated", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// DELETE /api/holidays/:id
export const deleteHoliday = async (req, res) => {
    try {
        await Holiday.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Holiday deleted", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
