import nodemailer from 'nodemailer';
import EnvData from '../config/EnvData.js';

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: EnvData.Email_User,
        pass: EnvData.Email_Pass,
    },
});

/**
 * @returns {{ ok: boolean, messageId?: string, error?: string, skipped?: boolean }}
 */
export const sendMail = async ({ email, title, msg, text, attachments }) => {
    if (!email) {
        return { ok: false, skipped: true, error: "Recipient email is required" };
    }
    if (!EnvData.Email_User || !EnvData.Email_Pass) {
        return { ok: false, skipped: true, error: "Email credentials not configured on server" };
    }
    try {
        const info = await transporter.sendMail({
            from: `"DigiCoders" <${EnvData.Email_User}>`,
            to: email,
            subject: title,
            html: msg,
            text: text || undefined,
            attachments: attachments?.length ? attachments : undefined,
        });
        console.log("Email sent:", info.messageId);
        return { ok: true, messageId: info.messageId };
    } catch (error) {
        console.error("Email send error:", error.message);
        return { ok: false, error: error.message };
    }
};
