(function (global) {
  'use strict';

  const STORAGE_KEY = 'stock-portfolio-simulator-v1';
  const SUPPORTED_VERSIONS = new Set([1, 2, 3]);

  function validate(payload) {
    if (!payload || payload.app !== 'stock-portfolio-simulator' || !SUPPORTED_VERSIONS.has(payload.version)) {
      throw new Error('不是支援的模擬器備份格式');
    }
    const state = payload.state;
    const hasAccountData = (account) => account &&
      Array.isArray(account.holdings) &&
      Array.isArray(account.loans) &&
      Array.isArray(account.history) &&
      Array.isArray(account.transactions);
    const validState = payload.version === 3
      ? state && state.accounts && hasAccountData(state.accounts.SM) && hasAccountData(state.accounts.WL)
      : hasAccountData(state);
    if (!validState) {
      throw new Error('備份內容不完整');
    }
    return payload;
  }

  function save(payload) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  }

  function load() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? validate(JSON.parse(raw)) : null;
    } catch (error) {
      return null;
    }
  }

  function download(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function saveAs(payload, filename) {
    if (typeof global.showSaveFilePicker !== 'function') {
      download(payload, filename);
      return { method: 'download', filename };
    }

    const handle = await global.showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: '股票模擬器 JSON 備份',
        accept: { 'application/json': ['.json'] }
      }]
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return { method: 'picker', filename: handle.name || filename };
  }

  async function readFile(file) {
    const text = await file.text();
    return validate(JSON.parse(text));
  }

  global.StockSimulatorStorage = {
    download,
    load,
    readFile,
    saveAs,
    save,
    validate
  };
})(window);
