# 股票資產模擬器

一個不需要安裝套件的純前端投資組合模擬器，可直接在瀏覽器使用，也適合部署到 GitHub Pages。

## 使用方式

1. 直接開啟 `index.html`。
2. 建立股票並設定每檔股票的每日漲跌百分比。
3. 使用「下一交易日」或「自動播放」執行情境。
4. 資料會自動保存在目前瀏覽器。
5. 定期使用「匯出」下載 JSON 備份；換電腦時可用「匯入」恢復。

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
- `js/calculations.js`：手續費、利息、淨資產與維持率等純計算。
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
- JSON 備份可能包含你的模擬資產資料，請自行保管。

## 維護建議

- 功能修改使用獨立分支，例如 `feature/dividend`。
- 每次只提交一個主題，提交訊息例如 `Add dividend simulation`。
- 修改財務公式時，同步更新 `tests/calculations.test.js`。
- 修改備份格式時，同步更新 `tests/storage.test.js`，並遞增資料版本。
- 正式發布前建立版本標籤，例如 `v1.0.0`。
