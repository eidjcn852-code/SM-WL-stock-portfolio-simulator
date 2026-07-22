const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const memory = new Map();
const requests = [];
const responses = [];
let revokedToken = '';
let tokenRequestCount = 0;

const tokenClient = {
  callback() {},
  error_callback() {},
  requestAccessToken(options) {
    tokenRequestCount += 1;
    assert.equal(options.prompt, 'consent');
    this.callback({ access_token: 'test-access-token', expires_in: 3600 });
  }
};

const window = {
  localStorage: {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, value); },
    removeItem(key) { memory.delete(key); }
  },
  google: {
    accounts: {
      oauth2: {
        initTokenClient(options) {
          assert.match(options.client_id, /\.apps\.googleusercontent\.com$/);
          assert.equal(options.scope, 'https://www.googleapis.com/auth/drive.file');
          return tokenClient;
        },
        revoke(token, callback) {
          revokedToken = token;
          callback();
        }
      }
    }
  },
  async fetch(url, options = {}) {
    requests.push({ url, options });
    const result = responses.shift();
    if (!result) throw new Error('Unexpected fetch: ' + url);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      async json() { return result.body; }
    };
  },
  setInterval,
  clearInterval
};

vm.runInNewContext(fs.readFileSync('js/google-drive.js', 'utf8'), {
  window,
  URLSearchParams,
  encodeURIComponent,
  Date,
  Math,
  Promise,
  console
});

const drive = window.StockSimulatorGoogleDrive;
const payload = {
  app: 'stock-portfolio-simulator',
  version: 2,
  state: { holdings: [], loans: [], history: [], transactions: [] }
};

async function main() {
  assert.equal(drive.isConfigured(), false);
  assert.equal(drive.isValidClientId('not-a-client-id'), false);
  assert.throws(() => drive.setClientId('not-a-client-id'), /格式/);

  drive.setClientId('123456789-test.apps.googleusercontent.com');
  assert.equal(drive.isConfigured(), true);
  await drive.connect();
  assert.equal(drive.isConnected(), true);
  assert.equal(tokenRequestCount, 1);

  responses.push(
    { status: 200, body: { files: [] } },
    { status: 200, body: { id: 'created-file', name: drive.FILE_NAME, modifiedTime: '2026-07-22T01:00:00Z' } }
  );
  const created = await drive.save(payload);
  assert.equal(created.created, true);
  assert.match(requests[1].url, /uploadType=multipart/);
  assert.equal(requests[1].options.method, 'POST');
  assert.match(requests[1].options.body, /stock-portfolio-simulator-cloud\.json/);
  assert.match(requests[1].options.body, /"version": 2/);

  responses.push(
    { status: 200, body: { files: [{ id: 'created-file', name: drive.FILE_NAME }] } },
    { status: 200, body: { id: 'created-file', name: drive.FILE_NAME, modifiedTime: '2026-07-22T02:00:00Z' } }
  );
  const updated = await drive.save(payload);
  assert.equal(updated.created, false);
  assert.equal(requests[3].options.method, 'PATCH');
  assert.match(requests[3].url, /files\/created-file/);

  responses.push(
    { status: 200, body: { files: [{ id: 'created-file', name: drive.FILE_NAME }] } },
    { status: 200, body: payload }
  );
  const loaded = await drive.load();
  assert.equal(loaded.file.id, 'created-file');
  assert.equal(loaded.payload.app, 'stock-portfolio-simulator');
  assert.match(requests[5].url, /alt=media/);

  await drive.disconnect();
  assert.equal(revokedToken, 'test-access-token');
  assert.equal(drive.isConnected(), false);
  drive.clearClientId();
  assert.equal(drive.isConfigured(), false);

  console.log('google-drive: all tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
