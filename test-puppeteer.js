import puppeteer from 'puppeteer';
import 'dotenv/config';

(async () => {
  try {
    const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
    console.log("Executable path from env:", fromEnv);
    
    const executablePath = fromEnv || puppeteer.executablePath();
    console.log("Using executable path:", executablePath);
    
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log("Browser launched successfully!");
    await browser.close();
  } catch (error) {
    console.error("Puppeteer launch failed:", error);
  }
})();
