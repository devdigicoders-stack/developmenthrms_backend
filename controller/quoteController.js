import Quote from "../models/QuoteSchema.js";
import Lead from "../models/LeadSchema.js";
import LeadFieldConfig from "../models/LeadFieldConfigSchema.js";
import QuoteProfile from "../models/QuoteProfileSchema.js";
import User from "../models/UserSchema.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";
import { sendMail } from "../utills/SendEmail.js";
import { buildQuoteHtml } from "../utills/quoteHtmlBuilder.js";
import { resolveQuoteBranding } from "../utills/resolveQuoteBranding.js";
import { generateQuotePdfBuffer } from "../utills/quotePdfGenerator.js";
import {
    DEFAULT_QUOTE_EMAIL_SUBJECT,
    DEFAULT_QUOTE_EMAIL_BODY,
    buildAllEmailPlaceholders,
    buildQuotePlaceholderContext,
    applyQuotePlaceholders,
    quoteEmailBodyToHtml,
    sanitizePdfFilename,
} from "../config/quoteEmailTemplates.js";
import EnvData from "../config/EnvData.js";

const VALID_STATUSES = ["draft", "sent", "accepted", "rejected"];

const getClientBaseUrl = () =>
    (EnvData.CLIENT_URL || "http://localhost:5173").split(",")[0].trim();

const quotePopulate = [
    { path: "leadId", select: "orgName contactPerson email contactNumber address status customFields" },
    { path: "createdBy updatedBy", select: "firstName lastName email" },
    { path: "quoteProfileId", select: "name companyName tagline email phone website address logo paymentQr paymentTerms paymentBankDetails paymentTimeline paymentOtherNotes policies gstNote validityDays" },
    { path: "sendHistory.sentBy", select: "firstName lastName email" },
    { path: "activityLog.performedBy", select: "firstName lastName email" },
    { path: "followUps.createdBy followUps.completedBy", select: "firstName lastName email" },
];

const isClientSidePrice = (req) => {
    if (!req) return false;
    if (req.priceType === "client_side") return true;
    if (req.priceType === "amount") return false;
    const term = (req.term || "").trim().toLowerCase();
    return term === "client side" && !(Number(req.price) > 0);
};

const calcTotals = (pages = [], otherRequirements = []) => {
    const totalPagesCost = pages.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
    const totalRequirementsCost = otherRequirements.reduce(
        (sum, r) => (isClientSidePrice(r) ? sum : sum + (Number(r.price) || 0)),
        0
    );
    return { totalPagesCost, totalRequirementsCost, grandTotal: totalPagesCost + totalRequirementsCost };
};

const resolveProposedSystem = (category, other, fallback) => {
    if (category === "Other") return (other || "").trim() || "Other";
    return category || fallback || "Website";
};

const sanitizePages = (pages = []) =>
    pages
        .filter((p) => p?.name?.trim())
        .map((p) => ({
            name: p.name.trim(),
            cost: Number(p.cost) || 0,
            descriptions: (p.descriptions || []).map((d) => String(d).trim()).filter(Boolean),
        }));

const sanitizeTechStack = (techStack = []) =>
    techStack
        .filter((t) => t?.label?.trim())
        .map((t) => ({ label: t.label.trim(), value: t.value?.trim() || "" }));

const sanitizeRequirements = (otherRequirements = []) =>
    otherRequirements
        .filter((r) => r?.requirement?.trim())
        .map((r) => {
            const priceType =
                r.priceType === "client_side" || r.priceType === "amount"
                    ? r.priceType
                    : isClientSidePrice(r)
                      ? "client_side"
                      : "amount";
            return {
                requirement: r.requirement.trim(),
                term: r.term?.trim() || "",
                price: priceType === "client_side" ? 0 : Number(r.price) || 0,
                priceType,
            };
        });

const appendActivity = (quote, { action, userId, summary, meta }) => {
    quote.activityLog.push({
        action,
        performedBy: userId,
        performedAt: new Date(),
        summary: summary || "",
        meta: meta || undefined,
    });
};

const syncLeadOnQuoteSend = async (lead, quote, { to, userId, isResend, success, error }) => {
    if (!lead) return;

    const subject = isResend ? "Quote resent" : "Quote sent";
    const desc = success
        ? `${isResend ? "Resent" : "Sent"} quote "${quote.systemName}" (₹${(quote.grandTotal || 0).toLocaleString("en-IN")}) to ${to}`
        : `Failed to ${isResend ? "resend" : "send"} quote "${quote.systemName}" to ${to}: ${error || "unknown error"}`;

    const comm = {
        subject,
        description: desc,
        addedBy: userId,
        addedAt: new Date(),
    };

    const histEntry = {
        changedBy: userId,
        changedAt: new Date(),
        changes: {
            quote: {
                from: null,
                to: `${isResend ? "Resent" : "Sent"} — ${quote.systemName} → ${to}${success ? "" : " (failed)"}`,
            },
        },
    };

    const update = { $push: { communications: comm, history: histEntry } };
    if (success && lead.status !== "Proposal Sent") {
        update.$set = { status: "Proposal Sent" };
        histEntry.changes.status = { from: lead.status, to: "Proposal Sent" };
    }

    await Lead.findByIdAndUpdate(lead._id, update);
};

const populateQuote = async (quote) => quote.populate(quotePopulate);

const resolveDefaultQuoteProfileId = async (companyId) => {
    if (!companyId) return null;
    const profile = await QuoteProfile.findOne({ companyId, isDefault: true, isDeleted: false })
        .select("_id")
        .lean();
    return profile?._id ?? null;
};

export const createQuote = async (req, res) => {
    try {
        const {
            companyId,
            leadId,
            title,
            proposedSystemCategory,
            proposedSystemOther,
            proposedSystem,
            systemName,
            pages,
            techStack,
            otherRequirements,
            notes,
            paymentTerms,
            paymentQrUrl,
            quoteProfileId,
        } = req.body;
        const userId = req.user.userId;

        const lead = await Lead.findOne({ _id: leadId, companyId });
        if (!lead) {
            return res.status(404).json({ message: "Lead not found", success: false });
        }

        if (!systemName?.trim()) {
            return res.status(400).json({ message: "System name is required", success: false });
        }

        const cleanPages = sanitizePages(pages);
        const cleanTech = sanitizeTechStack(techStack);
        const cleanReqs = sanitizeRequirements(otherRequirements);
        const totals = calcTotals(cleanPages, cleanReqs);
        const profileId =
            quoteProfileId || (await resolveDefaultQuoteProfileId(companyId)) || undefined;

        const quote = new Quote({
            leadId,
            companyId,
            title: title?.trim() || "Project Quote",
            proposedSystemCategory: proposedSystemCategory || "Website",
            proposedSystemOther: proposedSystemOther?.trim() || "",
            proposedSystem: resolveProposedSystem(
                proposedSystemCategory,
                proposedSystemOther,
                proposedSystem
            ),
            systemName: systemName.trim(),
            pages: cleanPages,
            techStack: cleanTech,
            otherRequirements: cleanReqs,
            ...totals,
            notes: notes?.trim() || "",
            paymentTerms: paymentTerms?.trim() || "",
            paymentQrUrl: paymentQrUrl?.trim() || "",
            quoteProfileId: profileId,
            createdBy: userId,
            activityLog: [],
            sendHistory: [],
            followUps: [],
        });

        appendActivity(quote, {
            action: "created",
            userId,
            summary: `Quote created for ${systemName.trim()}`,
            meta: { grandTotal: totals.grandTotal },
        });

        await quote.save();
        await populateQuote(quote);

        res.status(201).json({ message: "Quote created successfully", success: true, quote });
    } catch (error) {
        console.error("Error creating quote:", error);
        res.status(500).json({ message: "Failed to create quote", success: false, error: error.message });
    }
};

export const getAllQuotes = async (req, res) => {
    try {
        const companyId = req.user.company || null; // JWT stores company field
        const { status, search, page = 1, limit = 30 } = req.query;

        const user = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = user?.role?.name === "super_admin";
        const isAdmin = user?.role?.name === "admin";

        // Build filter — super_admin sees everything, others scoped to company
        const filter = isSuperAdmin ? {} : { companyId: { $in: [companyId, null] } };

        if (isSuperAdmin) {
            // Sees all quotes across all companies — no extra filter
        } else if (isAdmin) {
            // Hierarchy filter: Admin sees only quotes created by self & subordinates
            const allowedIds = await getSubordinateIds(req.user.userId);
            filter.createdBy = { $in: allowedIds };
        } else {
            // Employee sees only their own quotes
            filter.createdBy = req.user.userId;
        }

        if (status) {
            const VALID = ["draft", "sent", "accepted", "rejected"];
            if (!VALID.includes(status)) return res.status(400).json({ message: "Invalid status filter", success: false });
            filter.status = status;
        }
        if (search?.trim()) {
            filter.$or = [
                { systemName: { $regex: search.trim(), $options: "i" } },
                { title: { $regex: search.trim(), $options: "i" } },
            ];
        }
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 30));
        const skip = (pageNum - 1) * limitNum;
        const [quotes, total] = await Promise.all([
            Quote.find(filter)
                .populate("leadId", "orgName contactPerson email contactNumber")
                .populate("createdBy", "firstName lastName")
                .select("-sendHistory -activityLog -pages -techStack -otherRequirements -followUps")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Quote.countDocuments(filter),
        ]);
        res.json({ success: true, quotes, total, page: pageNum, limit: limitNum });
    } catch (error) {
        console.error("Error fetching all quotes:", error);
        res.status(500).json({ message: "Failed to fetch quotes", success: false });
    }
};

export const getQuotesByLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const companyId = req.query.companyId || req.user.company || null;

        const quotes = await Quote.find({ leadId, companyId: { $in: [companyId, null] } })
            .populate("createdBy", "firstName lastName email")
            .populate("updatedBy", "firstName lastName email")
            .populate("leadId", "orgName contactPerson email contactNumber")
            .populate("quoteProfileId", "name companyName tagline email phone website address logo paymentQr paymentTerms paymentBankDetails paymentTimeline paymentOtherNotes policies gstNote validityDays")
            .sort({ createdAt: -1 });

        res.json({ success: true, quotes });
    } catch (error) {
        console.error("Error fetching quotes:", error);
        res.status(500).json({ message: "Failed to fetch quotes", success: false });
    }
};

export const getQuoteById = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const companyId = req.user.company;

        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } }).populate(quotePopulate);

        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        res.json({ success: true, quote });
    } catch (error) {
        console.error("Error fetching quote:", error);
        res.status(500).json({ message: "Failed to fetch quote", success: false });
    }
};

export const updateQuote = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const userId = req.user.userId;
        const companyId = req.user.company;
        const existing = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } });
        if (!existing) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        const prevStatus = existing.status;

        const {
            title,
            proposedSystemCategory,
            proposedSystemOther,
            proposedSystem,
            systemName,
            pages,
            techStack,
            otherRequirements,
            notes,
            paymentTerms,
            paymentQrUrl,
            status,
            quoteProfileId,
        } = req.body;

        const structuralChange =
            pages !== undefined || techStack !== undefined || otherRequirements !== undefined;
        if (structuralChange && existing.status !== "draft") {
            return res.status(400).json({
                message:
                    "Only draft quotes can edit pages, tech stack, and requirements. Use limited edit or duplicate as a new quote.",
                success: false,
            });
        }

        const cleanPages = pages !== undefined ? sanitizePages(pages) : existing.pages;
        const cleanTech = techStack !== undefined ? sanitizeTechStack(techStack) : existing.techStack;
        const cleanReqs =
            otherRequirements !== undefined ? sanitizeRequirements(otherRequirements) : existing.otherRequirements;
        const totals = calcTotals(cleanPages, cleanReqs);

        const category = proposedSystemCategory ?? existing.proposedSystemCategory;
        const other = proposedSystemOther ?? existing.proposedSystemOther;

        if (title !== undefined) {
            const t = String(title).trim();
            if (t) existing.title = t;
        }
        if (proposedSystemCategory !== undefined) existing.proposedSystemCategory = category;
        if (proposedSystemOther !== undefined) {
            existing.proposedSystemOther =
                typeof other === "string" ? other.trim() : existing.proposedSystemOther;
        }
        if (proposedSystemCategory !== undefined || proposedSystemOther !== undefined || proposedSystem !== undefined) {
            existing.proposedSystem = resolveProposedSystem(category, other, proposedSystem ?? existing.proposedSystem);
        }
        if (systemName !== undefined) {
            const sn = String(systemName).trim();
            if (sn) existing.systemName = sn;
        }
        if (pages !== undefined) existing.pages = cleanPages;
        if (techStack !== undefined) existing.techStack = cleanTech;
        if (otherRequirements !== undefined) existing.otherRequirements = cleanReqs;
        if (pages !== undefined || otherRequirements !== undefined) Object.assign(existing, totals);
        if (notes !== undefined) existing.notes = String(notes).trim();
        if (paymentTerms !== undefined) existing.paymentTerms = String(paymentTerms).trim();
        if (paymentQrUrl !== undefined) existing.paymentQrUrl = String(paymentQrUrl).trim();
        if (status !== undefined) {
            if (!VALID_STATUSES.includes(status)) {
                return res.status(400).json({ message: "Invalid quote status", success: false });
            }
            if (status !== prevStatus) {
                appendActivity(existing, {
                    action: "status_changed",
                    userId,
                    summary: `Status changed from ${prevStatus} to ${status}`,
                    meta: { from: prevStatus, to: status },
                });
                existing.status = status;
            }
        }
        if (quoteProfileId !== undefined) {
            existing.quoteProfileId = quoteProfileId || null;
        }
        existing.updatedBy = userId;

        const changedFields = [];
        if (title !== undefined) changedFields.push("title");
        if (systemName !== undefined) changedFields.push("systemName");
        if (pages !== undefined) changedFields.push("pages");
        if (techStack !== undefined) changedFields.push("techStack");
        if (otherRequirements !== undefined) changedFields.push("otherRequirements");
        if (notes !== undefined) changedFields.push("notes");
        if (paymentTerms !== undefined) changedFields.push("paymentTerms");

        if (changedFields.length > 0 && status === undefined) {
            appendActivity(existing, {
                action: "updated",
                userId,
                summary: `Quote updated (${changedFields.join(", ")})`,
                meta: { fields: changedFields, grandTotal: existing.grandTotal },
            });
        }

        await existing.save();
        await populateQuote(existing);

        res.json({ message: "Quote updated successfully", success: true, quote: existing });
    } catch (error) {
        console.error("Error updating quote:", error);
        res.status(500).json({ message: "Failed to update quote", success: false });
    }
};

export const deleteQuote = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const userId = req.user.userId;
        const companyId = req.user.company;
        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } }).populate("leadId", "orgName");
        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        if (quote.leadId) {
            await Lead.findByIdAndUpdate(quote.leadId._id, {
                $push: {
                    history: {
                        changedBy: userId,
                        changedAt: new Date(),
                        changes: {
                            quote: {
                                from: quote.systemName,
                                to: "deleted",
                            },
                        },
                    },
                    communications: {
                        subject: "Quote deleted",
                        description: `Deleted quote "${quote.systemName}" (₹${(quote.grandTotal || 0).toLocaleString("en-IN")})`,
                        addedBy: userId,
                        addedAt: new Date(),
                    },
                },
            });
        }

        await Quote.findByIdAndDelete(quoteId);
        res.json({ message: "Quote deleted successfully", success: true });
    } catch (error) {
        console.error("Error deleting quote:", error);
        res.status(500).json({ message: "Failed to delete quote", success: false });
    }
};

const buildPlaceholderContextForQuote = async (quote, branding) => {
    const fieldConfigDoc = await LeadFieldConfig.findOne({ companyId: quote.companyId }).lean();
    const fieldConfig = fieldConfigDoc?.fields || [];
    const sender = {
        name: quote.createdBy
            ? `${quote.createdBy.firstName || ""} ${quote.createdBy.lastName || ""}`.trim() || "Team"
            : branding?.companyName || "Team",
        email: quote.createdBy?.email || "",
    };
    return buildQuotePlaceholderContext(quote, quote.leadId, branding, sender, fieldConfig);
};

const buildQuoteHtmlForQuote = async (quote) => {
    const branding = await resolveQuoteBranding(quote, quote.companyId);
    const placeholderContext = await buildPlaceholderContextForQuote(quote, branding);
    return buildQuoteHtml(quote, quote.leadId, {
        clientBaseUrl: getClientBaseUrl(),
        branding,
        placeholderContext,
    });
};

export const getQuoteHTML = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const companyId = req.user.company;
        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } })
            .populate("leadId", "orgName contactPerson email contactNumber address status customFields")
            .populate("createdBy", "firstName lastName email");

        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        const html = await buildQuoteHtmlForQuote(quote);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    } catch (error) {
        console.error("Error generating quote HTML:", error);
        res.status(500).json({ message: "Failed to generate quote", success: false });
    }
};

export const getQuoteSendDefaults = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const companyId = req.user.company;
        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } })
            .populate("leadId", "orgName contactPerson email contactNumber address status customFields")
            .populate("createdBy", "firstName lastName email");

        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        const fieldConfigDoc = await LeadFieldConfig.findOne({ companyId: quote.companyId }).lean();
        const fieldConfig = fieldConfigDoc?.fields || [];

        const branding = await resolveQuoteBranding(quote, quote.companyId);
        const sender = {
            name: quote.createdBy
                ? `${quote.createdBy.firstName || ""} ${quote.createdBy.lastName || ""}`.trim() || "Team"
                : branding.companyName || "Team",
            email: quote.createdBy?.email || "",
        };
        const ctx = buildQuotePlaceholderContext(quote, quote.leadId, branding, sender, fieldConfig);

        res.json({
            success: true,
            subjectTemplate: DEFAULT_QUOTE_EMAIL_SUBJECT,
            bodyTemplate: DEFAULT_QUOTE_EMAIL_BODY,
            subjectPreview: applyQuotePlaceholders(DEFAULT_QUOTE_EMAIL_SUBJECT, ctx),
            bodyPreview: applyQuotePlaceholders(DEFAULT_QUOTE_EMAIL_BODY, ctx),
            placeholders: buildAllEmailPlaceholders(fieldConfig),
            leadFieldConfig: fieldConfig,
        });
    } catch (error) {
        console.error("Error loading send defaults:", error);
        res.status(500).json({ message: "Failed to load email defaults", success: false });
    }
};

export const sendQuoteToCustomer = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const {
            email: overrideEmail,
            resend: isResendFlag,
            subject: subjectTemplate,
            body: bodyTemplate,
        } = req.body;
        const userId    = req.user.userId;
        const companyId = req.user.company;

        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } })
            .populate("leadId", "orgName contactPerson email contactNumber address status customFields")
            .populate("createdBy", "firstName lastName email");

        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        const fieldConfigDoc = await LeadFieldConfig.findOne({ companyId: quote.companyId }).lean();
        const fieldConfig = fieldConfigDoc?.fields || [];

        const to = (overrideEmail || quote.leadId?.email || "").trim();
        if (!to) {
            return res.status(400).json({
                message: "Lead has no email. Add an email on the lead or provide one to send the quote.",
                success: false,
            });
        }

        const hasSuccessfulSend = quote.sendHistory?.some((s) => s.success);
        const isResend = Boolean(isResendFlag) || hasSuccessfulSend;

        const branding = await resolveQuoteBranding(quote, quote.companyId);
        const sender = {
            name: quote.createdBy
                ? `${quote.createdBy.firstName || ""} ${quote.createdBy.lastName || ""}`.trim() || "Team"
                : branding.companyName || "Team",
            email: quote.createdBy?.email || "",
        };
        const ctx = buildQuotePlaceholderContext(quote, quote.leadId, branding, sender, fieldConfig);

        const subjectRaw = (subjectTemplate || "").trim() || DEFAULT_QUOTE_EMAIL_SUBJECT;
        const bodyRaw = (bodyTemplate || "").trim() || DEFAULT_QUOTE_EMAIL_BODY;
        const subject = applyQuotePlaceholders(subjectRaw, ctx);
        const bodyText = applyQuotePlaceholders(bodyRaw, ctx);
        const emailHtml = quoteEmailBodyToHtml(bodyText);

        const quoteHtml = await buildQuoteHtmlForQuote(quote);

        let pdfBuffer;
        try {
            pdfBuffer = await generateQuotePdfBuffer(quoteHtml);
        } catch (pdfErr) {
            console.error("PDF generation failed:", pdfErr);
            const detail = pdfErr?.message || "";
            const needsChrome =
                /chrome|chromium|puppeteer|not found/i.test(detail);
            return res.status(500).json({
                message: needsChrome
                    ? `${detail} Run in server folder: npm run install:chrome`
                    : `Failed to generate quote PDF. ${detail}`.trim(),
                success: false,
            });
        }

        const pdfFilename = sanitizePdfFilename(quote.systemName);

        const mailResult = await sendMail({
            email: to,
            title: subject,
            msg: emailHtml,
            text: bodyText,
            attachments: [
                {
                    filename: pdfFilename,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ],
        });

        const historyEntry = {
            sentAt: new Date(),
            sentBy: userId,
            to,
            subject,
            messageId: mailResult.messageId || "",
            success: mailResult.ok,
            error: mailResult.error || "",
            isResend,
        };

        quote.sendHistory.push(historyEntry);

        if (mailResult.ok) {
            quote.status = "sent";
            quote.lastSentAt = historyEntry.sentAt;
            quote.sendCount = (quote.sendCount || 0) + 1;
            appendActivity(quote, {
                action: isResend ? "resend" : "sent",
                userId,
                summary: `${isResend ? "Resent" : "Sent"} quote to ${to}`,
                meta: { to, messageId: mailResult.messageId, grandTotal: quote.grandTotal, pdfAttached: true },
            });
        } else {
            appendActivity(quote, {
                action: "send_failed",
                userId,
                summary: `Failed to ${isResend ? "resend" : "send"} quote to ${to}: ${mailResult.error}`,
                meta: { to, error: mailResult.error },
            });
        }

        quote.updatedBy = userId;
        await quote.save();
        await syncLeadOnQuoteSend(quote.leadId, quote, {
            to,
            userId,
            isResend,
            success: mailResult.ok,
            error: mailResult.error,
        });
        await populateQuote(quote);

        if (!mailResult.ok) {
            const emailMsg = mailResult.skipped
                ? mailResult.error || "Email is not configured on the server (Email_User / Email_Pass in .env)."
                : mailResult.error || "Failed to send email";
            return res.status(502).json({
                message: emailMsg,
                success: false,
                quote,
            });
        }

        res.json({
            message: isResend ? `Quote resent to ${to}` : `Quote sent to ${to}`,
            success: true,
            quote,
        });
    } catch (error) {
        console.error("Error sending quote:", error);
        res.status(500).json({ message: "Failed to send quote", success: false });
    }
};

export const addQuoteFollowUp = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { scheduledAt, note } = req.body;
        const userId    = req.user.userId;
        const companyId = req.user.company;

        if (!scheduledAt) {
            return res.status(400).json({ message: "Follow-up date is required", success: false });
        }

        // Validate date
        const parsedDate = new Date(scheduledAt);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ message: "Invalid follow-up date", success: false });
        }

        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } });
        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        const followUp = {
            scheduledAt: parsedDate,
            note: (note || "").trim(),
            status: "pending",
            createdBy: userId,
        };

        quote.followUps.push(followUp);
        appendActivity(quote, {
            action: "follow_up_added",
            userId,
            summary: `Follow-up scheduled for ${followUp.scheduledAt.toLocaleDateString("en-IN")}`,
            meta: { note: followUp.note },
        });
        quote.updatedBy = userId;
        await quote.save();
        await populateQuote(quote);

        res.status(201).json({
            message: "Follow-up scheduled",
            success: true,
            quote,
            followUp: quote.followUps[quote.followUps.length - 1],
        });
    } catch (error) {
        console.error("Error adding follow-up:", error);
        res.status(500).json({ message: "Failed to add follow-up", success: false });
    }
};

export const updateQuoteFollowUp = async (req, res) => {
    try {
        const { quoteId, followUpId } = req.params;
        const { status, note, scheduledAt } = req.body;
        const userId    = req.user.userId;
        const companyId = req.user.company;

        const quote = await Quote.findOne({ _id: quoteId, companyId: { $in: [companyId, null] } });
        if (!quote) {
            return res.status(404).json({ message: "Quote not found", success: false });
        }

        const followUp = quote.followUps.id(followUpId);
        if (!followUp) {
            return res.status(404).json({ message: "Follow-up not found", success: false });
        }

        const prevStatus = followUp.status;

        if (scheduledAt !== undefined) followUp.scheduledAt = new Date(scheduledAt);
        if (note !== undefined) followUp.note = String(note).trim();

        if (status !== undefined) {
            const valid = ["pending", "completed", "cancelled"];
            if (!valid.includes(status)) {
                return res.status(400).json({ message: "Invalid follow-up status", success: false });
            }
            followUp.status = status;
            if (status === "completed") {
                followUp.completedAt = new Date();
                followUp.completedBy = userId;
                appendActivity(quote, {
                    action: "follow_up_completed",
                    userId,
                    summary: `Follow-up marked completed (${followUp.scheduledAt.toLocaleDateString("en-IN")})`,
                    meta: { note: followUp.note },
                });
            } else if (status === "cancelled") {
                appendActivity(quote, {
                    action: "follow_up_cancelled",
                    userId,
                    summary: `Follow-up cancelled (${followUp.scheduledAt.toLocaleDateString("en-IN")})`,
                });
            } else if (status !== prevStatus) {
                appendActivity(quote, {
                    action: "follow_up_updated",
                    userId,
                    summary: `Follow-up status changed to ${status}`,
                });
            }
        } else {
            appendActivity(quote, {
                action: "follow_up_updated",
                userId,
                summary: "Follow-up details updated",
            });
        }

        quote.updatedBy = userId;
        await quote.save();
        await populateQuote(quote);

        res.json({ message: "Follow-up updated", success: true, quote, followUp });
    } catch (error) {
        console.error("Error updating follow-up:", error);
        res.status(500).json({ message: "Failed to update follow-up", success: false });
    }
};
