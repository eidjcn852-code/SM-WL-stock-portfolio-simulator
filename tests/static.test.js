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
assert.match(html, /js\/google-drive\.js\?v=20260724-drive-autosave/);
assert.match(html, /js\/app\.js\?v=20260724-drive-autosave/);
assert.match(html, /id="cps-account-sm"/);
assert.match(html, /id="cps-account-wl"/);
assert.match(html, /id="cps-new-exposure-multiplier"/);
assert.match(html, /自動雲端帳戶：<strong>eidjcn852@gmail\.com<\/strong>/);
assert.match(app, /version: 3/);
assert.match(app, /accounts:\s*\{\s*SM:/);
assert.match(app, /payload\.version === 3/);
assert.match(app, /data-exposure-id/);
assert.match(app, /=== '00631L' \? 2 : 1/);
assert.match(app, /Calc\.exposureRatio\(exposure, total\)/);
assert.match(app, /function scheduleDriveAutoSave\(\)/);
assert.match(app, /if \(saved\) scheduleDriveAutoSave\(\)/);
assert.match(app, /DRIVE_AUTO_SAVE_DELAY = 1500/);
assert.match(html, /不含汽車與現金/);

const addStockBody = app.slice(app.indexOf('function addStock()'), app.indexOf('function removeStock('));
const removeStockBody = app.slice(app.indexOf('function removeStock('), app.indexOf('function clearMoves('));
assert.doesNotMatch(addStockBody, /state\.cash\s*[-+]=/, 'existing holding setup must not change cash');
assert.match(addStockBody, /type: '資產建檔'/);
assert.match(addStockBody, /state\.startingCapital \+= gross/);
assert.doesNotMatch(removeStockBody, /state\.cash\s*[-+]=/, 'removing an existing holding must not change cash');
assert.match(removeStockBody, /type: '資產移除'/);
assert.match(removeStockBody, /state\.startingCapital = Math\.max\(0, state\.startingCapital - removedValue\)/);
assert.match(html, /持股建檔不會動用帳戶現金/);

console.log('static: all checks passed');
