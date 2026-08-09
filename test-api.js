import axios from "axios";

async function run() {
    try {
        // 1. login
        const loginRes = await axios.post("http://localhost:8008/api/user/login", {
            email: "admin@example.com", // I don't know the exact email, let me try super admin or something
            password: "password123"
        });
        
        // 2. set cookie
        const cookie = loginRes.headers['set-cookie'];
        
        // 3. fetch report
        const res = await axios.get("http://localhost:8008/api/reports/sales?startDate=2024-01-01&endDate=2026-12-31", {
            headers: { Cookie: cookie[0] }
        });
        console.log("SUCCESS:", JSON.stringify(res.data, null, 2));
    } catch (error) {
        console.log("ERROR:", error.response?.data || error.message);
    }
}
run();
