/** Helpers for lead + custom field placeholders in quote emails */

export const customFieldsToObject = (customFields) => {
    if (!customFields) return {};
    if (typeof customFields.get === "function") {
        return Object.fromEntries(customFields.entries());
    }
    if (customFields instanceof Map) {
        return Object.fromEntries(customFields);
    }
    if (typeof customFields === "object") return { ...customFields };
    return {};
};

/** Standard lead columns (not from field config) */
export const LEAD_STANDARD_PLACEHOLDERS = [
    { key: "contactPerson", label: "Contact person", group: "lead" },
    { key: "orgName", label: "Organization", group: "lead" },
    { key: "email", label: "Lead email", group: "lead" },
    { key: "contactNumber", label: "Contact number", group: "lead" },
    { key: "address", label: "Lead address", group: "lead" },
    { key: "leadStatus", label: "Lead status", group: "lead" },
];

export const placeholdersFromFieldConfig = (fieldConfig = []) =>
    [...(fieldConfig || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((f) => ({
            key: f.key,
            label: f.label || f.key,
            group: "custom",
            isCustomField: true,
            fieldType: f.type,
        }));

export const enrichPlaceholderContextWithLead = (ctx, lead, fieldConfig = []) => {
    if (!lead) return { ...ctx };

    const out = { ...ctx };
    out.contactPerson = lead.contactPerson?.trim() || out.contactPerson || "";
    out.orgName = lead.orgName?.trim() || out.orgName || "";
    out.email = lead.email?.trim() || "";
    out.contactNumber = lead.contactNumber?.trim() || "";
    out.address = lead.address?.trim() || "";
    out.leadStatus = lead.status?.trim() || "";

    const custom = customFieldsToObject(lead.customFields);

    for (const f of fieldConfig) {
        if (f?.key) out[f.key] = custom[f.key] ?? "";
    }

    for (const [k, v] of Object.entries(custom)) {
        if (out[k] === undefined) out[k] = v ?? "";
    }

    return out;
};
