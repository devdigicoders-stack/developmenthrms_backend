import mongoose from "mongoose";

const FileSchema = new mongoose.Schema({
    publicId: { type: String, required: true },
    url: { type: String, required: true }
}, { _id: false });

const OnboardingFormSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        required: true
    },
    // Personal Details (some are already in UserSchema like Name, DOB, Gender, Mobile, Email)
    alternateMobile: { type: String, default: null },
    linkedInProfile: { type: String, default: null },
    permanentAddress: { type: String, required: true },
    currentAddress: { type: String, required: true },
    yearsOfExperience: { type: Number, required: true },

    // Documents
    cvFile: FileSchema,
    highSchoolCertificate: FileSchema,
    intermediateCertificate: FileSchema,
    diplomaCertificate: { type: FileSchema, default: null },
    graduationCertificate: { type: FileSchema, default: null },
    aadharFront: FileSchema,
    aadharBack: FileSchema,
    panCard: FileSchema,
    bankPassbook: FileSchema,
    passportPhoto: FileSchema,
    fullSizePhoto: FileSchema,

    // Previous Employment Details
    previousCompany: {
        name: { type: String },
        designation: { type: String },
        website: { type: String },
        dateOfJoining: { type: Date },
        dateOfLastWorkingDay: { type: Date },
        employeeId: { type: String },
        hrName: { type: String },
        hrContact: { type: String },
        hrEmail: { type: String },
        officialEmail: { type: String },
        address: { type: String },
        phone: { type: String },
        reasonForLeaving: { type: String },
        lastSalary: { type: Number },
        linkedInProfile: { type: String },
        // Previous company documents
        offerLetterFile: { type: FileSchema, default: null },
        experienceLetterFile: { type: FileSchema, default: null },
        relievingLetterFile: { type: FileSchema, default: null },
        salarySlipsFile: { type: FileSchema, default: null },
    },

    // References
    professionalReferences: [{
        name: { type: String },
        mobile: { type: String },
        designation: { type: String },
        company: { type: String }
    }],
    personalReferences: [{
        name: { type: String },
        mobile: { type: String },
        relation: { type: String }
    }],

    status: {
        type: String,
        enum: ["submitted", "approved", "rejected"],
        default: "submitted"
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }

}, { timestamps: true });

export default mongoose.model("OnboardingForm", OnboardingFormSchema);
