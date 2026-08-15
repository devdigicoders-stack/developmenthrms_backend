import Lead from "../models/LeadSchema.js";
import LeadFieldConfig from "../models/LeadFieldConfigSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import { parse } from "csv-parse/sync";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

// companyId comes from JWT — no extra DB call needed
const cid = (req) => req.user.company;

// ── GET /api/leads?search=&status=&assignedTo=&page=1&limit=20 ────────────────
export const getLeads = async (req, res) => {
    try {
        const { search, status, assignedTo, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const lim  = Math.min(Number(limit), 100);

        const filter = {};
        const companyId = cid(req);
        const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";

        if (req.user.role === "super_admin") {
            // Super Admin sees all company leads
            filter.companyId = companyId;
            if (assignedTo) filter.assignedTo = assignedTo;
        } else if (req.user.role === "admin") {
            // Hierarchy filter: Admin sees only leads assigned to self & subordinates
            const allowedIds = await getSubordinateIds(req.user.userId);
            filter.assignedTo = { $in: allowedIds };
            
            // If specific user is requested, override (assuming UI restricts choice to subordinates)
            if (assignedTo) filter.assignedTo = assignedTo;
        } else {
            // Employee sees only their own leads
            filter.assignedTo = req.user.userId;
        }

        if (search?.trim()) {
            const s = search.trim();
            if (/^\d+$/.test(s)) {
                filter.contactNumber = { $regex: `^${s}` };
            } else {
                filter.$text = { $search: s };
            }
        }

        if (status) filter.status = status;
        const [leads, total] = await Promise.all([
            Lead.find(filter, {
                contactNumber: 1, orgName: 1, contactPerson: 1,
                status: 1, assignedTo: 1, createdAt: 1,
            })
                .populate("assignedTo", "firstName lastName")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(lim)
                .lean(),
            Lead.countDocuments(filter),
        ]);

        res.json({ leads, total, page: Number(page), limit: lim, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── GET /api/leads/:id ────────────────────────────────────────────────────────
export const getLeadById = async (req, res) => {
    try {
        const companyId = cid(req);
        const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
        const filter = { _id: req.params.id };

        if (isAdmin) {
            if (req.user.role === "admin") {
                filter.$or = [{ companyId }, { assignedTo: req.user.userId }];
            }
        } else {
            filter.assignedTo = req.user.userId;
        }

        const lead = await Lead.findOne(filter)
            .populate("assignedTo", "firstName lastName employeeCode profilePic")
            .populate("createdBy",  "firstName lastName")
            .populate("updatedBy",  "firstName lastName")
            .populate("history.changedBy",       "firstName lastName")
            .populate("communications.addedBy",  "firstName lastName")
            .lean();

        if (!lead) return res.status(404).json({ message: "Lead not found", success: false });
        res.json({ lead, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── POST /api/leads ───────────────────────────────────────────────────────────
export const createLead = async (req, res) => {
    try {
        const { contactNumber, orgName, address, contactPerson,
                email, status, assignedTo, customFields } = req.body;

        if (!contactNumber?.trim() || !orgName?.trim())
            return res.status(400).json({ message: "contactNumber and orgName are required", success: false });

        const lead = await Lead.create({
            companyId:     cid(req),
            contactNumber: contactNumber.trim(),
            orgName:       orgName.trim(),
            address, contactPerson,
            email:         email?.toLowerCase?.() || email,
            customFields:  customFields || {},
            status:        status || "New Lead",
            assignedTo:    assignedTo || null,
            createdBy:     req.user.userId,
        });

        if (assignedTo) {
            await createNotification({
                userId: assignedTo,
                title: "New Lead Assigned 🎯",
                message: `You have been assigned a new lead: ${orgName.trim()}`,
                type: "system",
                link: "/leads",
                createdBy: req.user.userId
            });
        }

        res.status(201).json({ lead, message: "Lead created", success: true });
    } catch (err) {
        if (err.code === 11000)
            return res.status(409).json({ message: "A lead with this contact number already exists", success: false });
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── PATCH /api/leads/:id ──────────────────────────────────────────────────────
export const updateLead = async (req, res) => {
    try {
        const FIELDS = ["contactNumber", "orgName", "address", "contactPerson",
                        "email", "status", "assignedTo"];

        const $set = { updatedBy: req.user.userId };
        FIELDS.forEach(f => { if (req.body[f] !== undefined) $set[f] = req.body[f] ?? ""; });

        if (req.body.customFields && typeof req.body.customFields === "object") {
            Object.entries(req.body.customFields).forEach(([k, v]) => {
                if (v === undefined) return;
                $set[`customFields.${k}`] = v ?? "";
            });
        }

        const current = await Lead.findOne({ _id: req.params.id, companyId: { $in: [cid(req), null] } }).lean();
        if (!current) return res.status(404).json({ message: "Lead not found", success: false });

        const resolveUser = async (id) => {
            if (!id) return null;
            const { default: User } = await import("../models/UserSchema.js");
            const u = await User.findById(id).select("firstName lastName").lean();
            return u ? `${u.firstName} ${u.lastName}` : id.toString();
        };

        const changes = {};
        for (const f of FIELDS) {
            if ($set[f] === undefined) continue;
            let oldVal = current[f]?.toString?.() ?? current[f] ?? null;
            let newVal = $set[f]?.toString?.() ?? $set[f];
            if (f === "assignedTo") {
                [oldVal, newVal] = await Promise.all([
                    resolveUser(current[f]),
                    resolveUser($set[f]),
                ]);
            }
            if (oldVal !== newVal) changes[f] = { from: oldVal, to: newVal };
        }

        const update = { $set };
        if (Object.keys(changes).length) {
            update.$push = {
                history: { changedBy: req.user.userId, changedAt: new Date(), changes },
            };
        }

        const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true })
            .populate("assignedTo", "firstName lastName employeeCode profilePic")
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName")
            .populate("history.changedBy", "firstName lastName")
            .populate("communications.addedBy", "firstName lastName")
            .lean();

        if ($set.assignedTo && $set.assignedTo !== current.assignedTo?.toString()) {
            await createNotification({
                userId: $set.assignedTo,
                title: "Lead Assigned 🎯",
                message: `You have been assigned the lead: ${current.orgName}`,
                type: "system",
                link: "/leads",
                createdBy: req.user.userId
            });
        }

        // Auto-create project if status changed to "Sent to Project Team"
        if ($set.status === "Sent to Project Team" && current.status !== "Sent to Project Team") {
            const { default: Project } = await import("../models/ProjectSchema.js");
            // Check if project already exists for this lead
            const existingProject = await Project.findOne({ leadId: lead._id });
            if (!existingProject) {
                await Project.create({
                    name: lead.orgName || `Project for ${lead.contactNumber}`,
                    description: `Automatically created from Lead: ${lead.orgName}`,
                    status: "active",
                    companyId: lead.companyId || req.user.company,
                    members: [], // User requested to leave members empty for manual assignment
                    clientIds: [], // User requested to leave clients empty for manual assignment
                    leadId: lead._id,
                    createdBy: req.user.userId
                });
            }
        }

        res.json({ lead, message: "Lead updated", success: true });
    } catch (err) {
        if (err.code === 11000)
            return res.status(409).json({ message: "Contact number already used by another lead", success: false });
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── DELETE /api/leads/:id ─────────────────────────────────────────────────────
export const deleteLead = async (req, res) => {
    try {
        const companyId = cid(req);
        const isAdmin = req.user.role === "super_admin" || req.user.role === "admin";
        const filter = { _id: req.params.id };

        if (isAdmin) {
            if (req.user.role === "admin") {
                filter.$or = [{ companyId }, { assignedTo: req.user.userId }];
            }
        } else {
            filter.assignedTo = req.user.userId;
        }

        const lead = await Lead.findOne(filter).lean();
        if (!lead) return res.status(404).json({ message: "Lead not found", success: false });

        const isOwner = lead.createdBy?.toString() === req.user.userId;
        const isAdminRole = ["admin", "super_admin"].includes(req.user.role);
        if (!isOwner && !isAdminRole)
            return res.status(403).json({ message: "Not allowed", success: false });

        await Lead.deleteOne({ _id: req.params.id });
        res.json({ message: "Lead deleted", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── POST /api/leads/:id/communications ────────────────────────────────────────
export const addCommunication = async (req, res) => {
    try {
        const { subject, description } = req.body;
        if (!description?.trim())
            return res.status(400).json({ message: "description is required", success: false });

        const comm = {
            subject:     subject?.trim() || "Note",
            description: description.trim(),
            addedBy:     req.user.userId,
            addedAt:     new Date(),
        };

        const histEntry = {
            changedBy: req.user.userId,
            changedAt: new Date(),
            changes:   { communication: { from: null, to: `Added: "${comm.subject}"` } },
        };

        const lead = await Lead.findOneAndUpdate(
            { _id: req.params.id, companyId: { $in: [cid(req), null] } },
            { $push: { communications: comm, history: histEntry } },
            { new: true }
        ).populate("communications.addedBy", "firstName lastName").lean();

        if (!lead) return res.status(404).json({ message: "Lead not found", success: false });

        const added = lead.communications[lead.communications.length - 1];
        res.status(201).json({ communication: added, message: "Communication added", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── POST /api/leads/import/csv ────────────────────────────────────────────────
export const importLeads = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded", success: false });

        const content = req.file.buffer.toString("utf8");

        let rows;
        try {
            rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true });
        } catch {
            return res.status(400).json({ message: "Invalid CSV format", success: false });
        }

        if (!rows.length) return res.status(400).json({ message: "CSV is empty", success: false });

        const normalise = (row) => {
            const n = {};
            for (const k of Object.keys(row)) n[k.toLowerCase().replace(/\s+/g, "")] = row[k];
            return n;
        };

        const VALID_STATUSES = ["New Lead", "Contacted", "Meeting Scheduled", "Proposal Sent",
            "Sent to Project Team", "Project Done", "On Hold", "Cancelled"];

        const companyId = cid(req);
        const createdBy = req.user.userId;
        const now       = new Date();

        let inserted = 0, skipped = 0, failed = 0;
        const errors = [];

        const BATCH = 500;
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH).map(normalise);

            const ops     = [];
            const commMap = {};

            for (const row of batch) {
                const contactNumber = (row.contactnumber || row.contact_number || "").replace(/\D/g, "").slice(-10);
                const orgName       = (row.orgname || row.org_name || row.organisation || row.company || "").trim();

                if (!contactNumber || contactNumber.length !== 10) {
                    failed++;
                    errors.push(`Row ${i + ops.length + failed + 1}: invalid contactNumber "${row.contactnumber || ""}"`);
                    continue;
                }
                if (!orgName) {
                    failed++;
                    errors.push(`Row ${i + ops.length + failed + 1}: orgName is required`);
                    continue;
                }

                const status   = VALID_STATUSES.includes(row.status) ? row.status : "New Lead";
                const commText = (row.communication || row.note || row.notes || "").trim();
                if (commText) commMap[contactNumber] = commText;

                ops.push({
                    updateOne: {
                        filter: { companyId, contactNumber },
                        update: {
                            $setOnInsert: {
                                companyId, contactNumber, orgName,
                                address:       row.address                                     || undefined,
                                contactPerson: row.contactperson || row.contact_person         || undefined,
                                email:         row.email?.toLowerCase()                        || undefined,
                                status,
                                createdBy,
                                assignedTo: createdBy,
                            },
                        },
                        upsert: true,
                    },
                });
            }

            if (!ops.length) continue;

            const result = await Lead.bulkWrite(ops, { ordered: false });
            inserted += result.upsertedCount;
            skipped  += result.matchedCount;

            const newContactNumbers = Object.keys(result.upsertedIds || {}).map(idx => {
                const filter = ops[Number(idx)]?.updateOne?.filter;
                return filter?.contactNumber;
            }).filter(Boolean);

            const commOps = [];
            for (const contactNumber of newContactNumbers) {
                const text = commMap[contactNumber];
                if (!text) continue;
                commOps.push({
                    updateOne: {
                        filter: { companyId, contactNumber },
                        update: {
                            $push: {
                                communications: {
                                    subject:     "Imported Note",
                                    description: text,
                                    addedBy:     createdBy,
                                    addedAt:     now,
                                },
                                history: {
                                    changedBy: createdBy,
                                    changedAt: now,
                                    changes:   { communication: { from: null, to: `Added: "Imported Note"` } },
                                },
                            },
                        },
                    },
                });
            }

            if (commOps.length) await Lead.bulkWrite(commOps, { ordered: false });
        }

        res.json({
            success: true,
            message: `Import complete: ${inserted} inserted, ${skipped} skipped (duplicates), ${failed} failed`,
            inserted, skipped, failed, errors,
        });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── POST /api/leads/import/batch ──────────────────────────────────────────────
export const importBatch = async (req, res) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows) || !rows.length)
            return res.status(400).json({ message: "rows array is required", success: false });

        const companyId = cid(req);
        const createdBy = req.user.userId;
        const now       = new Date();

        const VALID_STATUSES = ["New Lead", "Contacted", "Meeting Scheduled", "Proposal Sent",
            "Sent to Project Team", "Project Done", "On Hold", "Cancelled"];

        const ops     = [];
        const commMap = {};

        for (const row of rows) {
            const contactNumber = (row.contactNumber || "").replace(/\D/g, "").slice(-10);
            const orgName       = (row.orgName || "").trim();
            if (!contactNumber || contactNumber.length !== 10 || !orgName) continue;

            const status   = VALID_STATUSES.includes(row.status) ? row.status : "New Lead";
            const commText = (row.communication || "").trim();
            if (commText) commMap[contactNumber] = commText;

            ops.push({
                updateOne: {
                    filter: { companyId, contactNumber },
                    update: {
                        $setOnInsert: {
                            companyId, contactNumber, orgName,
                            address:       row.address       || undefined,
                            contactPerson: row.contactPerson || undefined,
                            email:         row.email?.toLowerCase() || undefined,
                            status,
                            createdBy,
                            assignedTo: createdBy,
                        },
                    },
                    upsert: true,
                },
            });
        }

        if (!ops.length) return res.json({ inserted: 0, skipped: 0, success: true });

        const result = await Lead.bulkWrite(ops, { ordered: false });

        const newNums = Object.keys(result.upsertedIds || {})
            .map(idx => ops[Number(idx)]?.updateOne?.filter?.contactNumber)
            .filter(Boolean);

        const commOps = newNums
            .filter(n => commMap[n])
            .map(contactNumber => ({
                updateOne: {
                    filter: { companyId, contactNumber },
                    update: {
                        $push: {
                            communications: {
                                subject: "Imported Note", description: commMap[contactNumber],
                                addedBy: createdBy, addedAt: now,
                            },
                            history: {
                                changedBy: createdBy, changedAt: now,
                                changes: { communication: { from: null, to: "Added: \"Imported Note\"" } },
                            },
                        },
                    },
                },
            }));

        if (commOps.length) await Lead.bulkWrite(commOps, { ordered: false });

        res.json({ inserted: result.upsertedCount, skipped: result.matchedCount, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── GET /api/leads/field-config ───────────────────────────────────────────────
export const getFieldConfig = async (req, res) => {
    try {
        const config = await LeadFieldConfig.findOne({ companyId: cid(req) }).lean();
        res.json({ fields: config?.fields || [], success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── PUT /api/leads/field-config ───────────────────────────────────────────────
export const saveFieldConfig = async (req, res) => {
    try {
        const { fields } = req.body;
        if (!Array.isArray(fields))
            return res.status(400).json({ message: "fields must be an array", success: false });

        const keys = fields.map(f => f.key);
        if (new Set(keys).size !== keys.length)
            return res.status(400).json({ message: "Field keys must be unique", success: false });

        const config = await LeadFieldConfig.findOneAndUpdate(
            { companyId: cid(req) },
            { $set: { fields } },
            { upsert: true, new: true }
        ).lean();

        res.json({ fields: config.fields, message: "Field config saved", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
