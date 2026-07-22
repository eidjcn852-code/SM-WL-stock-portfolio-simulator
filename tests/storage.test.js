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
const legacyPayload = {
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

async function main() {
  assert.equal(storage.save(legacyPayload), true);
  assert.deepEqual(JSON.parse(JSON.stringify(storage.load())), legacyPayload);
  assert.equal(storage.validate({ ...legacyPayload, version: 2 }).version, 2);
  assert.throws(() => storage.validate({ ...legacyPayload, version: 3 }), /支援/);

  let written = '';
  window.showSaveFilePicker = async (options) => ({
    name: options.suggestedName,
    async createWritable() {
      return {
        async write(content) { written = content; },
        async close() {}
      };
    }
  });
  const result = await storage.saveAs({ ...legacyPayload, version: 2 }, 'drive-backup.json');
  assert.equal(result.method, 'picker');
  assert.equal(result.filename, 'drive-backup.json');
  assert.equal(JSON.parse(written).version, 2);

  console.log('storage: all tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
