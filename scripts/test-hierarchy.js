import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import axios from 'axios';

dotenv.config();

import User from '../models/UserSchema.js';
import Role from '../models/roleSchema.js';
import Company from '../models/CompanySchema.js';
import Leave from '../models/LeaveApplicationSchema.js';
import LeaveType from '../models/leaveTypeSchema.js';

const API_URL = 'http://localhost:8008/api';
const JWT_SECRET = process.env.JWT_SECRET || 'Tom_and_Jerry'; 

// Generate JWT token for a user
const generateToken = (user) => {
    return jwt.sign(
        { userId: user._id, role: user.role.name, company: user.companyId },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
};

// Helper for HTTP requests
const fetchAsUser = async (user, endpoint) => {
    const token = generateToken(user);
    try {
        const response = await axios.get(`${API_URL}${endpoint}`, {
            headers: { Cookie: `token=${token}` }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${endpoint} as ${user.firstName}:`, error.response ? JSON.stringify(error.response.data) : error.message);
        return null;
    }
};

const runTest = async () => {
    try {
        console.log("🟡 Connecting to DB...");
        await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/workastra");
        console.log("🟢 DB Connected!");

        // 1. Setup Roles
        let superAdminRole = await Role.findOne({ name: 'super_admin' });
        let adminRole = await Role.findOne({ name: 'admin' });
        let hrRole = await Role.findOne({ name: 'hr' });
        let employeeRole = await Role.findOne({ name: 'employee' });

        if (!superAdminRole) superAdminRole = await new Role({ name: 'super_admin', displayName: 'Super Admin' }).save();
        if (!adminRole) adminRole = await new Role({ name: 'admin', displayName: 'Admin' }).save();
        if (!hrRole) hrRole = await new Role({ name: 'hr', displayName: 'HR' }).save();
        if (!employeeRole) employeeRole = await new Role({ name: 'employee', displayName: 'Employee' }).save();

        const uniqueSuffix = Date.now();
        const company = new Company({
            name: `Hierarchy Test Corp ${uniqueSuffix}`,
            domain: `testcorp${uniqueSuffix}.com`,
            email: `test${uniqueSuffix}@hierarchycorp.com`,
            phone: "1234567890",
            address: "Test City",
            adminName: "Super AdminTest",
            adminEmail: `sa_test${uniqueSuffix}@corp.com`
        });
        await company.save();

        console.log(`\n🏢 Created Test Company: ${company.companyName}`);

        // 3. Setup Users (The Hierarchy)
        const superAdmin = new User({
            firstName: "Super", lastName: "AdminTest", email: `sa_test${uniqueSuffix}@corp.com`,
            password: "hashed_password", role: superAdminRole._id, isActive: true
        });
        await superAdmin.save();

        const admin1 = new User({
            firstName: "Admin", lastName: "One", email: `admin1_test${uniqueSuffix}@corp.com`, companyId: company._id,
            password: "hashed_password", role: adminRole._id, isActive: true
        });
        await admin1.save();

        const admin2 = new User({
            firstName: "Admin", lastName: "Two", email: `admin2_test${uniqueSuffix}@corp.com`, companyId: company._id,
            password: "hashed_password", role: adminRole._id, isActive: true
        });
        await admin2.save();

        const hr1 = new User({
            firstName: "HR", lastName: "One", email: `hr1_test${uniqueSuffix}@corp.com`, companyId: company._id,
            password: "hashed_password", role: hrRole._id, reportingTo: admin1._id, isActive: true
        });
        await hr1.save();

        const hr2 = new User({
            firstName: "HR", lastName: "Two", email: `hr2_test${uniqueSuffix}@corp.com`, companyId: company._id,
            password: "hashed_password", role: hrRole._id, reportingTo: admin2._id, isActive: true
        });
        await hr2.save();

        const pm1 = new User({
            firstName: "ProjectManager", lastName: "One", email: `pm1_test${uniqueSuffix}@corp.com`, companyId: company._id,
            password: "hashed_password", role: hrRole._id, reportingTo: hr1._id, isActive: true 
        });
        await pm1.save();

        const emp1 = new User({
            firstName: "Employee", lastName: "One", email: `emp1_test${uniqueSuffix}@corp.com`, companyId: company._id,
            password: "hashed_password", role: employeeRole._id, reportingTo: pm1._id, isActive: true
        });
        await emp1.save();

        console.log(`👤 Created Test Users. Hierarchy established.`);
        console.log(`   - Super Admin`);
        console.log(`   - Company: Admin 1 -> HR 1 -> PM 1 -> Employee 1`);
        console.log(`   - Company: Admin 2 -> HR 2`);

        await superAdmin.populate('role');
        await admin1.populate('role');
        await admin2.populate('role');
        await hr1.populate('role');
        await hr2.populate('role');
        await pm1.populate('role');
        await emp1.populate('role');

        // 4. Create Data (Leaves)
        const leaveType = new LeaveType({
            name: "Sick",
            code: "SICK",
            totalDays: 10,
            companyId: company._id
        });
        await leaveType.save();

        const leaveEmp1 = new Leave({
            userId: emp1._id, companyId: company._id, reason: "Sick Leave",
            fromDate: "2024-01-01", toDate: "2024-01-02", days: 2, status: "pending", leaveTypeId: leaveType._id
        });
        await leaveEmp1.save();

        const leaveHr2 = new Leave({
            userId: hr2._id, companyId: company._id, reason: "Vacation",
            fromDate: "2024-02-01", toDate: "2024-02-05", days: 5, status: "pending", leaveTypeId: leaveType._id
        });
        await leaveHr2.save();

        console.log(`\n📄 Created Test Leaves for Employee 1 & HR 2`);

        // 5. Test API Endpoints
        console.log(`\n🚀 RUNNING HIERARCHY TESTS...\n`);

        const testEndpoint = async (user, userName, endpoint, expectedFirstNames) => {
            const data = await fetchAsUser(user, endpoint);
            if (!data) return;

            let records = data.leaves || data.users || [];
            let foundNames = [];

            if (endpoint.includes('leaves')) {
                // For leaves, we populate userId
                foundNames = records.map(r => r.userId?.firstName).filter(Boolean);
            } else if (endpoint.includes('users')) {
                foundNames = records.map(r => r.firstName).filter(Boolean);
            }

            // A basic check to see if the required names are present and unwanted names are NOT present.
            // Expected names must be present, and NO names outside the expected (or the user themselves) should be present.
            const allExpectedPresent = expectedFirstNames.every(name => foundNames.includes(name));
            const noUnexpectedPresent = foundNames.every(name => expectedFirstNames.includes(name) || name === user.firstName);
            
            const isSuccess = allExpectedPresent && noUnexpectedPresent;

            console.log(`[${isSuccess ? '✅ PASS' : '❌ FAIL'}] ${userName} viewing ${endpoint}`);
            if (!isSuccess) {
                console.log(`   Expected to see (subset): [${expectedFirstNames.join(', ')}]`);
                console.log(`   Actually saw: [${foundNames.join(', ')}]`);
            }
        };

        // Delay slightly to let DB settle (though not strictly necessary)
        await new Promise(r => setTimeout(r, 500));

        // Test 1: Admin 1 viewing users
        await testEndpoint(admin1, "Admin 1", "/user/all", ["Admin", "HR", "ProjectManager", "Employee"]);
        
        // Test 2: Admin 2 viewing users (Should NOT see Emp 1, PM 1, HR 1)
        await testEndpoint(admin2, "Admin 2", "/user/all", ["Admin", "HR"]);

        // Test 3: Admin 1 viewing leaves (Should see Emp 1, not HR 2)
        await testEndpoint(admin1, "Admin 1", "/leaves/company", ["Employee"]);

        // Test 4: Admin 2 viewing leaves (Should see HR 2, not Emp 1)
        await testEndpoint(admin2, "Admin 2", "/leaves/company", ["HR"]);

        // Test 5: PM 1 viewing users
        await testEndpoint(pm1, "PM 1", "/user/all", ["ProjectManager", "Employee"]);

        console.log("\n🧹 Cleaning up test data...");
        await Company.findByIdAndDelete(company._id);
        await User.deleteMany({ _id: { $in: [superAdmin._id, admin1._id, admin2._id, hr1._id, hr2._id, pm1._id, emp1._id] } });
        await Leave.deleteMany({ _id: { $in: [leaveEmp1._id, leaveHr2._id] } });
        await LeaveType.findByIdAndDelete(leaveType._id);
        console.log("✨ Cleanup complete!\n");

        process.exit(0);

    } catch (err) {
        console.error("Test Error:", err);
        process.exit(1);
    }
};

runTest();
