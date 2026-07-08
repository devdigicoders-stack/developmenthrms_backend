 import fs from "fs";
import path from "path";
import { DEFAULT_PAYMENT_NOTES } from "../config/quoteBranding.js";
import { applyQuotePlaceholders } from "../config/quoteEmailTemplates.js";
import { defaultBranding } from "./resolveQuoteBranding.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => `₹ ${(Number(n) || 0).toLocaleString("en-IN")} /-`;

const isClientSidePrice = (req) => {
    if (!req) return false;
    if (req.priceType === "client_side") return true;
    if (req.priceType === "amount") return false;
    const term = (req.term || "").trim().toLowerCase();
    return term === "client side" && !(Number(req.price) > 0);
};

const formatReqPrice = (req) => {
    if (isClientSidePrice(req)) return "Client Side";
    if (Number(req.price) > 0) return fmt(req.price);
    return "—";
};

const leftWaveSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 1000' preserveAspectRatio='none'%3E%3Cpath fill='%2325140b' stroke='none' d='M0,0 L110,0 C140,66 140,134 110,200 C80,266 80,334 110,400 C140,466 140,534 110,600 C80,666 80,734 110,800 C140,866 140,934 110,1000 L0,1000 Z'/%3E%3C/svg%3E`;

// Function to get the logo as base64
const getLogoBase64 = () => {
    try {
        const publicDir = path.join(process.cwd(), "../client/public");
        const possibleFiles = ["logo.png", "logo1.png", "logo.jpeg", "logo.jpg"];
        for (const file of possibleFiles) {
            const logoPath = path.join(publicDir, file);
            if (fs.existsSync(logoPath)) {
                const ext = path.extname(logoPath).replace(".", "") || "png";
                const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'png';
                return `data:image/${mime};base64,${fs.readFileSync(logoPath, "base64")}`;
            }
        }
    } catch (e) {
        console.error("Error reading logo:", e);
    }
    return "";
};

// Function to get the local QR code as base64
const getQrBase64 = () => {
    try {
        const publicDir = path.join(process.cwd(), "../client/public");
        const possibleFiles = ["QR.png", "qr.png", "QR.jpeg", "qr.jpg"];
        for (const file of possibleFiles) {
            const qrPath = path.join(publicDir, file);
            if (fs.existsSync(qrPath)) {
                const ext = path.extname(qrPath).replace(".", "").toLowerCase();
                const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'png';
                return `data:image/${mime};base64,${fs.readFileSync(qrPath, "base64")}`;
            }
        }
    } catch (e) {
        console.error("Error reading QR:", e);
    }
    return "";
};

export const buildQuoteHtml = (quote, lead, options = {}) => {
    const baseUrl = (options.clientBaseUrl || "http://localhost:5173").replace(/\/$/, "");
    const b = options.branding || defaultBranding();
    let logoUrl = getLogoBase64();
    let localQrUrl = getQrBase64();
    const quoteQrRaw = quote.paymentQrUrl?.trim();
    let quoteQrUrl = "";
    if (quoteQrRaw) {
        if (quoteQrRaw.startsWith("http") || quoteQrRaw.startsWith("data:")) {
            quoteQrUrl = quoteQrRaw;
        } else {
            quoteQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=${encodeURIComponent(quoteQrRaw)}`;
        }
    }
    let finalQrUrl = quoteQrUrl || b.paymentQr?.url || b.paymentQrUrl || localQrUrl;
    if (!logoUrl) logoUrl = b.logoUrl || `${baseUrl}/logo.png`;
    const phCtx = options.placeholderContext || null;
    const ph = (text) => esc(phCtx ? applyQuotePlaceholders(String(text), phCtx) : String(text));

    const proposedLabel = quote.proposedSystemCategory
        ? quote.proposedSystemCategory === "Other"
            ? quote.proposedSystemOther || "Other"
            : quote.proposedSystemCategory
        : quote.proposedSystem || "Website/Application/Portal";

    const pages = quote.pages?.filter((p) => p.name) || [];
    const tech = quote.techStack?.filter((t) => t.label) || [];
    const reqs = quote.otherRequirements?.filter((r) => r.requirement) || [];
    const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
    
    // Modules HTML
    const modulesHtml = pages.map(page => {
        const descs = (page.descriptions || []).filter(Boolean);
        if (descs.length === 0) return "";
        const chunks = [];
        for (let i = 0; i < descs.length; i += 8) {
            chunks.push(descs.slice(i, i + 8));
        }
        return chunks.map(chunk => `
            <div class="page-break"></div>
            <div class="page-container">
                <div class="content-layer">
                    <h1 class="page-title">${esc(page.name)}</h1>
                    <table class="module-table">
                        <tbody>
                            ${chunk.map(d => `<tr><td>${ph(d)}</td></tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join("");
    }).join("");

    let techHtml = "";
    if (tech.length) {
        techHtml = chunkArray(tech, 8).map(chunk => `
            <div class="page-break"></div>
            <div class="page-container">
                <div class="content-layer">
                    <h1 class="page-title">Tech Stack</h1>
                    <table class="module-table">
                        <tbody>
                            ${chunk.map(t => `<tr><td>${ph(t.label)} ${t.value ? `– ${ph(t.value)}` : ""}</td></tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join("");
    }

    let reqsHtml = "";
    if (reqs.length) {
        const reqChunks = chunkArray(reqs, 6);
        reqsHtml = reqChunks.map((chunk, i) => `
            <div class="page-break"></div>
            <div class="page-container">
                <div class="content-layer">
                    <h1 class="page-title">Other Requirements for ${esc(proposedLabel)}</h1>
                    <table class="costing-table">
                        <thead>
                            <tr>
                                <th>Requirement (s)</th>
                                <th>Term (s)</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${chunk.map(r => `<tr><td>${ph(r.requirement)}</td><td>${ph(r.term || "-")}</td><td>${formatReqPrice(r)}</td></tr>`).join("")}
                            ${i === reqChunks.length - 1 ? `<tr><td colspan="3" style="text-align:right; font-weight:bold;">Total : Client Side</td></tr>` : ""}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join("");
    }

    const pageChunks = pages.length ? chunkArray(pages, 6) : [[]];
    const costingHtml = pageChunks.map((chunk, i) => `
        <div class="page-break"></div>
        <div class="page-container">
            <div class="content-layer">
                <h1 class="page-title">Costing for Development of ${esc(proposedLabel)}</h1>
                <table class="costing-table">
                    <thead>
                        <tr>
                            <th>Individuals</th>
                            <th>Term (s)</th>
                            <th>Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${chunk.map(p => `<tr><td>${ph(p.name)}</td><td>One Time</td><td>${fmt(p.cost)}</td></tr>`).join("")}
                        ${i === pageChunks.length - 1 ? `
                        <tr>
                            <td colspan="2" style="text-align:right; font-weight:bold; font-size:20px;">Sub Total</td>
                            <td style="font-weight:bold; font-size:20px;">${fmt(quote.totalPagesCost + (quote.totalRequirementsCost||0))}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="text-align:right; font-weight:bold; font-size:18px;">18% GST (Tax)</td>
                            <td style="font-size:18px;">Excluded</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="text-align:right; font-weight:bold; font-size:20px;" class="red-text">Offered Price/Net Amount</td>
                            <td style="font-weight:bold; font-size:20px;" class="red-text">${fmt(quote.grandTotal)}</td>
                        </tr>
                        ` : ""}
                    </tbody>
                </table>
            </div>
        </div>
    `).join("");

    let notesHtml = "";
    const notesTrimmed = quote.notes ? ph(quote.notes).trim() : "";
    if (notesTrimmed) {
        const notesLines = notesTrimmed.split('\n').filter(Boolean);
        const smartChunkLines = (lines, charsPerLine, maxLines) => {
            const chunks = [];
            let currentChunk = [];
            let currentLines = 0;
            for (const line of lines) {
                const visualLines = Math.max(1, Math.ceil(line.length / charsPerLine));
                if (currentLines + visualLines > maxLines && currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentLines = 0;
                }
                currentChunk.push(line);
                currentLines += visualLines;
            }
            if (currentChunk.length > 0) chunks.push(currentChunk);
            return chunks;
        };
        const notesChunks = smartChunkLines(notesLines, 110, 15);
        notesHtml = notesChunks.map((chunk, i) => `
    <!-- Notes & Terms -->
    <div class="page-break"></div>
    <div class="page-container">
        <div class="content-layer">
            <h1 class="page-title" style="font-weight:bold;">Notes & Terms</h1>
            <ul style="list-style:none; padding-left:0; margin-top: 20px;">
                ${chunk.map(line => 
                    `<li style="margin-bottom:16px; font-size:20px; line-height:1.6; white-space:pre-wrap;">❖ ${line.trim()}</li>`
                ).join('')}
            </ul>
        </div>
    </div>
        `).join("");
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${esc(quote.title)} — ${esc(quote.systemName)}</title>
    <style>
        @page { size: 330mm 205mm; margin: 0; }
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        html, body { 
            margin: 0; padding: 0; width: 330mm; height: 205mm; color: #000; background: #f2f2f2; 
            font-family: 'Roboto', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; 
        }
        
        .page-break { page-break-before: always; break-before: page; }
        
        .page-container {
            width: 330mm; height: 205mm; position: relative; overflow: hidden;
            background-color: #f4f4f4; /* Lighter background matching the reference */
            padding: 20mm 20mm 20mm 35mm; /* Padding for the 30mm wave */
        }
        
        /* The Wave Background */
        .page-container::before {
            content: ""; position: absolute; top: 0; left: 0; bottom: 0; width: 35mm;
            background-image: url("${leftWaveSvg}"); background-size: 100% 100%; z-index: 1;
            background-repeat: no-repeat; border: none; outline: none;
        }
        

        .content-layer { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; }

        /* Title Page */
        .title-page-bg { background-color: #f7bb54 !important; }
        .title-page-bg::before { display: block !important; background-image: none !important; background-color: #25140b !important; width: 6mm !important; }
        .title-page-bg::after { display: none !important; }
        .title-page { text-align: center; justify-content: space-between; align-items: center; padding-top: 50px; padding-bottom: 30px; }
        .main-logo { width: 580px; max-width: 90%; max-height: 500px; object-fit: contain; margin: auto; }
        .title-bottom { margin-top: auto; padding-top: 30px; color: #25140b; }
        .title-text { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
        .title-sub { font-size: 18px; }

        /* Typography */
        h1.page-title { font-size: 42px; color: #25140b; margin-top: 0; margin-bottom: 20px; text-decoration: underline; text-decoration-color: #25140b; }
        p, li { font-size: 16px; line-height: 1.6; }
        
        /* Tables */
        table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #faebd7; }
        th, td { border: 1px solid #000; padding: 12px; font-size: 16px; }
        th { font-weight: bold; text-align: left; }
        .costing-table td { font-weight: 600; }
        
        /* Specific Page Styles */
        .milestones { display: flex; justify-content: space-between; margin-top: 30px; text-align: center; }
        .milestone-item { flex: 1; }
        .milestone-num { color: #003366; font-size: 24px; font-weight: bold; }
        .milestone-text { font-size: 20px; font-weight: bold; margin-top: 5px; }
        .milestone-box { border: 2px solid #f5a623; border-radius: 10px; padding: 15px; text-align: center; margin-top: 20px; font-size: 18px; font-weight: bold; }

        /* Services Page */
        .services-page {
            background-color: #25140b !important;
            color: #f5a623 !important;
        }
        .services-page::before {
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 1000' preserveAspectRatio='none'%3E%3Cpath fill='%23f4f4f4' d='M0,0 L185,0 C220,66 220,134 185,200 C150,266 150,334 185,400 C220,466 220,534 185,600 C150,666 150,734 185,800 C220,866 220,934 185,1000 L0,1000 Z'/%3E%3Cpath fill='%23f5a623' d='M0,0 L180,0 C215,66 215,134 180,200 C145,266 145,334 180,400 C215,466 215,534 180,600 C145,666 145,734 180,800 C215,866 215,934 180,1000 L0,1000 Z'/%3E%3Cpath fill='%23f4f4f4' d='M0,0 L160,0 C195,66 195,134 160,200 C125,266 125,334 160,400 C195,466 195,534 160,600 C125,666 125,734 160,800 C195,866 195,934 160,1000 L0,1000 Z'/%3E%3C/svg%3E");
            width: 85mm;
            background-repeat: no-repeat; border: none; outline: none;
        }
        .services-page .vertical-text {
            color: #25140b; z-index: 2; left: 28mm; font-size: 50px; font-weight: bold; opacity: 1; letter-spacing: 2px;
        }
        
        .services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 18px; font-weight: bold; margin-top: 40px; padding-left: 70mm; }
        .services-grid div::before { content: "❖ "; color: #f4f4f4; margin-right: 8px; font-size: 20px; }
        .services-grid div { display: flex; align-items: center; color: #f5a623; }
        
        .module-table td { background-color: #faebd7; font-size: 24px; padding: 20px 15px; font-weight: 600; }
        .costing-table th { background: transparent; font-size: 24px; padding: 20px 15px; }
        .costing-table td { border: 1px solid #000; font-size: 24px; padding: 20px 15px; }
        .red-text { color: red; font-weight: bold; }
        
        .vertical-text { position: absolute; left: 15mm; top: 50%; transform: translate(-50%, -50%) rotate(-90deg); font-size: 48px; font-weight: bold; color: #fff; z-index: 3; white-space: nowrap; }
    </style>
</head>
<body>

    <!-- Page 1: Title -->
    <div class="page-container title-page-bg">
        <div class="content-layer title-page">
            <img src="${logoUrl}" alt="Logo" class="main-logo" onerror="this.style.display='none'" />
            <div class="title-bottom">
                <div class="title-text">Proposal For <span style="text-decoration: underline;">${esc(proposedLabel)}</span> from #TeamDigiCoders</div>
                <div class="title-sub">DigiCoders Technologies (P) Ltd.</div>
            </div>
        </div>
    </div>

    <!-- Page 2: About -->
    <div class="page-break"></div>
    <div class="page-container">
        <div class="content-layer">
            <h1 class="page-title" style="text-decoration:none;">About ${esc(b.companyName)}</h1>
            <p style="font-size: 22px; line-height: 1.6;">${esc(b.companyName)} Best Software Development Company. We Leading by young software Engineers and Entrepreneurs. Software Company today operates on many different business model and provide a wide array of products and services. A software Company to become faster and more productive for the customer than ever. ${esc(b.companyName)} Best software development company. We Provide the best Software services like Software development Website Development, Mobile Application Development, Digital Marketing, and Internship/Training Programs.</p>
            
            <h1 class="page-title" style="text-decoration:underline; text-align:center; margin-top:30px;">Milestones</h1>
            <div class="milestones">
                <div class="milestone-item"><div class="milestone-num">50+</div><div class="milestone-text">Team</div></div>
                <div class="milestone-item"><div class="milestone-num">1250+</div><div class="milestone-text">Projects</div></div>
                <div class="milestone-item"><div class="milestone-num">1100+</div><div class="milestone-text">Clients</div></div>
                <div class="milestone-item"><div class="milestone-num">50+</div><div class="milestone-text">Products</div></div>
                <div class="milestone-item"><div class="milestone-num">20+</div><div class="milestone-text">Technologies</div></div>
            </div>
            
            <div class="milestone-box">
                A Company Leading By Young Engineer's, Entrepreneur's and Innovative Team<br/>
                10+ Years of Experienced Team
            </div>
        </div>
    </div>

    <!-- Page 3: Our Services -->
    <div class="page-break"></div>
    <div class="page-container services-page">
        <div class="vertical-text">Our Services</div>
        <div class="content-layer">
            <div class="services-grid">
                <div>Website Development</div><div>Taxi Booking Apps</div>
                <div>Web Portals Developments</div><div>Food Delivery Apps</div>
                <div>Software Development</div><div>Service Provider Apps</div>
                <div>Android Application Development</div><div>Tournament/Contest Apps</div>
                <div>Mobile Apps Development</div><div>Real Estate Software</div>
                <div>Digital Marketing</div><div>Pathology Software</div>
                <div>Graphics Designing</div><div>Hospital Software</div>
                <div>Promotional Video</div><div>Small Business Software</div>
                <div>Logo & Banner Designing</div><div>Billing Software</div>
                <div>Content Writing</div><div>Examination Software</div>
                <div>Domain & Hosting Provider</div><div>Education Portals</div>
                <div>ERP, CRM Development</div><div>Hotels Management Software</div>
                <div>MLM Website/App Development</div><div>School Management Software</div>
                <div>E-Commerce Development</div><div>College Projects</div>
                <div>Desktop Software Development</div><div>Training/Internship Programs</div>
            </div>
        </div>
    </div>

    <!-- Page 4: Proposal Intro -->
    <div class="page-break"></div>
    <div class="page-container">
        <div class="content-layer">
            <h1 class="page-title">Proposal for Your ${esc(proposedLabel)}</h1>
            <p style="font-size: 22px; line-height: 1.6;">Hello ${esc(lead?.contactPerson || "Sir/Ma'am")},</p>
            <p style="font-size: 22px; line-height: 1.6;">As per the study and observation of your organization and it's working pattern, we at ${esc(b.companyName)} Team have designed this study document as a contract for you, please consider these points that we have studied at your organization.</p>
            <p style="color:#003366; font-weight:bold; font-size:22px; margin-top:20px;">As per your Requirements and Description, Your ${esc(proposedLabel)} will contain following Modules :</p>
            
            <div style="display:flex; flex-wrap:wrap; margin-top:20px;">
                ${pages.map(p => `<div style="width:50%; font-size:22px; margin-bottom:12px;">❖ ${ph(p.name)}</div>`).join("")}
            </div>
        </div>
    </div>

    <!-- Page 5+: Dynamic Modules -->
    ${modulesHtml}

    <!-- Tech Stack -->
    ${techHtml}

    <!-- Other Requirements -->
    ${reqsHtml}

    <!-- Costing -->
    ${costingHtml}

    ${notesHtml}

    <!-- Payment Terms -->
    <div class="page-break"></div>
    <div class="page-container">
        <div class="content-layer">
            <h1 class="page-title" style="font-weight:bold;">Payment Method and Time Duration</h1>
            <div style="margin-top: 20px;">
                <p style="font-size:20px; line-height:1.6; margin-bottom:12px;">❖ ${esc(b.paymentTimeline || "To Develop this type of system we need 50-60 working days.")}</p>
                <p style="font-size:20px; line-height:1.6; margin-bottom:12px;">❖ We accept payment in all the ways like – By Cash, By Cheque, By Bank Transfer, By UPI or DD.</p>
                <ul style="list-style:none; padding-left: 0; margin-top: 10px;">
                    ${(quote.paymentTerms || b.paymentTerms || "Our Payment Terms are :\n1st payment installment 40% in Advance\n2nd payment installment 30% at 50% completion\n3rd Final payment 30% at delivery")
                        .split("\n").filter(Boolean).map(line => `<li style="font-size:20px; line-height:1.6; margin-bottom: 8px;">❖ ${esc(line.replace(/^[-•*❖\s]+/, ''))}</li>`).join("")}
                </ul>
                
                <div style="margin-top: 20px;">
                    <p style="text-decoration:underline; font-weight:bold; font-size:24px; margin-bottom: 15px;">Our Payment & Banking Details are :</p>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <p style="font-size:20px; line-height:1.6;">${esc(b.paymentBankDetails || "A/c Holder Name: DigiCoders Technologies Private Limited\nBank Name: Central Bank of India\nA/c Number: 3755419817\nIFS Code: CBIN0280145\nBranch: Vivekanand Polyclinic, Lucknow.").replace(/\n/g, '<br/>')}</p>
                        </div>
                        ${finalQrUrl ? `<img src="${esc(finalQrUrl)}" style="width:180px; height:180px; object-fit:contain; border:2px solid #ccc; padding:10px; background:#fff; margin-right: 20px; margin-top: -30px; border-radius: 8px;" />` : `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=Please+Upload+Your+QR+Code+in+Admin+Panel" style="width:180px; height:180px; object-fit:contain; border:2px solid #ccc; padding:10px; background:#fff; margin-right: 20px; margin-top: -30px; border-radius: 8px;" />`}
                    </div>
                </div>
            </div>
        </div>
    </div>



    <!-- Signatures -->
    <div class="page-break"></div>
    <div class="page-container">
        <div class="content-layer">
            <h1 class="page-title" style="font-weight:bold;">Grievance and Acceptance of Proposal</h1>
            
            <div style="margin-bottom: 20px;">
                <p style="font-size: 20px; margin: 8px 0;">For any Grievance/Enquiry Contact Us:</p>
                <p style="font-size: 20px; margin: 8px 0;">${esc(b.phone)}</p>
                <p style="font-size: 20px; margin: 8px 0;">Mail us on at: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>, or visit: <a href="${esc(b.website)}">${esc(b.website)}</a></p>
            </div>
            
            <hr style="border:0; border-top:2px solid #000; margin:30px 0; width:100%;" />
            
            <div style="display:flex; justify-content:space-between; margin-top:30px; width:100%;">
                <div style="width:45%; display:flex; flex-direction:column; justify-content:space-between; height:200px;">
                    <div>
                        <p style="font-weight:bold; font-size:20px; margin:0 0 10px 0;">Client:</p>
                    </div>
                    <div style="border-top:1px dashed #000; padding-top:10px; font-size:20px;">
                        (Authorized Signatory from Client Side)
                    </div>
                </div>
                <div style="width:45%; display:flex; flex-direction:column; justify-content:space-between; height:200px;">
                    <div>
                        <p style="font-weight:bold; font-size:20px; margin:0 0 10px 0;">Developer: ${esc(b.companyName)}</p>
                        <p style="font-size:20px; margin:0; line-height:1.4;">${esc(b.address)}</p>
                    </div>
                    <div style="border-top:1px dashed #000; padding-top:10px; font-size:20px;">
                        (Authorized Signatory from ${esc(b.companyName)})<br/>
                        <span style="font-size: 16px;">* Terms & Conditions Apply</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

</body>
</html>`;
};
