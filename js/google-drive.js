(function (global) {
  'use strict';

  const CLIENT_ID_KEY = 'stock-portfolio-simulator-google-client-id';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'stock-portfolio-simulator-cloud.json';
  const API_ROOT = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_ROOT = 'https://www.googleapis.com/upload/drive/v3';
  const APP_PROPERTIES = {
    app: 'stock-portfolio-simulator',
    backup: 'primary'
  };

  let tokenClient = null;
  let tokenClientId = '';
  let accessToken = '';
  let accessTokenExpiresAt = 0;

  function driveError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isValidClientId(value) {
    return /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(String(value || '').trim());
  }

  function getClientId() {
    try {
      return global.localStorage.getItem(CLIENT_ID_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function setClientId(value) {
    const clientId = String(value || '').trim();
    if (!isValidClientId(clientId)) {
      throw driveError('INVALID_CLIENT_ID', 'Client ID 格式不正確');
    }
    try {
      global.localStorage.setItem(CLIENT_ID_KEY, clientId);
    } catch (error) {
      throw driveError('STORAGE_UNAVAILABLE', '瀏覽器無法儲存 Google Drive 設定');
    }
    resetSession();
    return clientId;
  }

  function clearClientId() {
    try {
      global.localStorage.removeItem(CLIENT_ID_KEY);
    } catch (error) {
      // The in-memory session is still cleared when browser storage is unavailable.
    }
    resetSession();
  }

  function resetSession() {
    tokenClient = null;
    tokenClientId = '';
    accessToken = '';
    accessTokenExpiresAt = 0;
  }

  function isConfigured() {
    return isValidClientId(getClientId());
  }

  function isConnected() {
    return Boolean(accessToken) && Date.now() < accessTokenExpiresAt;
  }

  function waitForIdentityLibrary(timeoutMs = 10000) {
    if (global.google && global.google.accounts && global.google.accounts.oauth2) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = global.setInterval(() => {
        if (global.google && global.google.accounts && global.google.accounts.oauth2) {
          global.clearInterval(timer);
          resolve();
        } else if (Date.now() - startedAt >= timeoutMs) {
          global.clearInterval(timer);
          reject(driveError('LIBRARY_UNAVAILABLE', 'Google 登入服務載入失敗，請檢查網路後重試'));
        }
      }, 50);
    });
  }

  async function getTokenClient() {
    const clientId = getClientId();
    if (!isValidClientId(clientId)) {
      throw driveError('CLIENT_ID_REQUIRED', '請先設定 Google OAuth Client ID');
    }
    await waitForIdentityLibrary();
    if (!tokenClient || tokenClientId !== clientId) {
      tokenClient = global.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: function () {}
      });
      tokenClientId = clientId;
    }
    return tokenClient;
  }

  async function connect() {
    if (isConnected()) {
      return { connected: true, expiresAt: accessTokenExpiresAt };
    }
    const client = await getTokenClient();
    return new Promise((resolve, reject) => {
      client.callback = (response) => {
        if (!response || response.error || !response.access_token) {
          reject(driveError('AUTH_FAILED', response && response.error_description
            ? response.error_description
            : 'Google Drive 授權未完成'));
          return;
        }
        accessToken = response.access_token;
        const lifetimeSeconds = Math.max(60, Number(response.expires_in) || 3600);
        accessTokenExpiresAt = Date.now() + Math.max(30, lifetimeSeconds - 60) * 1000;
        resolve({ connected: true, expiresAt: accessTokenExpiresAt });
      };
      client.error_callback = (error) => {
        const message = error && error.type === 'popup_closed'
          ? 'Google 登入視窗已關閉'
          : '無法開啟 Google 登入視窗';
        reject(driveError('POPUP_ERROR', message));
      };
      client.requestAccessToken({ prompt: 'consent' });
    });
  }

  async function apiFetch(url, options = {}) {
    if (!isConnected()) {
      resetSession();
      throw driveError('AUTH_REQUIRED', 'Google Drive 登入已到期，請重新連接');
    }
    const response = await global.fetch(url, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        ...(options.headers || {})
      }
    });
    if (response.status === 401) {
      resetSession();
      throw driveError('AUTH_REQUIRED', 'Google Drive 登入已到期，請重新連接');
    }
    if (!response.ok) {
      let message = 'Google Drive 操作失敗（' + response.status + '）';
      try {
        const detail = await response.json();
        if (detail && detail.error && detail.error.message) message = detail.error.message;
      } catch (error) {
        // Keep the status-based fallback when Google does not return JSON.
      }
      throw driveError('DRIVE_API_ERROR', message);
    }
    return response;
  }

  function backupQuery() {
    return "trashed = false and appProperties has { key='app' and value='stock-portfolio-simulator' } " +
      "and appProperties has { key='backup' and value='primary' }";
  }

  async function findBackupFile() {
    const params = new URLSearchParams({
      q: backupQuery(),
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '1',
      spaces: 'drive'
    });
    const response = await apiFetch(API_ROOT + '/files?' + params.toString());
    const result = await response.json();
    return result.files && result.files.length ? result.files[0] : null;
  }

  function createMultipartBody(metadata, payload) {
    const boundary = 'stock-simulator-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const body = [
      '--' + boundary,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      '--' + boundary,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(payload, null, 2),
      '--' + boundary + '--',
      ''
    ].join('\r\n');
    return { body, contentType: 'multipart/related; boundary=' + boundary };
  }

  async function save(payload) {
    const existing = await findBackupFile();
    const metadata = {
      name: FILE_NAME,
      mimeType: 'application/json',
      description: '股票資產模擬器雲端備份',
      appProperties: APP_PROPERTIES
    };
    const multipart = createMultipartBody(metadata, payload);
    const url = existing
      ? UPLOAD_ROOT + '/files/' + encodeURIComponent(existing.id) + '?uploadType=multipart&fields=id,name,modifiedTime'
      : UPLOAD_ROOT + '/files?uploadType=multipart&fields=id,name,modifiedTime';
    const response = await apiFetch(url, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body
    });
    const file = await response.json();
    return { ...file, created: !existing };
  }

  async function load() {
    const file = await findBackupFile();
    if (!file) {
      throw driveError('BACKUP_NOT_FOUND', 'Google Drive 中尚未建立模擬器備份');
    }
    const response = await apiFetch(API_ROOT + '/files/' + encodeURIComponent(file.id) + '?alt=media');
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw driveError('INVALID_BACKUP', 'Google Drive 備份不是有效的 JSON 檔案');
    }
    return { payload, file };
  }

  function disconnect() {
    const token = accessToken;
    resetSession();
    if (!token || !global.google || !global.google.accounts || !global.google.accounts.oauth2) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      global.google.accounts.oauth2.revoke(token, resolve);
    });
  }

  global.StockSimulatorGoogleDrive = {
    FILE_NAME,
    SCOPE,
    clearClientId,
    connect,
    disconnect,
    getClientId,
    isConfigured,
    isConnected,
    isValidClientId,
    load,
    save,
    setClientId
  };
})(window);
