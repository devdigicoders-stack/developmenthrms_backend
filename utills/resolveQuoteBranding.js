import QuoteProfile from "../models/QuoteProfileSchema.js";
import {
    QUOTE_BRANDING,
    DEFAULT_PAYMENT_NOTES,
    DEFAULT_PAYMENT_TERMS,
    DEFAULT_PAYMENT_BANK,
    DEFAULT_PAYMENT_TIMELINE,
    DEFAULT_PAYMENT_OTHER,
    DEFAULT_POLICIES,
    buildPaymentNotesFromProfile,
} from "../config/quoteBranding.js";

/** Map DB profile → HTML/PDF branding object */
export const profileToBranding = (profile) => {
    if (!profile) return null;
    return {
        companyName: profile.companyName,
        tagline: profile.tagline || "#TeamDigiCoders",
        website: profile.website || "",
        email: profile.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        gstNote: profile.gstNote || QUOTE_BRANDING.gstNote,
        validityDays: profile.validityDays ?? 30,
        paymentTerms: (profile.paymentTerms || "").trim() || DEFAULT_PAYMENT_TERMS,
        paymentBankDetails: (profile.paymentBankDetails || "").trim() || DEFAULT_PAYMENT_BANK,
        paymentTimeline: (profile.paymentTimeline || "").trim() || DEFAULT_PAYMENT_TIMELINE,
        paymentOtherNotes: (profile.paymentOtherNotes || "").trim() || DEFAULT_PAYMENT_OTHER,
        paymentNotes: buildPaymentNotesFromProfile(profile),
        logoUrl: profile.logo?.url || null,
        paymentQrUrl: profile.paymentQr?.url || null,
        profileName: profile.name,
        policies: profile.policies && profile.policies.length > 0 ? profile.policies : DEFAULT_POLICIES,
    };
};

export const defaultBranding = () => ({
    ...QUOTE_BRANDING,
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    paymentBankDetails: DEFAULT_PAYMENT_BANK,
    paymentTimeline: DEFAULT_PAYMENT_TIMELINE,
    paymentOtherNotes: DEFAULT_PAYMENT_OTHER,
    paymentNotes: DEFAULT_PAYMENT_NOTES,
    logoUrl: null,
    paymentQrUrl: null,
    profileName: null,
    policies: DEFAULT_POLICIES,
});

/**
 * Resolve branding for a quote: profile on quote → company default profile → static config.
 */
export const resolveQuoteBranding = async (quote, companyId) => {
    const cid = companyId || quote?.companyId;
    let profile = null;

    const profileId = quote?.quoteProfileId?._id ?? quote?.quoteProfileId;
    if (profileId) {
        profile = await QuoteProfile.findOne({
            _id: profileId,
            companyId: cid,
            isDeleted: false,
        }).lean();
    }

    if (!profile && cid) {
        profile = await QuoteProfile.findOne({
            companyId: cid,
            isDefault: true,
            isDeleted: false,
        }).lean();
    }

    return profileToBranding(profile) || defaultBranding();
};
