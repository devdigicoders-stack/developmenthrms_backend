import QuoteProfile from "../models/QuoteProfileSchema.js";
import { uploadToCloudinary } from "../middleware/multer.js";
import cloudinary from "../utills/cloudinary.js";
import {
    QUOTE_BRANDING,
    DEFAULT_PAYMENT_TERMS,
    DEFAULT_PAYMENT_BANK,
    DEFAULT_PAYMENT_TIMELINE,
    DEFAULT_PAYMENT_OTHER,
    buildPaymentNotesFromProfile,
} from "../config/quoteBranding.js";

const cid = (req) => req.user.company;

const isAdmin = (req) => ["admin", "super_admin"].includes(req.user.role);

const PROFILE_FIELDS = [
    "name",
    "companyName",
    "tagline",
    "email",
    "phone",
    "website",
    "address",
    "gstNote",
    "validityDays",
    "paymentTerms",
    "paymentBankDetails",
    "paymentTimeline",
    "paymentOtherNotes",
    "policies",
    "paymentNotes",
    "isDefault",
];

const snapshotProfile = (doc) => {
    const o = doc.toObject ? doc.toObject() : { ...doc };
    return {
        name: o.name,
        companyName: o.companyName,
        tagline: o.tagline,
        email: o.email,
        phone: o.phone,
        website: o.website,
        address: o.address,
        gstNote: o.gstNote,
        validityDays: o.validityDays,
        paymentTerms: o.paymentTerms,
        paymentBankDetails: o.paymentBankDetails,
        paymentTimeline: o.paymentTimeline,
        paymentOtherNotes: o.paymentOtherNotes,
        paymentNotes: o.paymentNotes,
        logo: o.logo,
        paymentQr: o.paymentQr,
        isDefault: o.isDefault,
    };
};

const diffProfile = (before, after) => {
    const changes = {};
    for (const f of PROFILE_FIELDS) {
        const oldVal = before[f];
        const newVal = after[f];
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
            changes[f] = { from: oldVal ?? null, to: newVal ?? null };
        }
    }
    return changes;
};

const clearOtherDefaults = async (companyId, exceptId) => {
    const filter = { companyId, isDeleted: false };
    if (exceptId) filter._id = { $ne: exceptId };
    await QuoteProfile.updateMany(filter, { $set: { isDefault: false } });
};

/** GET /api/quote-profiles/defaults — static config for import (admin) */
export const getQuoteProfileDefaults = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });

        res.json({
            success: true,
            defaults: {
                name: "DigiCoders Default",
                companyName: QUOTE_BRANDING.companyName,
                tagline: QUOTE_BRANDING.tagline,
                email: QUOTE_BRANDING.email,
                phone: QUOTE_BRANDING.phone,
                website: QUOTE_BRANDING.website,
                address: QUOTE_BRANDING.address,
                gstNote: QUOTE_BRANDING.gstNote,
                validityDays: QUOTE_BRANDING.validityDays,
                paymentTerms: DEFAULT_PAYMENT_TERMS,
                paymentBankDetails: DEFAULT_PAYMENT_BANK,
                paymentTimeline: DEFAULT_PAYMENT_TIMELINE,
                paymentOtherNotes: DEFAULT_PAYMENT_OTHER,
                paymentNotes: buildPaymentNotesFromProfile({
                    paymentTerms: DEFAULT_PAYMENT_TERMS,
                    paymentBankDetails: DEFAULT_PAYMENT_BANK,
                    paymentTimeline: DEFAULT_PAYMENT_TIMELINE,
                    paymentOtherNotes: DEFAULT_PAYMENT_OTHER,
                }),
                isDefault: true,
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** GET /api/quote-profiles — active profiles for quote dropdown */
export const listQuoteProfiles = async (req, res) => {
    try {
        const profiles = await QuoteProfile.find({ companyId: cid(req), isDeleted: false })
            .select("-history")
            .sort({ isDefault: -1, name: 1 })
            .lean();
        res.json({ success: true, profiles });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** GET /api/quote-profiles/admin — all profiles + history count (admin) */
export const listQuoteProfilesAdmin = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });

        const profiles = await QuoteProfile.find({ companyId: cid(req) })
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName")
            .sort({ isDeleted: 1, isDefault: -1, updatedAt: -1 })
            .lean();

        res.json({
            success: true,
            profiles: profiles.map((p) => ({
                ...p,
                historyCount: p.history?.length || 0,
                history: undefined,
            })),
        });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** GET /api/quote-profiles/:id/history */
export const getQuoteProfileHistory = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });

        const profile = await QuoteProfile.findOne({ _id: req.params.id, companyId: cid(req) })
            .populate("history.changedBy", "firstName lastName")
            .lean();

        if (!profile) return res.status(404).json({ message: "Profile not found", success: false });

        res.json({ success: true, history: profile.history || [], profileName: profile.name });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** POST /api/quote-profiles */
export const createQuoteProfile = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });

        const { name, companyName } = req.body;
        if (!name?.trim() || !companyName?.trim()) {
            return res.status(400).json({ message: "Profile name and company name are required", success: false });
        }

        const count = await QuoteProfile.countDocuments({ companyId: cid(req), isDeleted: false });
        const isDefault = req.body.isDefault === true || count === 0;

        if (isDefault) await clearOtherDefaults(cid(req), null);

        const profile = await QuoteProfile.create({
            companyId: cid(req),
            name: name.trim(),
            companyName: companyName.trim(),
            tagline: req.body.tagline?.trim() || "",
            email: req.body.email?.trim() || "",
            phone: req.body.phone?.trim() || "",
            website: req.body.website?.trim() || "",
            address: req.body.address?.trim() || "",
            gstNote: req.body.gstNote?.trim() || "",
            validityDays: Number(req.body.validityDays) || 30,
            paymentTerms: req.body.paymentTerms?.trim() || "",
            paymentBankDetails: req.body.paymentBankDetails?.trim() || "",
            paymentTimeline: req.body.paymentTimeline?.trim() || "",
            paymentOtherNotes: req.body.paymentOtherNotes?.trim() || "",
            policies: Array.isArray(req.body.policies) ? req.body.policies : [],
            paymentNotes: buildPaymentNotesFromProfile(req.body),
            isDefault,
            createdBy: req.user.userId,
            updatedBy: req.user.userId,
            history: [
                {
                    action: "created",
                    changedBy: req.user.userId,
                    summary: `Created profile "${name.trim()}"`,
                    snapshot: snapshotProfile({
                        name: name.trim(),
                        companyName: companyName.trim(),
                        ...req.body,
                    }),
                },
            ],
        });

        res.status(201).json({ success: true, profile, message: "Quote profile created" });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** PATCH /api/quote-profiles/:id */
export const updateQuoteProfile = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });

        const profile = await QuoteProfile.findOne({ _id: req.params.id, companyId: cid(req), isDeleted: false });
        if (!profile) return res.status(404).json({ message: "Profile not found", success: false });

        const before = snapshotProfile(profile);

        PROFILE_FIELDS.forEach((f) => {
            if (req.body[f] === undefined) return;
            if (f === "validityDays") profile[f] = Number(req.body[f]) || 30;
            else if (f === "isDefault") profile[f] = !!req.body[f];
            else profile[f] = typeof req.body[f] === "string" ? req.body[f].trim() : req.body[f];
        });

        if (req.body.isDefault === true) {
            await clearOtherDefaults(cid(req), profile._id);
            profile.isDefault = true;
        }

        const after = snapshotProfile(profile);
        const changes = diffProfile(before, after);

        if (Object.keys(changes).length) {
            profile.history.push({
                action: "updated",
                changedBy: req.user.userId,
                summary: `Updated: ${Object.keys(changes).join(", ")}`,
                changes,
            });
        }

        profile.paymentNotes = buildPaymentNotesFromProfile(profile);
        profile.updatedBy = req.user.userId;
        await profile.save();

        res.json({ success: true, profile, message: "Quote profile updated" });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** DELETE /api/quote-profiles/:id — soft delete */
export const deleteQuoteProfile = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });

        const profile = await QuoteProfile.findOne({ _id: req.params.id, companyId: cid(req), isDeleted: false });
        if (!profile) return res.status(404).json({ message: "Profile not found", success: false });

        // Check if this is the only non-deleted profile
        const activeCount = await QuoteProfile.countDocuments({ companyId: cid(req), isDeleted: false });
        if (activeCount <= 1) {
            return res.status(400).json({ 
                message: "Cannot delete the last profile. Create a new profile before deleting this one.", 
                success: false 
            });
        }

        const snap = snapshotProfile(profile);
        const wasDefault = profile.isDefault;
        const profileName = profile.name;
        profile.isDeleted = true;
        profile.isDefault = false;
        profile.history.push({
            action: "deleted",
            changedBy: req.user.userId,
            summary: `Deleted profile "${profile.name}"`,
            snapshot: snap,
        });
        profile.updatedBy = req.user.userId;
        await profile.save();

        if (wasDefault) {
            const next = await QuoteProfile.findOne({ companyId: cid(req), isDeleted: false }).sort({ createdAt: 1 });
            if (next) {
                next.isDefault = true;
                await next.save();
            }
        }

        res.json({ 
            success: true, 
            message: `Profile "${profileName}" deleted successfully`,
            profile: { _id: profile._id, isDeleted: true, name: profileName }
        });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

const uploadProfileAsset = async (req, res, { field, folder, summaryLabel }) => {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only", success: false });
    if (!req.file) return res.status(400).json({ message: "No file uploaded", success: false });

    const profile = await QuoteProfile.findOne({ _id: req.params.id, companyId: cid(req), isDeleted: false });
    if (!profile) return res.status(404).json({ message: "Profile not found", success: false });

    const prev = profile[field];
    if (prev?.publicId) {
        await cloudinary.uploader.destroy(prev.publicId, { resource_type: "image" }).catch(() => {});
    }

    const uploaded = await uploadToCloudinary(req.file, folder);
    profile[field] = { url: uploaded.url, publicId: uploaded.publicId };
    profile.history.push({
        action: "updated",
        changedBy: req.user.userId,
        summary: `Updated ${summaryLabel}`,
        changes: { [field]: { from: "previous", to: uploaded.url } },
    });
    profile.updatedBy = req.user.userId;
    await profile.save();

    res.json({ success: true, profile, message: `${summaryLabel} uploaded` });
};

/** POST /api/quote-profiles/:id/logo */
export const uploadQuoteProfileLogo = async (req, res) => {
    try {
        await uploadProfileAsset(req, res, {
            field: "logo",
            folder: "digicoders/hrms/quote-logos",
            summaryLabel: "logo",
        });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

/** POST /api/quote-profiles/:id/payment-qr */
export const uploadQuoteProfilePaymentQr = async (req, res) => {
    try {
        await uploadProfileAsset(req, res, {
            field: "paymentQr",
            folder: "digicoders/hrms/quote-payment-qr",
            summaryLabel: "payment QR",
        });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
