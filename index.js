import express, { json } from 'express'
import path from 'path';
import { fileURLToPath } from 'url';
import connectdb from './config/db.js'
import cors from 'cors'
import CompanyRoute from './route/CompanyRoutes.js'
import DepartmentRoute from './route/DepartmentRoute.js'
import DesignationRoute from './route/DesignationRoute.js'
import EmployeeStatusRoute from './route/EmploymentStatusRoute.js'
import RoleRoute from './route/RoleRoutes.js'
import UserRoute from './route/UserRoute.js'
import WorkShiftRoute from './route/WorkShiftRoute.js'
import permissionRoute from './route/permissionRoute.js'
import AttendanceRoute from './route/AttendanceRoute.js'
import NotificationRoute from './route/NotificationRoute.js'
import HolidayRoute from './route/HolidayRoute.js'
import LeaveTypeRoute from './route/LeaveTypeRoute.js'
import LeaveRoute from './route/LeaveRoute.js'
import RegularizationRoute from './route/RegularizationRoute.js'
import PayrollRoute from './route/PayrollRoute.js'
import ProjectRoute from './route/ProjectRoute.js'
import TaskRoute from './route/TaskRoute.js'
import LeadRoute from './route/LeadRoute.js'
import QuoteRoute from './route/QuoteRoute.js'
import QuoteProfileRoute from './route/QuoteProfileRoute.js'
import cookieParser from 'cookie-parser'
import { startScheduler } from './utills/scheduler.js'
import startAttendanceCron from './cron/attendanceCron.js'
import PolicyRoute from './route/PolicyRoute.js'
import NdaRoute from './route/NdaRoute.js'
import OnboardingRoute from './route/OnboardingRoute.js'
import ComplaintRoute from './route/ComplaintRoute.js'
import TicketRoute from './route/TicketRoute.js'
import PaymentRoute from './route/PaymentRoute.js'

import EnvData from './config/EnvData.js'
const app = express();
app.use(express.json({ limit: "10mb" }))  // raised for lead batch imports (500 rows ~150kb each)
app.use(cookieParser())

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const allowedOrigins = EnvData.CLIENT_URL
    ? EnvData.CLIENT_URL.split(",").map(o => o.trim())
    : ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "https://developmenthrms-frontend.vercel.app", "https://developmenthrms-frontend.vercel.app/"];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true
}))

app.use('/api/company', CompanyRoute);
app.use("/api/permissions", permissionRoute);
app.use('/api/department', DepartmentRoute);
app.use('/api/designation', DesignationRoute);
app.use('/api/employment-status', EmployeeStatusRoute);
app.use('/api/role', RoleRoute);
app.use('/api/user', UserRoute);
app.use('/api/workshift', WorkShiftRoute);
app.use('/api/attendance', AttendanceRoute);
app.use('/api/notifications', NotificationRoute);
app.use('/api/holidays', HolidayRoute);
app.use('/api/leave-types', LeaveTypeRoute);
app.use('/api/leaves', LeaveRoute);
app.use('/api/regularization', RegularizationRoute);
app.use('/api/payroll', PayrollRoute);
app.use('/api/projects', ProjectRoute);
app.use('/api/tasks', TaskRoute);
app.use('/api/leads', LeadRoute);
app.use('/api/quotes', QuoteRoute);
app.use('/api/quote-profiles', QuoteProfileRoute);
app.use('/api/policies', PolicyRoute);
app.use('/api/nda', NdaRoute);
app.use('/api/onboarding', OnboardingRoute);
app.use('/api/complaints', ComplaintRoute);
app.use('/api/tickets', TicketRoute);
app.use('/api/payments', PaymentRoute);

app.get('/', (req, res) => {
    res.send("API is running")
})


app.use('/api/health', (req, res) => {
    res.send("API is working fine")
})





const server = app.listen(EnvData.PORT, () => {
    connectdb()
    startScheduler()
    startAttendanceCron()
    console.log(`Server is running on port ${EnvData.PORT}`)
})

server.timeout = 120000;          // 2 min — time for a single request to complete
server.keepAliveTimeout = 120000; // 2 min — keep socket alive between requests
server.headersTimeout = 125000;   // slightly above keepAliveTimeout