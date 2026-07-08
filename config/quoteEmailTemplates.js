/** Placeholders use double curly braces: {{key}} */

import {
    LEAD_STANDARD_PLACEHOLDERS,
    placeholdersFromFieldConfig,
    enrichPlaceholderContextWithLead,
} from "../utills/leadPlaceholders.js";

export const QUOTE_EMAIL_PLACEHOLDERS = [
    { key: "systemName", label: "System name", example: "CRM - Web Based", group: "quote" },
    { key: "quoteTitle", label: "Quote title", example: "Project Quote", group: "quote" },
    { key: "proposedSystem", label: "Proposed system", example: "Application", group: "quote" },
    { key: "grandTotal", label: "Grand total", example: "₹ 30,000 /-", group: "quote" },
    { key: "quoteDate", label: "Quote date", example: "22 May 2026", group: "quote" },
    { key: "validityDays", label: "Validity (days)", example: "30", group: "quote" },
    { key: "companyName", label: "Your company", example: "DigiCoders Technologies", group: "quote" },
    { key: "senderName", label: "Sender name", example: "Rahul Sharma", group: "quote" },
    { key: "senderEmail", label: "Sender email", example: "sales@company.com", group: "quote" },
];

export const buildAllEmailPlaceholders = (fieldConfig = []) => [
    ...QUOTE_EMAIL_PLACEHOLDERS,
    ...LEAD_STANDARD_PLACEHOLDERS,
    ...placeholdersFromFieldConfig(fieldConfig),
];

export const DEFAULT_QUOTE_EMAIL_SUBJECT = "Project Quote — {{systemName}} for {{orgName}}";

export const DEFAULT_QUOTE_EMAIL_BODY = `Dear {{contactPerson}},

Please find attached our project quote for {{systemName}} ({{proposedSystem}}) prepared for {{orgName}}.

Offered price: {{grandTotal}}
Quote date: {{quoteDate}}
Valid for: {{validityDays}} days

If you have any questions or would like to discuss the proposal, please reply to this email.

Best regards,
{{senderName}}
{{companyName}}`;

export const buildQuotePlaceholderContext = (quote, lead, branding, sender, fieldConfig = []) => {
    const proposed =
        quote.proposedSystemCategory === "Other"
            ? quote.proposedSystemOther || "Other"
            : quote.proposedSystemCategory || quote.proposedSystem || "Website";

    const quoteDate = new Date(quote.createdAt || Date.now()).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const grandTotal = `₹ ${(Number(quote.grandTotal) || 0).toLocaleString("en-IN")} /-`;

    const base = {
        systemName: quote.systemName?.trim() || "Project",
        quoteTitle: quote.title?.trim() || "Project Quote",
        proposedSystem: proposed,
        grandTotal,
        quoteDate,
        validityDays: String(branding?.validityDays ?? 30),
        companyName: branding?.companyName || "DigiCoders Technologies (P) Ltd.",
        senderName: sender?.name || "Team DigiCoders",
        senderEmail: sender?.email || branding?.email || "",
        contactPerson: lead?.contactPerson?.trim() || "Sir/Ma'am",
        orgName: lead?.orgName?.trim() || "your organization",
    };

    return enrichPlaceholderContextWithLead(base, lead, fieldConfig);
};

export const applyQuotePlaceholders = (template, context) => {
    if (!template) return "";
    return String(template).replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key) => {
        const val = context[key];
        return val !== undefined && val !== null ? String(val) : "";
    });
};

/** Plain text body → simple HTML email */
export const quoteEmailBodyToHtml = (text) => {
    const escaped = String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;max-width:640px;">
        ${escaped.split(/\n\n+/).map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br/>")}</p>`).join("")}
        <p style="margin:16px 0 0;font-size:12px;color:#64748b;">The detailed quote is attached as a PDF.</p>
    </div>`;
};

export const sanitizePdfFilename = (name) =>
    `${(name || "quote").replace(/[^\w\-]+/g, "-").replace(/-+/g, "-")}-quote.pdf`;
