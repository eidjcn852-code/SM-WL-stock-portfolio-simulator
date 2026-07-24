# 股票資產模擬器

不需安裝套件的瀏覽器家庭投資組合模擬器，可分別管理 SM 與 WL 帳戶，並彙總檢視股票、現金、房地產、汽車、借貸、總曝險與股票質押維持率。

## 主要功能

- 家庭總覽顯示 SM + WL 的合計淨資產、總曝險、今日變動與累積損益。
- SM、WL 各自保存資產、持股、成本、損益、貸款、維持率與交易紀錄。
- 新增或移除既有持股屬於資產建檔，不會改變現金，也不會被計入投資損益。
- 只有模擬買進、賣出才會產生現金流、手續費與交易稅。
- 自行新增或刪除股票，設定每天個股與大盤漲跌；同股票價格與交易日由兩個帳戶共用。
- 每檔股票可設定曝險倍數；`00631L` 預設為 2 倍，一般股票預設為 1 倍。資產採實際市值，只有曝險統計套用倍數。
- 總曝險只計入股票加權曝險與房地產，不計入現金及汽車；曝險率以家庭淨資產為分母。
- 模擬買進、賣出、手續費與交易稅。
- 管理現金、房地產、汽車與完整資產配置。
- 建立信貸、房貸或股票質押，計算利息、負債與維持率。
- 下一交易日、自動播放、績效圖與交易紀錄。
- 瀏覽器自動儲存、Google Drive 雲端備份、本機 JSON 備份。

## 雙帳戶資料

- 畫面最上方是 SM 與 WL 的家庭合計，不能直接修改。
- 使用 `SM`、`WL` 分頁切換目前管理的帳戶；下方所有新增、交易、資產與借貸操作只影響目前帳戶。
- 「下一交易日」與「自動播放」會同時推進兩個帳戶，確保共用行情與日期一致。
- 版本 1、2 的舊備份會自動移入 SM 帳戶，WL 會建立為空白帳戶。
- 版本 3 的本機與 Google Drive JSON 會在同一份檔案內保存兩個帳戶。

## Google Drive 直接備份

Google Drive 功能使用 Google Identity Services 與 Drive API。程式只要求 `drive.file` 權限，僅能管理由本程式建立或使用的檔案。

### 第一次設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)，建立或選擇一個專案。
2. 在「API 和服務」啟用 **Google Drive API**。
3. 設定 OAuth 同意畫面；若應用程式仍在測試模式，將自己的 Google 帳號加入測試使用者。
4. 建立 **OAuth 2.0 用戶端 ID**，應用程式類型選擇 **網頁應用程式**。
5. 在「已授權的 JavaScript 來源」加入：

   ```text
   https://eidjcn852-code.github.io
   ```

6. 複製產生的 Client ID，貼到網站的「Google Drive 設定」，按「儲存並連接」。

### 日常使用

- **儲存雲端**：在「我的雲端硬碟」建立或更新 `stock-portfolio-simulator-cloud.json`。
- **載入雲端**：從同一份檔案恢復模擬器資料。
- Google 存取權杖只保留在目前頁面記憶體，不寫入 `localStorage` 或備份檔。
- OAuth Client ID 是公開識別碼，會儲存在目前瀏覽器；它不是密碼或 Client Secret。

## 本機使用

直接開啟 `index.html` 可使用模擬器，但 Google OAuth 一般需要 HTTPS 網站來源，因此 Google Drive 功能請使用 GitHub Pages 公開網址。

```text
https://eidjcn852-code.github.io/SM-WL-stock-portfolio-simulator/
```

本機 JSON 備份位於「Google Drive 設定」內，可在 Google Drive 暫時無法登入時備用。

## 專案結構

```text
stock-portfolio-simulator/
├─ index.html
├─ styles.css
├─ js/
│  ├─ calculations.js
│  ├─ storage.js
│  ├─ google-drive.js
│  └─ app.js
└─ tests/
   ├─ calculations.test.js
   ├─ storage.test.js
   ├─ google-drive.test.js
   └─ static.test.js
```

## 測試

安裝 Node.js 後，在專案資料夾執行：

```powershell
node tests/calculations.test.js
node tests/storage.test.js
node tests/google-drive.test.js
node tests/static.test.js
```

## GitHub Pages

將所有檔案上傳到 Repository 的 `main` 分支，接著在 **Settings → Pages** 選擇 **Deploy from a branch**、`main`、`/(root)`。
