const fs = require('fs');
let c = fs.readFileSync('QuoteController.js', 'utf8');
c = c.replace(/\{ _id: quoteId, companyId \}/g, '{ _id: quoteId, companyId: { $in: [companyId, null] } }');
c = c.replace(/const filter = \{ companyId \};/g, 'const filter = { companyId: { $in: [companyId, null] } };');
c = c.replace(/\{ leadId, companyId \}/g, '{ leadId, companyId: { $in: [companyId, null] } }');
fs.writeFileSync('QuoteController.js', c);
console.log('Fixed QuoteController.js');
