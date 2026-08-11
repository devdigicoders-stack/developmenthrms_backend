import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Role from "../models/roleSchema.js";
import User from "../models/UserSchema.js";
import { permission } from "../config/permission.js";
import { SUPER_ADMIN_ONLY_PERMISSIONS } from "../config/superAdminOnly.js";

dotenv.config();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "superadmin@hrms.com";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "superadmin@hrms.com";

const getAllPermissions = () =>
  Object.values(permission).flatMap((module) => Object.values(module));

const seed = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not set in .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    const allPermissions = getAllPermissions();

    let role = await Role.findOne({ name: "super_admin" });

    if (role) {
      role.permissions = allPermissions;
      role.companyId = null;
      role.status = true;
      role.isdeleted = false;
      await role.save();
      console.log("✅ Super Admin role updated");
    } else {
      role = await Role.create({
        name: "super_admin",
        companyId: null,
        permissions: allPermissions,
        status: true,
        isdeleted: false,
      });
      console.log("✅ Super Admin role created");
    }

    console.log("Total permissions assigned:", allPermissions.length);

    // Remove company-management perms from any non–super-admin roles (legacy / mistaken grants)
    const stripped = await Role.updateMany(
      { name: { $ne: "super_admin" } },
      { $pull: { permissions: { $in: SUPER_ADMIN_ONLY_PERMISSIONS } } }
    );
    if (stripped.modifiedCount > 0) {
      console.log(`✅ Stripped company perms from ${stripped.modifiedCount} role(s)`);
    }

    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
    let existingUser = await User.findOne({ email: SUPER_ADMIN_EMAIL });

    if (existingUser) {
      existingUser.firstName = "Super";
      existingUser.lastName = "Admin";
      existingUser.password = hashedPassword;
      existingUser.role = role._id;
      existingUser.companyId = null;
      existingUser.employeeCode = "SUPER001";
      existingUser.joiningDate = existingUser.joiningDate || new Date();
      existingUser.isActive = true;
      existingUser.isDeleted = false;
      await existingUser.save();
      console.log("✅ Super Admin user updated");
    } else {
      await User.create({
        firstName: "Super",
        lastName: "Admin",
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        role: role._id,
        companyId: null,
        employeeCode: "SUPER001",
        joiningDate: new Date(),
        isActive: true,
        isDeleted: false,
      });
      console.log("✅ Super Admin user created");
    }

    console.log("\n📧 Login credentials:");
    console.log(`   Email:    ${SUPER_ADMIN_EMAIL}`);
    console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeder error:", error.message);
    if (error.errors) {
      Object.values(error.errors).forEach((e) => console.error("  -", e.message));
    }
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

seed();
