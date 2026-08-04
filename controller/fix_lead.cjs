const fs = require('fs');
let c = fs.readFileSync('LeadController.js', 'utf8');
c = c.replace(/\{ _id: req.params.id, companyId: cid\(req\) \}/g, '{ _id: req.params.id, companyId: { $in: [cid(req), null] } }');
fs.writeFileSync('LeadController.js', c);
console.log('Fixed LeadController.js');
