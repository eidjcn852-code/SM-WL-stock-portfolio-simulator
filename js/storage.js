(function (global) {
  'use strict';

  const STORAGE_KEY = 'stock-portfolio-simulator-v1';

  function validate(payload) {
    if (!payload || payload.app !== 'stock-portfolio-simulator' || payload.version !== 1) {
      throw new Error('不是支援的模擬器備份格式');
    }
    const state = payload.state;
    if (!state || !Array.isArray(state.holdings) || !Array.isArray(state.loans) ||
        !Array.isArray(state.history) || !Array.isArray(state.transactions)) {
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

  async function readFile(file) {
    const text = await file.text();
    return validate(JSON.parse(text));
  }

  global.StockSimulatorStorage = {
    download,
    load,
    readFile,
    save,
    validate
  };
})(window);
