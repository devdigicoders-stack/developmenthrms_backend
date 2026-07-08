export const resetPasswordOtpTemplate = (name, otp) => `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f9fafb;border-radius:12px;">
        <div style="background:#fff;border-radius:10px;padding:28px 24px;border:1px solid #e5e7eb;">
            <h2 style="color:#111827;margin:0 0 8px;">Password Reset Request</h2>
            <p style="color:#6b7280;margin:0 0 24px;">Hi <strong>${name}</strong>, use the OTP below to reset your password.</p>
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
                <p style="color:#6b7280;font-size:12px;margin:0 0 8px;letter-spacing:1px;">YOUR OTP CODE</p>
                <p style="color:#1d4ed8;font-size:36px;font-weight:700;letter-spacing:8px;margin:0;">${otp}</p>
                <p style="color:#9ca3af;font-size:12px;margin:8px 0 0;">Valid for 10 minutes</p>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin:0;">If you did not request this, please ignore this email. Your password will not change.</p>
        </div>
    </div>
`;
export const loginTemplate = (name) => {
    return `
        <div style="font-family: Arial, sans-serif; padding:20px;">
            <h2 style="color:#333;">Login Successful</h2>
            <p>Hello <b>${name}</b>,</p>
            <p>You have successfully logged into your account.</p>
            <p>If this was not you, please secure your account immediately.</p>
            <br/>
            <p>Thank you for using our service.</p>
            <p>Best regards,<br/>HRMS Team</p>
        </div>
    `;
};

export const userCreatedTemplate = (user, password) => {
    return `
        <div style="font-family: Arial, sans-serif; padding:20px;">
            <h2>User Account Created</h2>
            <p>Hello <b>${user.firstName}</b>,</p>
            <p>Your account has been created successfully.</p>

            <h3>Account Details</h3>
            <ul>
                <li><b>Name:</b> ${user.firstName} ${user.lastName}</li>
                <li><b>Email:</b> ${user.email}</li>
                <li><b>Phone:</b> ${user.phone}</li>
                <li><b>Password:</b>${password ? password : ' (hidden for security reasons)'} </li>
            </ul>

            <p>Welcome to our platform 🎉</p>
            <p>Best regards,<br/>HRMS Team</p>
        </div>
    `;
};