# 股票資產模擬器

一個不需要安裝套件的純前端投資組合模擬器，可直接在瀏覽器使用，也適合部署到 GitHub Pages。除了股票與借貸，也可記錄現金、房地產、汽車與整體資產曝險。

## 使用方式

1. 直接開啟 `index.html`。
2. 建立股票並設定每檔股票的每日漲跌百分比。
3. 使用「下一交易日」或「自動播放」執行情境。
4. 資料會自動保存在目前瀏覽器。
5. 定期使用「另存備份」保存 JSON；換電腦時可用「匯入備份」恢復。

## 完整資產與總曝險

- 總資產＝現金＋股票市值＋房地產＋汽車。
- 總曝險＝股票市值＋房地產＋汽車。
- 淨資產＝總資產－全部未償負債與應計利息。
- 曝險率＝總曝險÷總資產。現金計入總資產，但不列入市場曝險。

在「完整資產」輸入現金、房地產與汽車金額後，按「更新資產」。第 0 天更新時會同步建立新的績效基準。

## Google Drive 備份

1. 在 Windows 安裝並登入 Google Drive 電腦版，讓 Google Drive 顯示在檔案總管。
2. 按「另存備份」。
3. 在另存視窗選擇 Google Drive 內的備份資料夾，再按「儲存」。
4. 需要恢復時按「匯入備份」，從同一個 Google Drive 資料夾選擇 JSON 檔。

支援檔案選擇視窗的 Chrome／Edge 會讓你直接指定 Google Drive 資料夾；較舊的瀏覽器則會改存到預設下載資料夾。

## 專案結構

```text
stock-portfolio-simulator/
├─ index.html
├─ styles.css
├─ js/
│  ├─ calculations.js
│  ├─ storage.js
│  └─ app.js
└─ tests/
   ├─ calculations.test.js
   └─ storage.test.js
```

- `index.html`：畫面結構。
- `styles.css`：版面、主題與響應式樣式。
- `js/calculations.js`：手續費、利息、淨資產、總曝險與維持率等純計算。
- `js/storage.js`：瀏覽器自動保存與 JSON 備份。
- `js/app.js`：畫面互動、交易流程與圖表更新。

## GitHub Pages

1. 建立新的 GitHub Repository。
2. 將此資料夾內容推送到 `main` 分支。
3. 進入 Repository 的 **Settings → Pages**。
4. 選擇 **Deploy from a branch**、`main`、`/(root)`。
5. 儲存後等待 GitHub 產生公開網址。

所有連結都使用相對路徑，因此可部署在 GitHub Pages 的專案子目錄。

## 資料與隱私

- 自動保存使用瀏覽器 `localStorage`，資料不會主動上傳。
- GitHub Pages 是公開網站，不要把個人資產資料、帳號密碼或 API Key 寫進原始碼。
- JSON 備份可能包含你的模擬資產資料。若存放於 Google Drive，請確認雲端帳號與分享權限安全。

## 維護建議

- 功能修改使用獨立分支，例如 `feature/dividend`。
- 每次只提交一個主題，提交訊息例如 `Add dividend simulation`。
- 修改財務公式時，同步更新 `tests/calculations.test.js`。
- 修改備份格式時，同步更新 `tests/storage.test.js`，並遞增資料版本。
- 正式發布前建立版本標籤，例如 `v1.0.0`。
