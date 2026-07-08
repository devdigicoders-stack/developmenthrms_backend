# HRMS — Backend API

A Human Resource Management System REST API built with **Node.js**, **Express**, and **MongoDB**.
@Shree Kumar
---

## Tech Stack

- **Runtime:** Node.js (ESM)
- **Framework:** Express v5
- **Database:** MongoDB + Mongoose
- **Auth:** JWT + Cookie Parser
- **File Upload:** Multer + Cloudinary
- **Email:** Nodemailer
- **Scheduler:** node-cron

---

## Getting Started

### Prerequisites
- Node.js >= 18
- MongoDB instance (local or Atlas)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
PORT=5000
MONGO_URI=<your_mongodb_uri>
JWT_SECRET=<your_jwt_secret>
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>
EMAIL_USER=<email>
EMAIL_PASS=<password>
```

### Run

```bash
# Development
npm run dev

# Production
npm start

# Seed Super Admin
npm run seed
```

---

## Super Admin Credentials (Seeded)

```json
{
  "email": "superadmin@hrms.com",
  "password": "SuperAdmin@123",
  "role": "super_admin"
}
```

---

## API Reference

Base URL: `/api`

> Protected routes require `Authorization` via JWT cookie. Role-based access is enforced via `authorize()` and permission-based access via `hasPermission()`.

---

### Auth / Users — `/api/user`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/signup` | Public | Register user |
| POST | `/login` | Public | Login |
| POST | `/forgot-password` | Public | Send reset email |
| POST | `/reset-password` | Public | Reset password |
| GET | `/logout` | Public | Logout |
| GET | `/profile` | Protected | Get own profile |
| PUT | `/profile` | Protected | Update profile (with photo) |
| PATCH | `/change-password` | Protected | Change own password |
| PATCH | `/:id/change-password` | Protected + `UPDATE_USER` | Admin change password |
| PUT | `/:id` | Protected | Admin update user |
| PATCH | `/:id/toggle-status` | Protected | Toggle user active/inactive |
| GET | `/all` | Protected | Get all users |
| GET | `/company/:companyId/users` | Protected | Get users by company |
| GET | `/me` | Protected | Verify token & get user |

---

### Company — `/api/company`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | `super_admin` | Create company |
| POST | `/with-admin` | `super_admin` | Create company with admin |
| GET | `/` | Protected | Get own company |
| GET | `/all` | `super_admin` | Get all companies |
| GET | `/:id` | `super_admin` | Get company by ID |
| PUT | `/:id` | `super_admin` | Update company |
| PUT | `/:id/with-admin` | `super_admin` | Update company + admin |
| DELETE | `/:id` | `super_admin` | Delete company |
| PATCH | `/:id/status` | `super_admin` | Toggle company status |

---

### Department — `/api/department`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | `super_admin`, `admin` | Create department |
| GET | `/` | Protected | Get active departments |
| GET | `/all` | `super_admin`, `admin` | Get all departments |
| GET | `/company` | Protected | Get company departments |
| GET | `/by-company/:companyId` | Protected | Get departments by company |
| GET | `/:id` | Protected | Get department by ID |
| PUT | `/:id` | `super_admin`, `admin` | Update department |
| DELETE | `/:id` | `super_admin`, `admin` | Soft delete |
| PATCH | `/restore/:id` | `super_admin`, `admin` | Restore deleted |
| PATCH | `/toggle-status/:id` | `super_admin`, `admin` | Toggle status |

---

### Designation — `/api/designation`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/create` | Create designation |
| GET | `/all/active` | Get active designations |
| GET | `/all` | Get all designations |
| GET | `/getByDepartment/:departmentId` | Get by department |
| PUT | `/update/:id` | Update |
| DELETE | `/delete/:id` | Soft delete |
| PUT | `/restore/:id` | Restore |
| PUT | `/toggleStatus/:id` | Toggle status |

---

### Role — `/api/role`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/create` | `super_admin`, `admin` | Create role |
| GET | `/all` | Public | Get all roles |
| GET | `/all/active` | Public | Get active roles |
| GET | `/all/:companyId` | Public | Get roles by company |
| GET | `/allroles` | Protected | Get company roles |
| PUT | `/update/:id` | `super_admin`, `admin` | Update role |
| DELETE | `/delete/:id` | `super_admin`, `admin` | Soft delete |
| POST | `/restore/:id` | `super_admin`, `admin` | Restore |
| PATCH | `/toggle-status/:id` | `super_admin`, `admin` | Toggle status |

---

### Work Shift — `/api/workshift`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | `super_admin`, `admin` | Create shift |
| GET | `/company` | Protected | Get company shifts |
| GET | `/by-company/:companyId` | Protected | Get shifts by company |
| PUT | `/:id` | `super_admin`, `admin` | Update shift |
| DELETE | `/:id` | `super_admin`, `admin` | Delete shift |
| PATCH | `/:id/toggle` | `super_admin`, `admin` | Toggle status |

---

### Attendance — `/api/attendance`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/checkin` | Protected | Check in |
| PATCH | `/checkout` | Protected | Check out |
| GET | `/today` | Protected | Today's attendance |
| GET | `/my` | Protected | Own attendance history |
| GET | `/summary` | Protected | Attendance summary |
| GET | `/team` | `VIEW_TEAM_ATTENDANCE` | Team attendance |
| GET | `/company` | `VIEW_ALL_ATTENDANCES` | Company attendance |
| PATCH | `/:id/manual-punch` | `UPDATE_ATTENDANCE` | Manual punch |
| POST | `/admin-punch` | `Create_ATTENDANCE` | Admin create punch |

---

### Regularization — `/api/regularization`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Protected | Request regularization |
| GET | `/my` | Protected | Own requests |
| GET | `/team` | Permission-based | Team requests |
| GET | `/company` | `VIEW_ALL_ATTENDANCES` | Company requests |
| PATCH | `/:id/approve` | `APPROVE_REGULARIZATION` | Approve |
| PATCH | `/:id/reject` | `REJECT_REGULARIZATION` | Reject |

---

### Holidays — `/api/holidays`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Protected | Get holidays |
| POST | `/` | `Create_HOLIDAY` | Create holiday |
| POST | `/bulk` | `Create_HOLIDAY` | Bulk create |
| POST | `/csv-upload` | `Create_HOLIDAY` | Upload via CSV (max 2MB) |
| PUT | `/:id` | `UPDATE_HOLIDAY` | Update |
| DELETE | `/:id` | `DELETE_HOLIDAY` | Delete |

---

### Leave Types — `/api/leave-types`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Protected | Get leave types |
| GET | `/by-company/:companyId` | Protected | Get by company |
| POST | `/` | `Create_LEAVE_TYPE` | Create |
| PUT | `/:id` | `UPDATE_LEAVE_TYPE` | Update |
| DELETE | `/:id` | `DELETE_LEAVE_TYPE` | Delete |

---

### Leaves — `/api/leaves`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/balance` | Protected | Own leave balance |
| GET | `/balance/user/:userId` | `ASSIGN_LEAVE` | User balance |
| POST | `/balance/assign` | `ASSIGN_LEAVE` | Assign balance |
| POST | `/balance/bulk-assign` | `BULK_ASSIGN_LEAVE` | Bulk assign |
| POST | `/apply` | Protected | Apply for leave |
| GET | `/my` | Protected | Own applications |
| GET | `/company` | Protected | Company applications |
| PATCH | `/:id/approve` | `APPROVE_LEAVE` | Approve |
| PATCH | `/:id/reject` | `REJECT_LEAVE` | Reject |
| PATCH | `/:id/cancel` | Protected | Cancel |

---

### Payroll — `/api/payroll`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/salary-structure` | `MANAGE_PAYROLL` | Create salary structure |
| PUT | `/salary-structure/:id` | `MANAGE_PAYROLL` | Update |
| DELETE | `/salary-structure/:id` | `MANAGE_PAYROLL` | Delete |
| GET | `/salary-structure/company` | `MANAGE_PAYROLL` | Company structures |
| GET | `/salary-structure/user/:userId` | `MANAGE_PAYROLL` | User structures |
| POST | `/run` | `MANAGE_PAYROLL` | Generate payroll |
| GET | `/run` | `MANAGE_PAYROLL` | Get payroll runs |
| GET | `/summary` | `MANAGE_PAYROLL` | Payroll summary |
| PATCH | `/run/bulk-approve` | `APPROVE_PAYROLL` | Bulk approve |
| PATCH | `/run/bulk-mark-paid` | `APPROVE_PAYROLL` | Bulk mark paid |
| PATCH | `/run/:id/approve` | `APPROVE_PAYROLL` | Approve run |
| PATCH | `/run/:id/mark-paid` | `APPROVE_PAYROLL` | Mark paid |
| DELETE | `/run/:id` | `MANAGE_PAYROLL` | Delete run |
| GET | `/my` | Protected | Own payslips |

---

### Notifications — `/api/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get my notifications |
| GET | `/unread-count` | Unread count |
| PATCH | `/read-all` | Mark all as read |
| DELETE | `/clear-all` | Clear all |
| PATCH | `/:id/read` | Mark one as read |
| DELETE | `/:id` | Delete one |

---

### Permissions — `/api/permissions`

Manage role-based permissions.

---

## Health Check

```
GET /api/health  →  "API is working fine"
```

---

## Project Structure

```
server/
├── config/         # DB, env, permissions
├── controller/     # Route handlers
├── middleware/     # Auth, multer
├── models/         # Mongoose schemas
├── route/          # Express routers
├── scripts/        # Seed scripts
├── utills/         # Email, cloudinary, scheduler, notifications
└── index.js        # App entry point
```
