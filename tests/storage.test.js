const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const memory = new Map();
const window = {
  localStorage: {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, value);
    }
  }
};

vm.runInNewContext(fs.readFileSync('js/storage.js', 'utf8'), {
  window,
  Blob,
  URL,
  document: {},
  console
});

const storage = window.StockSimulatorStorage;
const payload = {
  app: 'stock-portfolio-simulator',
  version: 1,
  savedAt: '2026-07-21T00:00:00.000Z',
  state: {
    holdings: [],
    loans: [],
    history: [],
    transactions: []
  },
  settings: {}
};

assert.equal(storage.save(payload), true);
assert.deepEqual(JSON.parse(JSON.stringify(storage.load())), payload);
assert.throws(() => storage.validate({ version: 1 }), /支援/);

console.log('storage: all tests passed');
