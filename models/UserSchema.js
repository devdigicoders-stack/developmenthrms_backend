import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, "First name is required"],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, "Last name is required"],
        trim: true
    },
    password: {
        type: String,
        required: [true, "Password is required"]
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true
    },
    gender: {
        type: String,
        enum: ["male", "female", "other"],
        default: null
    },
    employeeCode: {
        type: String,
        default: null,
        trim: true
    },
    joiningDate: {
        type: Date,
        default: null
    },
    dateOfBirth: {
        type: Date,
        default: null
    },
    phone: {
        type: String,
        default: null,
        trim: true
    },
    address: {
        type: String,
        default: null,
        trim: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        default: null
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
        default: null
    },
    designation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Designation",
        default: null
    },
    role: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role",
        required: [true, "Role is required"]
    },
    workShift: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkShift",
        default: null
    },
    employmentStatus: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "EmploymentStatus",
        default: null
    },
    reportingTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }, 
    profilePic: {
        publicId: {
            type: String,
        },
        url: {
        }
    },
    otp: {
        type: String,
    },
    otpExpiry: {
        type: Date,
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    }

}, { timestamps: true })

const UserModel = mongoose.model("User", UserSchema)
export default UserModel
