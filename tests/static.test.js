const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
const referencedIds = [...app.matchAll(/el\('([^']+)'\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds.filter((id) => !ids.includes(id)))];

assert.deepEqual(duplicateIds, [], 'HTML contains duplicate IDs');
assert.deepEqual(missingIds, [], 'app.js references missing HTML IDs');
assert.match(html, /accounts\.google\.com\/gsi\/client/);
assert.match(html, /js\/google-drive\.js/);

console.log('static: all checks passed');
