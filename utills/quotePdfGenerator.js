import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

let browserPromise = null;

const CHROME_HINT =
    "Install Chrome for PDFs: cd server && npx puppeteer browsers install chrome";

const systemChromePaths = () => {
    if (process.platform === "win32") {
        const local = process.env.LOCALAPPDATA || "";
        const pf = process.env.ProgramFiles || "C:\\Program Files";
        const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
        return [
            path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(pfx86, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
        ];
    }
    if (process.platform === "darwin") {
        return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    }
    return [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ];
};

/** Bundled Puppeteer Chrome → PUPPETEER_EXECUTABLE_PATH → system Chrome */
export const resolveChromeExecutable = () => {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

    try {
        const bundled = puppeteer.executablePath();
        if (bundled && fs.existsSync(bundled)) return bundled;
    } catch {
        /* bundled browser not downloaded */
    }

    for (const candidate of systemChromePaths()) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return null;
};

const launchOptions = () => {
    const executablePath = resolveChromeExecutable();
    if (!executablePath) {
        throw new Error(`Chrome/Chromium not found. ${CHROME_HINT}`);
    }
    return {
        headless: true,
        executablePath,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    };
};

const getBrowser = async () => {
    if (!browserPromise) {
        browserPromise = puppeteer.launch(launchOptions()).catch((err) => {
            browserPromise = null;
            const detail = err?.message || String(err);
            throw new Error(`${detail}. ${CHROME_HINT}`);
        });
    }
    try {
        const browser = await browserPromise;
        if (!browser.connected) {
            browserPromise = null;
            return getBrowser();
        }
        return browser;
    } catch (err) {
        browserPromise = null;
        throw err;
    }
};

/**
 * Render quote HTML to A4 PDF buffer (for email attachment).
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export const generateQuotePdfBuffer = async (html) => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: "load", timeout: 90_000 });
        await page.evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
        });
        await new Promise((r) => setTimeout(r, 500));
        const pdf = await page.pdf({
            format: "A4",
            landscape: true,
            printBackground: true,
            margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        return Buffer.from(pdf);
    } finally {
        await page.close();
    }
};
