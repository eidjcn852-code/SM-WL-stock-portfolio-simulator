(() => {
      const root = document.getElementById('complete-brokerage-simulator');
      if (!root) return;
      const el = (id) => root.querySelector('#' + id);
      const Calc = window.StockSimulatorCalculations;
      const Storage = window.StockSimulatorStorage;
      const Drive = window.StockSimulatorGoogleDrive;
      if (!Calc || !Storage) return;

      const ACCOUNT_IDS = ['SM', 'WL'];
      const ACCOUNT_LABELS = { SM: 'SM 帳戶', WL: 'WL 帳戶' };
      const DRIVE_AUTO_SAVE_DELAY = 1500;
      let driveAutoSaveTimer = null;
      let driveSavePromise = null;
      let driveSavePending = false;
      let suspendDriveAutoSave = false;

      function createAccount(startingCapital = 0) {
        const capital = Math.max(0, Number(startingCapital) || 0);
        return {
          startingCapital: capital,
          cash: capital,
          realEstate: 0,
          vehicles: 0,
          holdings: [],
          loans: [],
          history: [],
          transactions: [],
          realizedPnl: 0,
          lastDailyPnl: 0,
          lastDailyReturn: 0,
          nextId: 1,
          nextLoanId: 1,
          baseline: null,
          settings: {
            startingCapitalInput: String(capital),
            commissionRate: '0.1425',
            taxRate: '0.3'
          }
        };
      }

      const appState = {
        activeAccountId: 'SM',
        day: 0,
        benchmark: 100,
        lastBenchmarkReturn: 0,
        market: {},
        timer: null,
        accounts: {
          SM: createAccount(1000000),
          WL: createAccount(0)
        }
      };
      let state = appState.accounts.SM;

      const money0 = new Intl.NumberFormat('zh-TW', {
        style: 'currency', currency: 'TWD', maximumFractionDigits: 0
      });
      const money2 = new Intl.NumberFormat('zh-TW', {
        style: 'currency', currency: 'TWD', minimumFractionDigits: 2, maximumFractionDigits: 2
      });
      const number0 = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });

      function signedPercent(value) {
        return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
      }

      function signedMoney(value) {
        return (value > 0 ? '+' : '') + money0.format(value);
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;');
      }

      function holdingsValueFor(account) {
        return Calc.holdingsValue(account.holdings);
      }

      function holdingsValue() {
        return holdingsValueFor(state);
      }

      function outstandingLoan(loan) {
        return Calc.outstandingLoan(loan);
      }

      function totalDebtFor(account) {
        return Calc.totalDebt(account.loans);
      }

      function totalDebt() {
        return totalDebtFor(state);
      }

      function physicalAssetsFor(account) {
        return {
          realEstate: account.realEstate,
          vehicles: account.vehicles
        };
      }

      function physicalAssets() {
        return physicalAssetsFor(state);
      }

      function grossAssetsFor(account) {
        return Calc.grossAssets(account.cash, account.holdings, physicalAssetsFor(account));
      }

      function grossAssets() {
        return grossAssetsFor(state);
      }

      function totalAssetsFor(account) {
        return Calc.netAssets(account.cash, account.holdings, account.loans, physicalAssetsFor(account));
      }

      function totalAssets() {
        return totalAssetsFor(state);
      }

      function totalExposureFor(account) {
        return Calc.totalExposure(account.holdings, physicalAssetsFor(account));
      }

      function totalExposure() {
        return totalExposureFor(state);
      }

      function householdSum(calculator) {
        return ACCOUNT_IDS.reduce((sum, accountId) => sum + calculator(appState.accounts[accountId]), 0);
      }

      function householdGrossAssets() {
        return householdSum(grossAssetsFor);
      }

      function householdTotalAssets() {
        return householdSum(totalAssetsFor);
      }

      function householdDebt() {
        return householdSum(totalDebtFor);
      }

      function householdExposure() {
        return householdSum(totalExposureFor);
      }

      function householdStartingCapital() {
        return householdSum((account) => account.startingCapital);
      }

      function isLoanActive(loan) {
        return outstandingLoan(loan) > 0.005;
      }

      function pledgedSharesFor(holdingId) {
        return state.loans.reduce((sum, loan) => {
          return sum + (loan.type === 'pledge' && loan.collateralHoldingId === holdingId && isLoanActive(loan) ? loan.pledgedShares : 0);
        }, 0);
      }

      function dailyInterestEstimate() {
        return Calc.dailyInterestTotal(state.loans);
      }

      function maintenanceRatioFor(account, loan) {
        if (loan.type !== 'pledge' || !isLoanActive(loan)) return null;
        const holding = account.holdings.find((item) => item.id === loan.collateralHoldingId);
        return Calc.maintenanceRatio(loan, holding);
      }

      function maintenanceRatio(loan) {
        return maintenanceRatioFor(state, loan);
      }

      function minimumPledgeRatio() {
        const ratios = state.loans
          .filter((loan) => loan.type === 'pledge' && isLoanActive(loan))
          .map(maintenanceRatio);
        return ratios.length ? Math.min(...ratios) : null;
      }

      function loanTypeLabel(type) {
        return type === 'mortgage' ? '房屋貸款' : type === 'pledge' ? '股票質押' : '信用貸款';
      }

      function estimatedMonthlyPayment(loan) {
        return Calc.estimatedMonthlyPayment(loan);
      }

      function commissionRate() {
        return Math.max(0, Number(el('cps-commission-rate').value) || 0) / 100;
      }

      function taxRate() {
        return Math.max(0, Number(el('cps-tax-rate').value) || 0) / 100;
      }

      function tradeFee(gross) {
        return Calc.tradeFee(gross, commissionRate());
      }

      function householdHistory() {
        const days = new Set();
        ACCOUNT_IDS.forEach((accountId) => {
          appState.accounts[accountId].history.forEach((point) => days.add(point.day));
        });
        return [...days].sort((a, b) => a - b).map((day) => {
          const total = ACCOUNT_IDS.reduce((sum, accountId) => {
            const history = appState.accounts[accountId].history;
            const point = [...history].reverse().find((item) => item.day <= day);
            return sum + (point ? point.total : 0);
          }, 0);
          return { day, total };
        });
      }

      function maximumDrawdown() {
        return Calc.maximumDrawdown(householdHistory());
      }

      function concentration() {
        return Calc.concentration(state.holdings, grossAssets());
      }

      function recordHistoryFor(account, replaceCurrent) {
        const total = totalAssetsFor(account);
        const point = {
          day: appState.day,
          total,
          portfolioReturn: account.startingCapital > 0 ? (total / account.startingCapital - 1) * 100 : 0,
          benchmarkReturn: appState.benchmark - 100
        };
        const last = account.history[account.history.length - 1];
        if (replaceCurrent && last && last.day === appState.day) account.history[account.history.length - 1] = point;
        else account.history.push(point);
      }

      function recordHistory(replaceCurrent) {
        recordHistoryFor(state, replaceCurrent);
      }

      function updateBaseline(account = state, force = false) {
        if (appState.day !== 0 && !force) return;
        account.baseline = {
          startingCapital: account.startingCapital,
          cash: account.cash,
          realEstate: account.realEstate,
          vehicles: account.vehicles,
          holdings: account.holdings.map((holding) => ({ ...holding })),
          loans: account.loans.map((loan) => ({ ...loan })),
          transactions: account.transactions.map((transaction) => ({ ...transaction })),
          realizedPnl: account.realizedPnl,
          nextId: account.nextId,
          nextLoanId: account.nextLoanId
        };
      }

      function setAutoPlaying(playing) {
        const button = el('cps-auto');
        if (playing) {
          if (appState.timer) return;
          appState.timer = window.setInterval(applyDay, 700);
        } else if (appState.timer) {
          window.clearInterval(appState.timer);
          appState.timer = null;
        }
        button.setAttribute('aria-pressed', playing ? 'true' : 'false');
        button.innerHTML = playing
          ? '<i data-lucide="pause" aria-hidden="true"></i><span>暫停</span>'
          : '<i data-lucide="play" aria-hidden="true"></i><span>自動播放</span>';
        if (window.lucide) window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
      }

      function resetSimulation() {
        setAutoPlaying(false);
        captureAccountSettings();
        ACCOUNT_IDS.forEach((accountId) => {
          const account = appState.accounts[accountId];
          if (!account.baseline) updateBaseline(account, true);
          const warningRatios = new Map(account.loans.map((loan) => [loan.id, loan.warningRatio]));
          const baseline = account.baseline;
          Object.assign(account, {
            startingCapital: baseline.startingCapital,
            cash: baseline.cash,
            realEstate: baseline.realEstate || 0,
            vehicles: baseline.vehicles || 0,
            holdings: baseline.holdings.map((holding) => ({ ...holding })),
            loans: baseline.loans.map((loan) => ({
              ...loan,
              warningRatio: warningRatios.has(loan.id) ? warningRatios.get(loan.id) : loan.warningRatio
            })),
            transactions: baseline.transactions.map((transaction) => ({ ...transaction })),
            realizedPnl: baseline.realizedPnl,
            nextId: baseline.nextId,
            nextLoanId: baseline.nextLoanId,
            history: [],
            lastDailyPnl: 0,
            lastDailyReturn: 0
          });
        });
        appState.day = 0;
        appState.benchmark = 100;
        appState.lastBenchmarkReturn = 0;
        rebuildMarketFromAccounts(true);
        ACCOUNT_IDS.forEach((accountId) => recordHistoryFor(appState.accounts[accountId], false));
        el('cps-benchmark-move').value = '0';
        applyAccountSettings();
        setAddFeedback('SM 與 WL 已回到第 0 天，初始持倉均已保留', false);
        setTradeFeedback('模擬紀錄已重設', false);
        setLoanFeedback('兩個帳戶的貸款已回到模擬開始前狀態', false);
        setRepayFeedback('可選擇貸款進行部分或全額還款', false);
        render();
      }

      function resetAccount() {
        setAutoPlaying(false);
        const capital = Number(el('cps-starting-capital').value);
        if (!Number.isFinite(capital) || capital < 0) {
          setAddFeedback('初始資金不可小於 0', true);
          return;
        }
        captureAccountSettings();
        const accountId = appState.activeAccountId;
        const account = createAccount(capital);
        account.settings = {
          ...state.settings,
          startingCapitalInput: String(capital)
        };
        appState.accounts[accountId] = account;
        state = account;
        recordHistory(false);
        updateBaseline(state, true);
        rebuildMarketFromAccounts(false);
        el('cps-cash-value').value = String(capital);
        el('cps-real-estate-value').value = '0';
        el('cps-vehicle-value').value = '0';
        setAddFeedback(ACCOUNT_LABELS[accountId] + '已建立空白組合，目前可用現金 ' + money0.format(state.cash), false);
        setTradeFeedback('新增股票後即可模擬交易', false);
        setLoanFeedback('借款會同時增加現金與負債', false);
        setRepayFeedback('目前沒有待還款貸款', false);
        render();
      }

      function setAddFeedback(message, destructive) {
        const feedback = el('cps-add-feedback');
        feedback.textContent = message;
        feedback.classList.toggle('text-destructive', destructive);
      }

      function setTradeFeedback(message, destructive) {
        const feedback = el('cps-trade-feedback');
        feedback.textContent = message;
        feedback.classList.toggle('text-destructive', destructive);
      }

      function setLoanFeedback(message, destructive) {
        const feedback = el('cps-loan-feedback');
        feedback.textContent = message;
        feedback.classList.toggle('text-destructive', destructive);
      }

      function setRepayFeedback(message, destructive) {
        const feedback = el('cps-repay-feedback');
        feedback.textContent = message;
        feedback.classList.toggle('text-destructive', destructive);
      }

      function setAssetFeedback(message, destructive) {
        const feedback = el('cps-asset-feedback');
        feedback.textContent = message;
        feedback.classList.toggle('text-destructive', destructive);
      }

      function applyAssetValues() {
        const cash = Number(el('cps-cash-value').value);
        const realEstate = Number(el('cps-real-estate-value').value);
        const vehicles = Number(el('cps-vehicle-value').value);
        if (![cash, realEstate, vehicles].every((value) => Number.isFinite(value) && value >= 0)) {
          setAssetFeedback('資產金額必須是大於或等於 0 的數字', true);
          return;
        }

        const before = totalAssets();
        state.cash = cash;
        state.realEstate = realEstate;
        state.vehicles = vehicles;
        const after = totalAssets();
        if (appState.day === 0) {
          state.startingCapital = after;
          state.lastDailyPnl = 0;
          state.lastDailyReturn = 0;
          recordHistory(true);
          state.settings.startingCapitalInput = String(cash);
          el('cps-starting-capital').value = String(cash);
        } else {
          state.lastDailyPnl += after - before;
          const previousPoint = state.history[state.history.length - 2];
          const comparison = previousPoint ? previousPoint.total : state.startingCapital;
          state.lastDailyReturn = comparison > 0 ? (after / comparison - 1) * 100 : 0;
          recordHistory(true);
        }
        setAssetFeedback(ACCOUNT_LABELS[appState.activeAccountId] + '資產已更新，帳戶曝險 ' + money0.format(totalExposure()), false);
        render();
      }

      function rebuildMarketFromAccounts(resetPrices) {
        const previous = appState.market || {};
        const market = {};
        ACCOUNT_IDS.forEach((accountId) => {
          appState.accounts[accountId].holdings.forEach((holding) => {
            if (!market[holding.symbol]) {
              market[holding.symbol] = {
                price: resetPrices || !previous[holding.symbol]
                  ? Math.max(0.01, Number(holding.price) || 0.01)
                  : Math.max(0.01, Number(previous[holding.symbol].price) || Number(holding.price) || 0.01),
                move: previous[holding.symbol]
                  ? Math.max(-100, Math.min(100, Number(previous[holding.symbol].move) || 0))
                  : Math.max(-100, Math.min(100, Number(holding.move) || 0)),
                name: holding.name || holding.symbol
              };
            }
            holding.price = market[holding.symbol].price;
            holding.move = market[holding.symbol].move;
          });
        });
        appState.market = market;
      }

      function syncAccountPrices(account) {
        account.holdings.forEach((holding) => {
          const quote = appState.market[holding.symbol];
          if (!quote) return;
          holding.price = quote.price;
          holding.move = quote.move;
        });
      }

      function setMarketMove(symbol, move) {
        const quote = appState.market[symbol];
        if (!quote) return;
        quote.move = Math.max(-100, Math.min(100, Number(move) || 0));
        ACCOUNT_IDS.forEach((accountId) => {
          appState.accounts[accountId].holdings
            .filter((holding) => holding.symbol === symbol)
            .forEach((holding) => { holding.move = quote.move; });
        });
      }

      function defaultExposureMultiplier(symbol) {
        return String(symbol).toUpperCase() === '00631L' ? 2 : 1;
      }

      function normalizeExposureMultiplier(value, symbol) {
        const multiplier = Number(value);
        if (!Number.isFinite(multiplier) || multiplier <= 0) return defaultExposureMultiplier(symbol);
        return Math.min(10, multiplier);
      }

      function existingExposureMultiplier(symbol) {
        for (const accountId of ACCOUNT_IDS) {
          const holding = appState.accounts[accountId].holdings.find((item) => item.symbol === symbol);
          if (holding) return normalizeExposureMultiplier(holding.exposureMultiplier, symbol);
        }
        return null;
      }

      function setExposureMultiplier(symbol, value) {
        const multiplier = normalizeExposureMultiplier(value, symbol);
        ACCOUNT_IDS.forEach((accountId) => {
          appState.accounts[accountId].holdings
            .filter((holding) => holding.symbol === symbol)
            .forEach((holding) => { holding.exposureMultiplier = multiplier; });
        });
        return multiplier;
      }

      function updateNewExposureDefault() {
        const symbol = el('cps-new-symbol').value.trim().toUpperCase();
        const sharedMultiplier = existingExposureMultiplier(symbol);
        el('cps-new-exposure-multiplier').value = String(
          sharedMultiplier === null ? defaultExposureMultiplier(symbol) : sharedMultiplier
        );
      }

      function addStock() {
        const symbol = el('cps-new-symbol').value.trim().toUpperCase();
        const name = el('cps-new-name').value.trim() || symbol;
        const requestedPrice = Number(el('cps-new-price').value);
        const shares = Math.floor(Number(el('cps-new-shares').value) || 0);
        const requestedExposureMultiplier = Number(el('cps-new-exposure-multiplier').value);
        if (!symbol) {
          setAddFeedback('請輸入股票代號', true);
          return;
        }
        if (!Number.isFinite(requestedPrice) || requestedPrice <= 0) {
          setAddFeedback('模擬起始價必須大於 0', true);
          return;
        }
        if (shares < 0) {
          setAddFeedback('初始股數不可小於 0', true);
          return;
        }
        if (!Number.isFinite(requestedExposureMultiplier) || requestedExposureMultiplier <= 0 || requestedExposureMultiplier > 10) {
          setAddFeedback('曝險倍數必須介於 0.1 到 10 倍', true);
          return;
        }
        if (state.holdings.some((holding) => holding.symbol === symbol)) {
          setAddFeedback(symbol + ' 已在投資組合中', true);
          return;
        }

        const existingQuote = appState.market[symbol];
        const price = existingQuote ? existingQuote.price : requestedPrice;
        const gross = shares * price;
        const sharedExposureMultiplier = existingExposureMultiplier(symbol);
        const exposureMultiplier = sharedExposureMultiplier === null
          ? normalizeExposureMultiplier(requestedExposureMultiplier, symbol)
          : sharedExposureMultiplier;

        const holding = {
          id: state.nextId++,
          symbol,
          name,
          shares,
          price,
          averageCost: shares > 0 ? price : 0,
          move: existingQuote ? existingQuote.move : 0,
          exposureMultiplier
        };
        state.holdings.push(holding);
        if (!existingQuote) {
          appState.market[symbol] = { price, move: 0, name };
        }
        if (shares > 0) {
          state.startingCapital += gross;
          state.transactions.unshift({
            day: appState.day,
            type: '資產建檔',
            symbol,
            quantity: shares,
            price,
            costs: 0,
            cashFlow: 0
          });
          recordHistory(true);
        }
        el('cps-new-symbol').value = '';
        el('cps-new-name').value = '';
        el('cps-new-shares').value = '0';
        el('cps-new-exposure-multiplier').value = '1';
        const sharedPriceNote = existingQuote ? '（沿用 SM/WL 共用行情 ' + money2.format(price) + '）' : '';
        setAddFeedback(
          '已建檔 ' + symbol + sharedPriceNote + '，曝險 ' + exposureMultiplier.toFixed(1) + ' 倍，現金維持 ' + money0.format(state.cash),
          false
        );
        render();
        el('cps-trade-symbol').value = String(holding.id);
        renderTradePrice();
      }

      function removeStock(id) {
        const holding = state.holdings.find((item) => item.id === id);
        if (!holding) return;
        if (pledgedSharesFor(id) > 0) {
          setAddFeedback(holding.symbol + ' 仍有質押，請先完成還款再移除', true);
          return;
        }
        const removedValue = holding.shares * holding.price;
        state.holdings = state.holdings.filter((item) => item.id !== id);
        if (holding.shares > 0) {
          state.startingCapital = Math.max(0, state.startingCapital - removedValue);
          state.transactions.unshift({
            day: appState.day,
            type: '資產移除',
            symbol: holding.symbol,
            quantity: holding.shares,
            price: holding.price,
            costs: 0,
            cashFlow: 0
          });
          recordHistory(true);
        }
        const stillUsed = ACCOUNT_IDS.some((accountId) => {
          return appState.accounts[accountId].holdings.some((item) => item.symbol === holding.symbol);
        });
        if (!stillUsed) delete appState.market[holding.symbol];
        setAddFeedback('已移除 ' + holding.symbol + '，現金維持 ' + money0.format(state.cash), false);
        render();
      }

      function clearMoves() {
        Object.keys(appState.market).forEach((symbol) => setMarketMove(symbol, 0));
        el('cps-benchmark-move').value = '0';
        renderHoldings();
        renderScenarioPreview();
      }

      function applyDay() {
        const benchmarkMove = Math.max(-100, Math.min(100, Number(el('cps-benchmark-move').value) || 0));
        captureAccountSettings();
        const before = {};
        ACCOUNT_IDS.forEach((accountId) => {
          before[accountId] = totalAssetsFor(appState.accounts[accountId]);
        });
        Object.values(appState.market).forEach((quote) => {
          const move = Math.max(-100, Math.min(100, Number(quote.move) || 0));
          quote.price = Math.max(0.01, quote.price * (1 + move / 100));
        });
        appState.benchmark = Math.max(0.01, appState.benchmark * (1 + benchmarkMove / 100));
        appState.day += 1;
        appState.lastBenchmarkReturn = benchmarkMove;
        ACCOUNT_IDS.forEach((accountId) => {
          const account = appState.accounts[accountId];
          syncAccountPrices(account);
          account.loans.forEach((loan) => {
            if (loan.balance > 0) loan.accruedInterest += Calc.dailyInterest(loan);
          });
          const after = totalAssetsFor(account);
          account.lastDailyPnl = after - before[accountId];
          account.lastDailyReturn = before[accountId] > 0 ? (after / before[accountId] - 1) * 100 : 0;
          recordHistoryFor(account, false);
        });
        render();
      }

      function selectedHolding() {
        const id = Number(el('cps-trade-symbol').value);
        return state.holdings.find((holding) => holding.id === id) || null;
      }

      function tradeQuantity() {
        const quantity = Math.floor(Number(el('cps-trade-quantity').value));
        return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
      }

      function buy() {
        const holding = selectedHolding();
        const quantity = tradeQuantity();
        if (!holding) {
          setTradeFeedback('請先新增並選擇股票', true);
          return;
        }
        if (!quantity) {
          setTradeFeedback('請輸入大於 0 的股數', true);
          return;
        }
        const gross = quantity * holding.price;
        const fee = tradeFee(gross);
        const cost = gross + fee;
        if (cost > state.cash) {
          setTradeFeedback('現金不足，本次需要 ' + money0.format(cost), true);
          return;
        }
        const previousBookCost = holding.averageCost * holding.shares;
        state.cash -= cost;
        holding.shares += quantity;
        holding.averageCost = (previousBookCost + cost) / holding.shares;
        state.transactions.unshift({
          day: appState.day,
          type: '買進',
          symbol: holding.symbol,
          quantity,
          price: holding.price,
          costs: fee,
          cashFlow: -cost
        });
        recordHistory(true);
        setTradeFeedback('已買進 ' + holding.symbol + ' ' + number0.format(quantity) + ' 股', false);
        render();
      }

      function sell() {
        const holding = selectedHolding();
        const quantity = tradeQuantity();
        if (!holding) {
          setTradeFeedback('請先新增並選擇股票', true);
          return;
        }
        if (!quantity) {
          setTradeFeedback('請輸入大於 0 的股數', true);
          return;
        }
        const pledged = pledgedSharesFor(holding.id);
        const available = Math.max(0, holding.shares - pledged);
        if (quantity > available) {
          setTradeFeedback('可賣股數不足，目前可賣 ' + number0.format(available) + ' 股，另有 ' + number0.format(pledged) + ' 股質押中', true);
          return;
        }
        const gross = quantity * holding.price;
        const fee = tradeFee(gross);
        const tax = Math.round(gross * taxRate());
        const proceeds = gross - fee - tax;
        const realized = (holding.price - holding.averageCost) * quantity - fee - tax;
        state.cash += proceeds;
        holding.shares -= quantity;
        state.realizedPnl += realized;
        if (holding.shares === 0) holding.averageCost = 0;
        state.transactions.unshift({
          day: appState.day,
          type: '賣出',
          symbol: holding.symbol,
          quantity,
          price: holding.price,
          costs: fee + tax,
          cashFlow: proceeds
        });
        recordHistory(true);
        setTradeFeedback('已賣出 ' + holding.symbol + '，實現損益 ' + signedMoney(realized), false);
        render();
      }


      function createLoan() {
        const type = el('cps-loan-type').value;
        const amount = Number(el('cps-loan-amount').value);
        const annualRate = Number(el('cps-loan-rate').value);
        const termMonths = Math.floor(Number(el('cps-loan-term').value));
        if (!Number.isFinite(amount) || amount <= 0) {
          setLoanFeedback('借款金額必須大於 0', true);
          return;
        }
        if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100) {
          setLoanFeedback('年利率需介於 0% 到 100%', true);
          return;
        }
        if (!Number.isFinite(termMonths) || termMonths <= 0) {
          setLoanFeedback('貸款期數必須大於 0', true);
          return;
        }

        let collateralHoldingId = null;
        let pledgedShares = 0;
        let warningRatio = 130;
        if (type === 'pledge') {
          collateralHoldingId = Number(el('cps-collateral-stock').value);
          const holding = state.holdings.find((item) => item.id === collateralHoldingId);
          pledgedShares = Math.floor(Number(el('cps-pledged-shares').value));
          warningRatio = Number(el('cps-warning-ratio').value);
          if (!holding) {
            setLoanFeedback('請先選擇質押股票', true);
            return;
          }
          if (!Number.isFinite(pledgedShares) || pledgedShares <= 0) {
            setLoanFeedback('質押股數必須大於 0', true);
            return;
          }
          const available = Math.max(0, holding.shares - pledgedSharesFor(holding.id));
          if (pledgedShares > available) {
            setLoanFeedback('可質押股數不足，目前可用 ' + number0.format(available) + ' 股', true);
            return;
          }
          if (!Number.isFinite(warningRatio) || warningRatio <= 0) {
            setLoanFeedback('維持率警示線必須大於 0%', true);
            return;
          }
        }

        const id = state.nextLoanId++;
        const name = el('cps-loan-name').value.trim() || loanTypeLabel(type) + ' #' + id;
        state.loans.unshift({
          id,
          type,
          name,
          originalPrincipal: amount,
          balance: amount,
          accruedInterest: 0,
          annualRate,
          termMonths,
          createdDay: appState.day,
          collateralHoldingId,
          pledgedShares,
          warningRatio
        });
        state.cash += amount;
        recordHistory(true);
        el('cps-loan-name').value = '';
        setLoanFeedback('已建立 ' + name + '，現金增加 ' + money0.format(amount), false);
        setRepayFeedback('可選擇貸款進行部分或全額還款', false);
        render();
      }

      function repayLoan() {
        const loan = state.loans.find((item) => item.id === Number(el('cps-repay-loan').value));
        const requested = Number(el('cps-repay-amount').value);
        if (!loan || !isLoanActive(loan)) {
          setRepayFeedback('請先選擇待還款貸款', true);
          return;
        }
        if (!Number.isFinite(requested) || requested <= 0) {
          setRepayFeedback('還款金額必須大於 0', true);
          return;
        }
        const payment = Math.min(requested, outstandingLoan(loan));
        if (payment > state.cash) {
          setRepayFeedback('現金不足，目前可用 ' + money0.format(state.cash), true);
          return;
        }
        const interestPaid = Math.min(payment, loan.accruedInterest);
        loan.accruedInterest -= interestPaid;
        const principalPaid = Math.min(payment - interestPaid, loan.balance);
        loan.balance -= principalPaid;
        if (loan.accruedInterest < 0.005) loan.accruedInterest = 0;
        if (loan.balance < 0.005) loan.balance = 0;
        state.cash -= payment;
        recordHistory(true);
        setRepayFeedback(
          '已還款 ' + money0.format(payment) + '（利息 ' + money0.format(interestPaid) + '、本金 ' + money0.format(principalPaid) + '）',
          false
        );
        render();
      }

      function removeLoan(id) {
        const loan = state.loans.find((item) => item.id === id);
        if (!loan || isLoanActive(loan)) return;
        state.loans = state.loans.filter((item) => item.id !== id);
        setLoanFeedback('已移除清償完畢的 ' + loan.name, false);
        render();
      }

      function renderSummary() {
        const total = householdTotalAssets();
        const gross = householdGrossAssets();
        const debt = householdDebt();
        const exposure = householdExposure();
        const cash = householdSum((account) => account.cash);
        const exposureRate = Calc.exposureRatio(exposure, total);
        const totalPnl = total - householdStartingCapital();
        const dailyPnl = householdSum((account) => account.lastDailyPnl);
        const previousTotal = total - dailyPnl;
        const dailyReturn = previousTotal > 0 ? dailyPnl / previousTotal * 100 : 0;
        const pledges = [];
        ACCOUNT_IDS.forEach((accountId) => {
          const account = appState.accounts[accountId];
          account.loans
            .filter((loan) => loan.type === 'pledge' && isLoanActive(loan))
            .forEach((loan) => {
              pledges.push({ accountId, loan, ratio: maintenanceRatioFor(account, loan) });
            });
        });
        const lowestPledge = pledges.reduce((lowest, item) => {
          return !lowest || item.ratio < lowest.ratio ? item : lowest;
        }, null);
        const minimumRatio = lowestPledge ? lowestPledge.ratio : null;
        const warningRatio = lowestPledge ? lowestPledge.loan.warningRatio : 130;
        const hasPledgeWarning = minimumRatio !== null && minimumRatio < warningRatio;
        el('cps-total-assets').textContent = money0.format(total);
        el('cps-asset-breakdown').textContent = 'SM + WL 總資產 ' + money0.format(gross) + ' · 負債 ' + money0.format(debt);
        el('cps-total-exposure').textContent = money0.format(exposure);
        el('cps-exposure-ratio').textContent = '家庭曝險率 ' + exposureRate.toFixed(2) + '%（曝險 ÷ 淨資產）· 現金 ' + money0.format(cash);
        el('cps-daily-pnl').textContent = signedMoney(dailyPnl);
        el('cps-daily-pnl').classList.toggle('text-destructive', dailyPnl < 0);
        el('cps-daily-return').textContent = '家庭 ' + signedPercent(dailyReturn) + ' · 大盤 ' + signedPercent(appState.lastBenchmarkReturn);
        el('cps-total-pnl').textContent = signedMoney(totalPnl);
        el('cps-total-pnl').classList.toggle('text-destructive', totalPnl < 0);
        el('cps-risk-summary').textContent = '最大回撤 ' + signedPercent(maximumDrawdown()) + ' · 維持率 ' + (minimumRatio === null ? '—' : minimumRatio.toFixed(1) + '%');
        el('cps-risk-summary').classList.toggle('text-destructive', hasPledgeWarning);

        const meter = el('cps-maintenance-meter');
        const fill = el('cps-maintenance-fill');
        const marker = el('cps-maintenance-marker');
        meter.hidden = minimumRatio === null;
        if (minimumRatio !== null) {
          const scaleMax = Math.max(200, minimumRatio * 1.1, warningRatio * 1.15);
          fill.style.width = Math.min(100, minimumRatio / scaleMax * 100).toFixed(2) + '%';
          marker.style.left = Math.min(100, warningRatio / scaleMax * 100).toFixed(2) + '%';
          fill.classList.toggle('is-danger', hasPledgeWarning);
          meter.setAttribute('aria-valuemin', '0');
          meter.setAttribute('aria-valuemax', scaleMax.toFixed(0));
          meter.setAttribute('aria-valuenow', minimumRatio.toFixed(1));
          meter.setAttribute(
            'aria-valuetext',
            (lowestPledge ? ACCOUNT_LABELS[lowestPledge.accountId] : '') + '最低維持率 ' +
              minimumRatio.toFixed(1) + '%，警示線 ' + warningRatio.toFixed(1) + '%'
          );
        }
        el('cps-day-badge').textContent = '第 ' + appState.day + ' 天';
      }

      function renderAssetRegister() {
        const householdCash = householdSum((account) => account.cash);
        const stockValue = householdSum(holdingsValueFor);
        const realEstate = householdSum((account) => account.realEstate);
        const vehicles = householdSum((account) => account.vehicles);
        const gross = householdGrossAssets();
        const values = [householdCash, stockValue, realEstate, vehicles];
        const inputPairs = [
          ['cps-cash-value', state.cash],
          ['cps-real-estate-value', state.realEstate],
          ['cps-vehicle-value', state.vehicles]
        ];
        inputPairs.forEach(([id, value]) => {
          const input = el(id);
          if (document.activeElement !== input) input.value = String(Math.round(value));
        });

        ['cps-mix-cash', 'cps-mix-stocks', 'cps-mix-property', 'cps-mix-vehicle'].forEach((id, index) => {
          el(id).style.width = (gross > 0 ? values[index] / gross * 100 : 0).toFixed(3) + '%';
        });
        el('cps-legend-cash').textContent = money0.format(householdCash);
        el('cps-legend-stocks').textContent = money0.format(stockValue);
        el('cps-legend-property').textContent = money0.format(realEstate);
        el('cps-legend-vehicle').textContent = money0.format(vehicles);

        const labels = ['現金', '股票', '房地產', '汽車'];
        const allocation = labels.map((label, index) => {
          const ratio = gross > 0 ? values[index] / gross * 100 : 0;
          return label + ' ' + ratio.toFixed(1) + '%';
        }).join('，');
        el('cps-asset-mix').setAttribute('aria-label', 'SM 與 WL 家庭資產配置：' + allocation);
      }

      function renderAccountContext() {
        ACCOUNT_IDS.forEach((accountId) => {
          const button = el('cps-account-' + accountId.toLowerCase());
          const selected = appState.activeAccountId === accountId;
          button.classList.toggle('is-active', selected);
          button.setAttribute('aria-selected', selected ? 'true' : 'false');
          button.tabIndex = selected ? 0 : -1;
        });
        const label = ACCOUNT_LABELS[appState.activeAccountId];
        el('cps-active-account-name').textContent = label;
        el('cps-account-assets-title').textContent = label + '資產設定';
        el('cps-chart-account-label').textContent = label + '淨資產報酬率';
        el('cps-account-net').textContent = money0.format(totalAssets());
        el('cps-account-gross').textContent = money0.format(grossAssets());
        el('cps-account-debt').textContent = money0.format(totalDebt());
        el('cps-account-exposure').textContent = money0.format(totalExposure());
      }

      function renderScenarioPreview() {
        const total = totalAssets();
        const marketMove = state.holdings.reduce((sum, holding) => {
          return sum + holding.shares * holding.price * (Number(holding.move) || 0) / 100;
        }, 0);
        const interest = dailyInterestEstimate();
        const expected = marketMove - interest;
        const expectedReturn = total > 0 ? expected / total * 100 : 0;
        el('cps-scenario-preview').textContent = '預估今日損益 ' + signedMoney(expected) + ' · 利息 ' + money0.format(interest) + ' · 組合約 ' + signedPercent(expectedReturn);
        state.holdings.forEach((holding) => {
          const contribution = holding.shares * holding.price * (Number(holding.move) || 0) / 100;
          const cell = root.querySelector('[data-contribution-id="' + holding.id + '"]');
          if (cell) cell.textContent = signedMoney(contribution);
        });
      }

      function renderHoldings() {
        syncAccountPrices(state);
        const body = el('cps-holdings-body');
        const total = grossAssets();
        if (!state.holdings.length) {
          body.innerHTML = '<tr><td colspan="9" class="text-center text-muted">請先新增股票</td></tr>';
          el('cps-holdings-count').textContent = '0 檔股票';
          el('cps-allocation').innerHTML = '';
          el('cps-allocation').setAttribute('aria-label', '目前只有現金');
          return;
        }
        body.innerHTML = state.holdings.map((holding) => {
          holding.exposureMultiplier = normalizeExposureMultiplier(holding.exposureMultiplier, holding.symbol);
          const value = holding.shares * holding.price;
          const exposure = value * holding.exposureMultiplier;
          const weight = total > 0 ? value / total * 100 : 0;
          const pnl = holding.shares * (holding.price - holding.averageCost);
          const pledged = pledgedSharesFor(holding.id);
          const disabled = pledged > 0 ? ' disabled' : '';
          const removeTooltip = pledged > 0 ? '仍有股票質押，請先完成還款' : '移除既有持股（不影響現金）';
          const pledgedNote = pledged > 0 ? '<br><span class="text-small text-muted">質押 ' + number0.format(pledged) + ' 股</span>' : '';
          return '<tr>' +
            '<td><span class="cps-symbol">' + escapeHtml(holding.symbol) + '</span><br><span class="text-small text-muted">' + escapeHtml(holding.name) + ' · 均價 ' + money2.format(holding.averageCost) + '</span></td>' +
            '<td class="text-end text-nowrap">' + number0.format(holding.shares) + pledgedNote + '</td>' +
            '<td class="text-end text-nowrap">' + money2.format(holding.price) + '</td>' +
            '<td class="text-end text-nowrap">' + money0.format(value) + '<br><span class="text-small">' + signedMoney(pnl) + '</span></td>' +
            '<td class="text-end">' + weight.toFixed(1) + '%</td>' +
            '<td class="text-end cps-exposure-cell"><label class="sr-only" for="cps-exposure-' + holding.id + '">' + escapeHtml(holding.symbol) + ' 曝險倍數</label><input class="form-control cps-exposure-input" id="cps-exposure-' + holding.id + '" data-exposure-id="' + holding.id + '" type="number" min="0.1" max="10" step="0.1" value="' + holding.exposureMultiplier + '" inputmode="decimal"><span class="text-small text-muted text-nowrap cps-exposure-value">曝險 ' + money0.format(exposure) + '</span></td>' +
            '<td class="text-end"><label class="sr-only" for="cps-move-' + holding.id + '">' + escapeHtml(holding.symbol) + ' 今日漲跌百分比</label><input class="form-control cps-move-input" id="cps-move-' + holding.id + '" data-move-id="' + holding.id + '" type="number" min="-100" max="100" step="0.1" value="' + holding.move + '" inputmode="decimal"></td>' +
            '<td class="text-end text-nowrap" data-contribution-id="' + holding.id + '">' + signedMoney(value * holding.move / 100) + '</td>' +
            '<td><button class="btn btn-ghost" type="button" data-remove-id="' + holding.id + '" data-tooltip="' + removeTooltip + '" aria-label="移除 ' + escapeHtml(holding.symbol) + '"' + disabled + '><i data-lucide="x" aria-hidden="true"></i></button></td>' +
          '</tr>';
        }).join('');
        el('cps-holdings-count').textContent = state.holdings.length + ' 檔股票 · 最大持股 ' + concentration().toFixed(1) + '%';

        const segments = state.holdings.filter((holding) => holding.shares > 0).map((holding) => {
          const weight = total > 0 ? holding.shares * holding.price / total * 100 : 0;
          return '<span class="cps-allocation-segment" style="width:' + weight.toFixed(3) + '%" aria-hidden="true"></span>';
        });
        el('cps-allocation').innerHTML = segments.join('');
        const allocationLabel = state.holdings.filter((holding) => holding.shares > 0).map((holding) => {
          const weight = total > 0 ? holding.shares * holding.price / total * 100 : 0;
          return holding.symbol + ' ' + weight.toFixed(1) + '%';
        }).join('，');
        el('cps-allocation').setAttribute('aria-label', '權重分布：' + (allocationLabel || '目前只有現金'));

        root.querySelectorAll('[data-move-id]').forEach((input) => {
          input.addEventListener('input', (event) => {
            const id = Number(event.target.dataset.moveId);
            const holding = state.holdings.find((item) => item.id === id);
            if (holding) setMarketMove(holding.symbol, event.target.value);
            renderScenarioPreview();
          });
        });
        root.querySelectorAll('[data-exposure-id]').forEach((input) => {
          input.addEventListener('input', (event) => {
            const id = Number(event.target.dataset.exposureId);
            const holding = state.holdings.find((item) => item.id === id);
            const requested = Number(event.target.value);
            if (!holding || !Number.isFinite(requested) || requested <= 0 || requested > 10) return;
            const multiplier = setExposureMultiplier(holding.symbol, requested);
            const exposureLabel = event.target.parentElement.querySelector('.cps-exposure-value');
            if (exposureLabel) {
              exposureLabel.textContent = '曝險 ' + money0.format(holding.shares * holding.price * multiplier);
            }
            renderSummary();
            renderAccountContext();
            persistState();
          });
          input.addEventListener('change', (event) => {
            const id = Number(event.target.dataset.exposureId);
            const holding = state.holdings.find((item) => item.id === id);
            if (!holding) return;
            setExposureMultiplier(holding.symbol, event.target.value);
            render();
          });
        });
        root.querySelectorAll('[data-remove-id]').forEach((button) => {
          button.addEventListener('click', () => removeStock(Number(button.dataset.removeId)));
        });
        if (window.lucide) window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
      }

      function renderTradeSelect() {
        const select = el('cps-trade-symbol');
        const previousValue = select.value;
        if (!state.holdings.length) {
          select.innerHTML = '<option value="">尚無股票</option>';
          renderTradePrice();
          return;
        }
        select.innerHTML = state.holdings.map((holding) => {
          return '<option value="' + holding.id + '">' + escapeHtml(holding.symbol) + ' · ' + escapeHtml(holding.name) + '</option>';
        }).join('');
        if (state.holdings.some((holding) => String(holding.id) === previousValue)) select.value = previousValue;
        renderTradePrice();
      }

      function renderTradePrice() {
        const holding = selectedHolding();
        const pledged = holding ? pledgedSharesFor(holding.id) : 0;
        el('cps-trade-price').textContent = holding
          ? '成交價 ' + money2.format(holding.price) + ' · 持有 ' + number0.format(holding.shares) + ' 股 · 可賣 ' + number0.format(Math.max(0, holding.shares - pledged)) + ' 股'
          : '成交價 NT$0';
      }

      function renderPledgeFields() {
        const isPledge = el('cps-loan-type').value === 'pledge';
        el('cps-pledge-fields').hidden = !isPledge;
        if (isPledge) updatePledgePreview();
      }

      function updatePledgePreview() {
        if (el('cps-loan-type').value !== 'pledge') return;
        const holding = state.holdings.find((item) => item.id === Number(el('cps-collateral-stock').value));
        const shares = Math.max(0, Math.floor(Number(el('cps-pledged-shares').value) || 0));
        const amount = Number(el('cps-loan-amount').value) || 0;
        if (!holding) {
          el('cps-pledge-preview').textContent = '請先選擇質押股票';
          return;
        }
        const available = Math.max(0, holding.shares - pledgedSharesFor(holding.id));
        const ratio = amount > 0 ? holding.price * shares / amount * 100 : 0;
        el('cps-pledged-shares').max = available;
        el('cps-pledge-preview').textContent = '預估維持率 ' + ratio.toFixed(1) + '% · 可質押 ' + number0.format(available) + ' 股';
      }

      function renderLoanControls() {
        const collateral = el('cps-collateral-stock');
        const previousCollateral = collateral.value;
        collateral.innerHTML = state.holdings.length
          ? state.holdings.map((holding) => '<option value="' + holding.id + '">' + escapeHtml(holding.symbol) + ' · 可用 ' + number0.format(Math.max(0, holding.shares - pledgedSharesFor(holding.id))) + ' 股</option>').join('')
          : '<option value="">尚無股票</option>';
        if (state.holdings.some((holding) => String(holding.id) === previousCollateral)) collateral.value = previousCollateral;

        const repay = el('cps-repay-loan');
        const previousLoan = repay.value;
        const activeLoans = state.loans.filter(isLoanActive);
        repay.innerHTML = activeLoans.length
          ? activeLoans.map((loan) => '<option value="' + loan.id + '">' + escapeHtml(loan.name) + ' · ' + money0.format(outstandingLoan(loan)) + '</option>').join('')
          : '<option value="">尚無貸款</option>';
        if (activeLoans.some((loan) => String(loan.id) === previousLoan)) repay.value = previousLoan;
        el('cps-repay').disabled = !activeLoans.length;
        renderPledgeFields();
      }

      function renderLoans() {
        const body = el('cps-loans-body');
        el('cps-loan-count').textContent = state.loans.length + ' 筆 · 負債 ' + money0.format(totalDebt());
        if (!state.loans.length) {
          body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">尚無貸款</td></tr>';
          el('cps-pledge-alert').textContent = '目前無股票質押';
          el('cps-pledge-alert').classList.remove('text-destructive');
          return;
        }

        const warnings = [];
        body.innerHTML = state.loans.map((loan) => {
          const active = isLoanActive(loan);
          const holding = state.holdings.find((item) => item.id === loan.collateralHoldingId);
          const ratio = maintenanceRatio(loan);
          const below = ratio !== null && ratio < loan.warningRatio;
          if (below) warnings.push({
            name: loan.name,
            ratio,
            shortfall: Math.max(0, outstandingLoan(loan) * loan.warningRatio / 100 - holding.price * loan.pledgedShares)
          });
          const collateralText = loan.type === 'pledge'
            ? (holding ? escapeHtml(holding.symbol) + ' · ' + number0.format(loan.pledgedShares) + ' 股' : '擔保品不存在') +
              '<br><span class="' + (below ? 'text-destructive' : 'text-muted') + '">維持率 ' + (ratio === null ? '—' : ratio.toFixed(1) + '%') + '</span>'
            : '<span class="text-muted">無股票擔保</span>';
          const status = !active
            ? '<span>已清償</span>'
            : below
              ? '<span class="text-destructive">低於警示</span>'
              : '<span>正常</span>';
          const threshold = loan.type === 'pledge'
            ? '<br><label class="text-small text-muted">警示線 <input class="form-control cps-threshold-input" data-warning-id="' + loan.id + '" type="number" min="1" step="1" value="' + loan.warningRatio + '" aria-label="' + escapeHtml(loan.name) + ' 維持率警示線">%</label>'
            : '';
          return '<tr>' +
            '<td><span class="cps-symbol">' + escapeHtml(loan.name) + '</span><br><span class="text-small text-muted">' + loanTypeLabel(loan.type) + ' · 第 ' + loan.createdDay + ' 天</span></td>' +
            '<td class="text-end text-nowrap">' + money0.format(loan.balance) + '<br><span class="text-small text-muted">原始 ' + money0.format(loan.originalPrincipal) + '</span></td>' +
            '<td class="text-end text-nowrap">' + money2.format(loan.accruedInterest) + '</td>' +
            '<td class="text-end text-nowrap">' + loan.annualRate.toFixed(2) + '% · ' + loan.termMonths + ' 期<br><span class="text-small text-muted">月付約 ' + money0.format(estimatedMonthlyPayment(loan)) + '</span></td>' +
            '<td>' + collateralText + threshold + '</td>' +
            '<td>' + status + '</td>' +
            '<td><button class="btn btn-ghost" type="button" data-remove-loan-id="' + loan.id + '" data-tooltip="' + (active ? '清償後可移除' : '移除貸款') + '" aria-label="移除 ' + escapeHtml(loan.name) + '"' + (active ? ' disabled' : '') + '><i data-lucide="x" aria-hidden="true"></i></button></td>' +
          '</tr>';
        }).join('');

        const activePledges = state.loans.filter((loan) => loan.type === 'pledge' && isLoanActive(loan));
        if (warnings.length) {
          const warning = warnings[0];
          el('cps-pledge-alert').textContent = '維持率警示：' + warning.name + ' 為 ' + warning.ratio.toFixed(1) + '%，補足擔保品市值缺口約 ' + money0.format(warning.shortfall);
          el('cps-pledge-alert').classList.add('text-destructive');
        } else {
          el('cps-pledge-alert').textContent = activePledges.length ? '所有股票質押均高於自訂警示線' : '目前無股票質押';
          el('cps-pledge-alert').classList.remove('text-destructive');
        }

        root.querySelectorAll('[data-warning-id]').forEach((input) => {
          input.addEventListener('change', () => {
            const loan = state.loans.find((item) => item.id === Number(input.dataset.warningId));
            const value = Number(input.value);
            if (loan && Number.isFinite(value) && value > 0) {
              loan.warningRatio = value;
              renderSummary();
              renderLoans();
            }
          });
        });
        root.querySelectorAll('[data-remove-loan-id]').forEach((button) => {
          button.addEventListener('click', () => removeLoan(Number(button.dataset.removeLoanId)));
        });
        if (window.lucide) window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
      }

      function renderTransactions() {
        const body = el('cps-transactions-body');
        if (!state.transactions.length) {
          body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">尚無交易</td></tr>';
          return;
        }
        body.innerHTML = state.transactions.slice(0, 8).map((transaction) => {
          const flow = (transaction.cashFlow > 0 ? '+' : '') + money0.format(transaction.cashFlow);
          return '<tr>' +
            '<td class="text-nowrap">第 ' + transaction.day + ' 天</td>' +
            '<td>' + transaction.type + '</td>' +
            '<td class="cps-symbol">' + escapeHtml(transaction.symbol) + '</td>' +
            '<td class="text-end">' + number0.format(transaction.quantity) + '</td>' +
            '<td class="text-end">' + money2.format(transaction.price) + '</td>' +
            '<td class="text-end">' + money0.format(transaction.costs) + '</td>' +
            '<td class="text-end">' + flow + '</td>' +
          '</tr>';
        }).join('');
      }

      function chartGeometry() {
        const svg = el('cps-chart');
        const width = Math.max(300, Math.round(svg.getBoundingClientRect().width || 720));
        const height = svg.getBoundingClientRect().height || 290;
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        return { width, height, left: 50, right: 18, top: 18, bottom: 36 };
      }

      function renderChart() {
        const geometry = chartGeometry();
        const { width, height, left, right, top, bottom } = geometry;
        const plotWidth = Math.max(1, width - left - right);
        const plotHeight = Math.max(1, height - top - bottom);
        const values = state.history.flatMap((point) => [point.portfolioReturn, point.benchmarkReturn]);
        let minValue = Math.min(0, ...values);
        let maxValue = Math.max(0, ...values);
        const spread = Math.max(4, maxValue - minValue);
        minValue -= spread * 0.12;
        maxValue += spread * 0.12;
        const xAt = (index) => left + (state.history.length <= 1 ? 0 : index / (state.history.length - 1)) * plotWidth;
        const yAt = (value) => top + (maxValue - value) / (maxValue - minValue) * plotHeight;
        const pathFor = (key) => state.history.map((point, index) => {
          return (index === 0 ? 'M' : 'L') + xAt(index).toFixed(2) + ',' + yAt(point[key]).toFixed(2);
        }).join(' ');
        el('cps-portfolio-line').setAttribute('d', pathFor('portfolioReturn'));
        el('cps-benchmark-line').setAttribute('d', pathFor('benchmarkReturn'));

        const lastIndex = state.history.length - 1;
        const latest = state.history[lastIndex];
        const latestX = xAt(lastIndex);
        el('cps-portfolio-dot').setAttribute('cx', latestX);
        el('cps-portfolio-dot').setAttribute('cy', yAt(latest.portfolioReturn));
        el('cps-benchmark-dot').setAttribute('cx', latestX);
        el('cps-benchmark-dot').setAttribute('cy', yAt(latest.benchmarkReturn));

        const grid = [];
        for (let index = 0; index < 5; index += 1) {
          const ratio = index / 4;
          const y = top + ratio * plotHeight;
          const value = maxValue - ratio * (maxValue - minValue);
          grid.push('<line class="cps-grid-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + y + '" y2="' + y + '"></line>');
          grid.push('<text class="cps-axis-text" x="' + (left - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + signedPercent(value) + '</text>');
        }
        grid.push('<line class="cps-axis-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + (height - bottom) + '" y2="' + (height - bottom) + '"></line>');
        grid.push('<text class="cps-axis-text" x="' + left + '" y="' + (height - 10) + '">第 ' + state.history[0].day + ' 天</text>');
        if (lastIndex > 1) {
          const middleIndex = Math.floor(lastIndex / 2);
          grid.push('<text class="cps-axis-text" x="' + xAt(middleIndex) + '" y="' + (height - 10) + '" text-anchor="middle">第 ' + state.history[middleIndex].day + ' 天</text>');
        }
        grid.push('<text class="cps-axis-text" x="' + (width - right) + '" y="' + (height - 10) + '" text-anchor="end">第 ' + latest.day + ' 天</text>');
        el('cps-chart-grid').innerHTML = grid.join('');

        const hit = el('cps-chart-hit');
        hit.setAttribute('x', left);
        hit.setAttribute('y', top);
        hit.setAttribute('width', plotWidth);
        hit.setAttribute('height', plotHeight);
        el('cps-chart').dataset.left = left;
        el('cps-chart').dataset.plotWidth = plotWidth;
        el('cps-chart').dataset.top = top;
        el('cps-chart').dataset.bottomY = height - bottom;
        el('cps-selected-point').textContent = '第 ' + latest.day + ' 天 · 組合 ' + signedPercent(latest.portfolioReturn) + ' · 大盤 ' + signedPercent(latest.benchmarkReturn);
      }

      function showChartPoint(event) {
        const svg = el('cps-chart');
        const rect = svg.getBoundingClientRect();
        const left = Number(svg.dataset.left);
        const plotWidth = Number(svg.dataset.plotWidth);
        const localX = (event.clientX - rect.left) / rect.width * svg.viewBox.baseVal.width;
        const ratio = Math.max(0, Math.min(1, (localX - left) / plotWidth));
        const index = Math.round(ratio * (state.history.length - 1));
        const point = state.history[index];
        const x = left + (state.history.length <= 1 ? 0 : index / (state.history.length - 1)) * plotWidth;
        const hoverLine = el('cps-hover-line');
        hoverLine.setAttribute('x1', x);
        hoverLine.setAttribute('x2', x);
        hoverLine.setAttribute('y1', svg.dataset.top);
        hoverLine.setAttribute('y2', svg.dataset.bottomY);
        hoverLine.setAttribute('visibility', 'visible');
        const tooltip = el('cps-tooltip');
        tooltip.innerHTML = '<strong>第 ' + point.day + ' 天</strong><br>淨資產 ' + money0.format(point.total) + '<br>組合 ' + signedPercent(point.portfolioReturn) + ' · 大盤 ' + signedPercent(point.benchmarkReturn);
        tooltip.style.display = 'block';
        const xCss = x / svg.viewBox.baseVal.width * rect.width;
        const tooltipWidth = tooltip.getBoundingClientRect().width;
        tooltip.style.left = Math.max(4, Math.min(el('cps-chart-wrap').clientWidth - tooltipWidth - 4, xCss + 10)) + 'px';
        tooltip.style.top = '8px';
        el('cps-selected-point').textContent = '第 ' + point.day + ' 天 · 組合 ' + signedPercent(point.portfolioReturn) + ' · 大盤 ' + signedPercent(point.benchmarkReturn);
      }

      function hideChartPoint() {
        el('cps-hover-line').setAttribute('visibility', 'hidden');
        el('cps-tooltip').style.display = 'none';
        const latest = state.history[state.history.length - 1];
        el('cps-selected-point').textContent = '第 ' + latest.day + ' 天 · 組合 ' + signedPercent(latest.portfolioReturn) + ' · 大盤 ' + signedPercent(latest.benchmarkReturn);
      }


      function captureAccountSettings() {
        if (!state.settings) state.settings = {};
        state.settings.startingCapitalInput = el('cps-starting-capital').value;
        state.settings.commissionRate = el('cps-commission-rate').value;
        state.settings.taxRate = el('cps-tax-rate').value;
      }

      function applyAccountSettings() {
        const settings = state.settings || {};
        el('cps-starting-capital').value = settings.startingCapitalInput !== undefined
          ? settings.startingCapitalInput
          : String(state.startingCapital);
        el('cps-commission-rate').value = settings.commissionRate !== undefined ? settings.commissionRate : '0.1425';
        el('cps-tax-rate').value = settings.taxRate !== undefined ? settings.taxRate : '0.3';
      }

      function switchAccount(accountId) {
        if (!ACCOUNT_IDS.includes(accountId) || accountId === appState.activeAccountId) return;
        captureAccountSettings();
        setAutoPlaying(false);
        appState.activeAccountId = accountId;
        state = appState.accounts[accountId];
        applyAccountSettings();
        setAssetFeedback('正在編輯 ' + ACCOUNT_LABELS[accountId], false);
        setAddFeedback('目前正在管理 ' + ACCOUNT_LABELS[accountId], false);
        setTradeFeedback('交易只會記入 ' + ACCOUNT_LABELS[accountId], false);
        setLoanFeedback('借貸只會記入 ' + ACCOUNT_LABELS[accountId], false);
        setRepayFeedback(state.loans.some(isLoanActive) ? '可選擇貸款進行還款' : '目前沒有待還款貸款', false);
        render();
      }

      function settingsSnapshot() {
        captureAccountSettings();
        return {
          benchmarkMove: el('cps-benchmark-move').value
        };
      }

      function serializeBaseline(baseline) {
        if (!baseline) return null;
        return {
          ...baseline,
          holdings: baseline.holdings.map((holding) => ({ ...holding })),
          loans: baseline.loans.map((loan) => ({ ...loan })),
          transactions: baseline.transactions.map((transaction) => ({ ...transaction }))
        };
      }

      function serializeAccount(account) {
        return {
          ...account,
          holdings: account.holdings.map((holding) => ({ ...holding })),
          loans: account.loans.map((loan) => ({ ...loan })),
          history: account.history.map((point) => ({ ...point })),
          transactions: account.transactions.map((transaction) => ({ ...transaction })),
          settings: { ...account.settings },
          baseline: serializeBaseline(account.baseline)
        };
      }

      function exportPayload() {
        const settings = settingsSnapshot();
        return {
          app: 'stock-portfolio-simulator',
          version: 3,
          savedAt: new Date().toISOString(),
          state: {
            activeAccountId: appState.activeAccountId,
            day: appState.day,
            benchmark: appState.benchmark,
            lastBenchmarkReturn: appState.lastBenchmarkReturn,
            market: Object.fromEntries(
              Object.entries(appState.market).map(([symbol, quote]) => [symbol, { ...quote }])
            ),
            accounts: {
              SM: serializeAccount(appState.accounts.SM),
              WL: serializeAccount(appState.accounts.WL)
            }
          },
          settings
        };
      }

      function normalizeBaseline(baseline) {
        if (!baseline) return null;
        return {
          ...baseline,
          realEstate: Math.max(0, Number(baseline.realEstate) || 0),
          vehicles: Math.max(0, Number(baseline.vehicles) || 0),
          holdings: Array.isArray(baseline.holdings) ? baseline.holdings.map((holding) => ({
            ...holding,
            exposureMultiplier: normalizeExposureMultiplier(holding.exposureMultiplier, holding.symbol)
          })) : [],
          loans: Array.isArray(baseline.loans) ? baseline.loans.map((loan) => ({ ...loan })) : [],
          transactions: Array.isArray(baseline.transactions) ? baseline.transactions.map((transaction) => ({ ...transaction })) : []
        };
      }

      function normalizeAccount(saved, fallbackCapital = 0, legacySettings = null) {
        const account = createAccount(saved && saved.startingCapital !== undefined ? saved.startingCapital : fallbackCapital);
        if (!saved) return account;
        Object.assign(account, saved, {
          startingCapital: Math.max(0, Number(saved.startingCapital) || 0),
          cash: Math.max(0, Number(saved.cash) || 0),
          realEstate: Math.max(0, Number(saved.realEstate) || 0),
          vehicles: Math.max(0, Number(saved.vehicles) || 0),
          holdings: saved.holdings.map((holding) => ({
            ...holding,
            exposureMultiplier: normalizeExposureMultiplier(holding.exposureMultiplier, holding.symbol)
          })),
          loans: saved.loans.map((loan) => ({ ...loan })),
          history: saved.history.map((point) => ({ ...point })),
          transactions: saved.transactions.map((transaction) => ({ ...transaction })),
          settings: {
            ...account.settings,
            ...(legacySettings || {}),
            ...(saved.settings || {})
          },
          baseline: normalizeBaseline(saved.baseline)
        });
        return account;
      }

      function applySavedSettings(settings) {
        if (settings && settings.benchmarkMove !== undefined) {
          el('cps-benchmark-move').value = settings.benchmarkMove;
        }
        applyAccountSettings();
      }

      function restorePayload(payload, announce) {
        const saved = payload.state;
        setAutoPlaying(false);
        if (payload.version === 3 && saved.accounts) {
          appState.activeAccountId = ACCOUNT_IDS.includes(saved.activeAccountId) ? saved.activeAccountId : 'SM';
          appState.day = Math.max(0, Math.floor(Number(saved.day) || 0));
          appState.benchmark = Math.max(0.01, Number(saved.benchmark) || 100);
          appState.lastBenchmarkReturn = Number(saved.lastBenchmarkReturn) || 0;
          appState.accounts.SM = normalizeAccount(saved.accounts.SM);
          appState.accounts.WL = normalizeAccount(saved.accounts.WL);
          appState.market = Object.fromEntries(
            Object.entries(saved.market || {}).map(([symbol, quote]) => [symbol, {
              price: Math.max(0.01, Number(quote.price) || 0.01),
              move: Math.max(-100, Math.min(100, Number(quote.move) || 0)),
              name: quote.name || symbol
            }])
          );
        } else {
          const legacySettings = {
            startingCapitalInput: payload.settings && payload.settings.startingCapitalInput,
            commissionRate: payload.settings && payload.settings.commissionRate,
            taxRate: payload.settings && payload.settings.taxRate
          };
          appState.activeAccountId = 'SM';
          appState.day = Math.max(0, Math.floor(Number(saved.day) || 0));
          appState.benchmark = Math.max(0.01, Number(saved.benchmark) || 100);
          appState.lastBenchmarkReturn = Number(saved.lastBenchmarkReturn) || 0;
          appState.accounts.SM = normalizeAccount(saved, 0, legacySettings);
          appState.accounts.WL = createAccount(0);
          appState.market = {};
        }
        rebuildMarketFromAccounts(false);
        state = appState.accounts[appState.activeAccountId];
        ACCOUNT_IDS.forEach((accountId) => {
          const account = appState.accounts[accountId];
          if (!account.history.length) recordHistoryFor(account, false);
          if (!account.baseline) updateBaseline(account, true);
        });
        applySavedSettings(payload.settings);
        if (announce) {
          const stockCount = householdSum((account) => account.holdings.length);
          const loanCount = householdSum((account) => account.loans.length);
          setAddFeedback('SM/WL 資料匯入完成，共 ' + stockCount + ' 檔帳戶持股、' + loanCount + ' 筆貸款', false);
          setTradeFeedback('兩個帳戶狀態已恢復', false);
        }
      }

      function persistState() {
        const saved = Storage.save(exportPayload());
        el('cps-save-status').textContent = saved ? '已自動儲存' : '自動儲存不可用';
        el('cps-save-status').classList.toggle('text-destructive', !saved);
        if (saved) scheduleDriveAutoSave();
      }

      async function exportData() {
        const date = new Date().toISOString().slice(0, 10);
        try {
          el('cps-save-status').textContent = '請選擇本機備份位置';
          const result = await Storage.saveAs(exportPayload(), 'stock-simulator-' + date + '.json');
          el('cps-save-status').textContent = result.method === 'picker'
            ? '本機備份已另存：' + result.filename
            : '本機備份已下載';
          el('cps-save-status').classList.remove('text-destructive');
        } catch (error) {
          if (error && error.name === 'AbortError') {
            el('cps-save-status').textContent = '已取消備份';
            return;
          }
          el('cps-save-status').textContent = '備份失敗';
          el('cps-save-status').classList.add('text-destructive');
        }
      }

      function setDriveStatus(message, isError) {
        const status = el('cps-drive-status');
        status.textContent = message;
        status.classList.toggle('text-destructive', Boolean(isError));
      }

      function cancelDriveAutoSave() {
        if (!driveAutoSaveTimer) return;
        window.clearTimeout(driveAutoSaveTimer);
        driveAutoSaveTimer = null;
      }

      function scheduleDriveAutoSave() {
        if (
          suspendDriveAutoSave ||
          !Drive ||
          !Drive.isConfigured() ||
          !Drive.isConnected() ||
          driveAutoSaveTimer
        ) return;

        driveAutoSaveTimer = window.setTimeout(async () => {
          driveAutoSaveTimer = null;
          try {
            await performDriveSave(true);
          } catch (error) {
            setDriveStatus(error.message || 'Google Drive 自動儲存失敗', true);
          }
        }, DRIVE_AUTO_SAVE_DELAY);
      }

      async function performDriveSave(automatic) {
        if (driveSavePromise) {
          driveSavePending = true;
          return driveSavePromise;
        }

        if (automatic) setDriveStatus('正在自動儲存到 Google Drive…', false);
        const payload = exportPayload();
        driveSavePromise = Drive.save(payload);
        try {
          const file = await driveSavePromise;
          const action = file.created ? '已建立雲端備份' : '已自動更新雲端備份';
          setDriveStatus(action + '：' + file.name + '（' + Drive.ACCOUNT_EMAIL + '）', false);
          return file;
        } finally {
          driveSavePromise = null;
          if (driveSavePending) {
            driveSavePending = false;
            scheduleDriveAutoSave();
          }
        }
      }

      function refreshDriveControls(updateStatus = true) {
        const available = Boolean(Drive);
        const configured = available && Drive.isConfigured();
        const connected = configured && Drive.isConnected();
        const connectLabel = el('cps-drive-connect').querySelector('span');
        const storageMode = document.getElementById('cps-storage-mode');

        el('cps-drive-connect').disabled = !available;
        el('cps-drive-save').disabled = !configured;
        el('cps-drive-load').disabled = !configured;
        connectLabel.textContent = connected ? 'Drive 自動儲存中' : '連接 Drive';
        el('cps-drive-client-id').value = available ? Drive.getClientId() : '';
        if (storageMode) storageMode.textContent = connected ? '本機＋Drive 自動儲存' : '本機自動儲存';

        if (updateStatus) {
          if (!available) setDriveStatus('Google Drive 模組無法載入', true);
          else if (connected) setDriveStatus('已連接 ' + Drive.ACCOUNT_EMAIL + '，資產變更會自動儲存', false);
          else if (configured) setDriveStatus('設定已儲存，請連接 ' + Drive.ACCOUNT_EMAIL, false);
          else setDriveStatus('尚未設定 Google Drive', false);
        }
      }

      function setDriveBusy(isBusy) {
        el('cps-drive-connect').disabled = isBusy;
        el('cps-drive-save').disabled = isBusy;
        el('cps-drive-load').disabled = isBusy;
        el('cps-drive-apply-client').disabled = isBusy;
        el('cps-drive-clear-client').disabled = isBusy;
        if (!isBusy) refreshDriveControls(false);
      }

      function revealDriveSettings(message) {
        el('cps-drive-settings').open = true;
        if (message) setDriveStatus(message, true);
        el('cps-drive-client-id').focus();
      }

      async function connectDrive() {
        if (!Drive || !Drive.isConfigured()) {
          revealDriveSettings('請先貼上 Google OAuth Client ID');
          return false;
        }
        setDriveBusy(true);
        setDriveStatus('正在連接 Google Drive…', false);
        try {
          const connection = await Drive.connect();
          setDriveStatus('已連接 ' + connection.accountEmail + '，資產變更會自動儲存', false);
          return true;
        } catch (error) {
          setDriveStatus(error.message || 'Google Drive 連接失敗', true);
          return false;
        } finally {
          setDriveBusy(false);
        }
      }

      async function saveToDrive() {
        if (!Drive || !Drive.isConfigured()) {
          revealDriveSettings('請先貼上 Google OAuth Client ID');
          return;
        }
        setDriveBusy(true);
        try {
          cancelDriveAutoSave();
          if (!Drive.isConnected()) {
            setDriveStatus('請使用 ' + Drive.ACCOUNT_EMAIL + ' 完成登入…', false);
            await Drive.connect();
          }
          setDriveStatus('正在儲存到 Google Drive…', false);
          const file = await performDriveSave(false);
          setDriveStatus('已立即儲存：' + file.name + '（' + Drive.ACCOUNT_EMAIL + '）', false);
        } catch (error) {
          setDriveStatus(error.message || 'Google Drive 儲存失敗', true);
        } finally {
          setDriveBusy(false);
        }
      }

      async function loadFromDrive() {
        if (!Drive || !Drive.isConfigured()) {
          revealDriveSettings('請先貼上 Google OAuth Client ID');
          return;
        }
        setDriveBusy(true);
        suspendDriveAutoSave = true;
        try {
          cancelDriveAutoSave();
          if (driveSavePromise) await driveSavePromise;
          if (!Drive.isConnected()) {
            setDriveStatus('請使用 ' + Drive.ACCOUNT_EMAIL + ' 完成登入…', false);
            await Drive.connect();
          }
          setDriveStatus('正在讀取 Google Drive 備份…', false);
          const result = await Drive.load();
          const payload = Storage.validate(result.payload);
          setAutoPlaying(false);
          restorePayload(payload, true);
          render();
          setDriveStatus('已從 Google Drive 載入：' + result.file.name, false);
        } catch (error) {
          setDriveStatus(error.message || 'Google Drive 載入失敗', true);
        } finally {
          suspendDriveAutoSave = false;
          setDriveBusy(false);
        }
      }

      async function applyDriveClientId() {
        if (!Drive) {
          setDriveStatus('Google Drive 模組無法載入', true);
          return;
        }
        try {
          Drive.setClientId(el('cps-drive-client-id').value);
          refreshDriveControls();
          await connectDrive();
          if (Drive.isConnected()) el('cps-drive-settings').open = false;
        } catch (error) {
          revealDriveSettings(error.message || 'Client ID 設定失敗');
        }
      }

      async function clearDriveConnection() {
        if (!Drive) return;
        setDriveBusy(true);
        setDriveStatus('正在清除 Google Drive 連接…', false);
        try {
          cancelDriveAutoSave();
          if (driveSavePromise) await driveSavePromise;
          await Drive.disconnect();
          Drive.clearClientId();
          el('cps-drive-client-id').value = '';
          el('cps-drive-settings').open = true;
          setDriveStatus('Google Drive 連接已清除', false);
        } finally {
          setDriveBusy(false);
        }
      }

      async function importData(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          setAutoPlaying(false);
          const payload = await Storage.readFile(file);
          restorePayload(payload, true);
          render();
        } catch (error) {
          setAddFeedback('匯入失敗：' + error.message, true);
        } finally {
          event.target.value = '';
        }
      }

      function render() {
        if (appState.day === 0) ACCOUNT_IDS.forEach((accountId) => updateBaseline(appState.accounts[accountId]));
        renderSummary();
        renderAssetRegister();
        renderAccountContext();
        renderHoldings();
        renderScenarioPreview();
        renderTradeSelect();
        renderLoanControls();
        renderLoans();
        renderTransactions();
        renderChart();
        persistState();
      }

      el('cps-export-data').addEventListener('click', exportData);
      el('cps-import-data').addEventListener('click', () => el('cps-import-file').click());
      el('cps-import-file').addEventListener('change', importData);
      el('cps-drive-connect').addEventListener('click', connectDrive);
      el('cps-drive-save').addEventListener('click', saveToDrive);
      el('cps-drive-load').addEventListener('click', loadFromDrive);
      el('cps-drive-apply-client').addEventListener('click', applyDriveClientId);
      el('cps-drive-clear-client').addEventListener('click', clearDriveConnection);
      el('cps-account-sm').addEventListener('click', () => switchAccount('SM'));
      el('cps-account-wl').addEventListener('click', () => switchAccount('WL'));
      el('cps-apply-assets').addEventListener('click', applyAssetValues);
      el('cps-reset-account').addEventListener('click', resetAccount);
      el('cps-add-stock').addEventListener('click', addStock);
      el('cps-new-symbol').addEventListener('input', updateNewExposureDefault);
      el('cps-apply-day').addEventListener('click', applyDay);
      el('cps-auto').addEventListener('click', () => setAutoPlaying(!appState.timer));
      el('cps-reset-simulation').addEventListener('click', resetSimulation);
      el('cps-benchmark-move').addEventListener('input', renderScenarioPreview);
      el('cps-trade-symbol').addEventListener('change', renderTradePrice);
      el('cps-buy').addEventListener('click', buy);
      el('cps-sell').addEventListener('click', sell);
      el('cps-loan-type').addEventListener('change', () => {
        const defaults = {
          personal: { rate: 3, term: 60 },
          mortgage: { rate: 2.2, term: 360 },
          pledge: { rate: 3.5, term: 12 }
        };
        const values = defaults[el('cps-loan-type').value];
        el('cps-loan-rate').value = values.rate;
        el('cps-loan-term').value = values.term;
        renderPledgeFields();
      });
      el('cps-create-loan').addEventListener('click', createLoan);
      el('cps-repay').addEventListener('click', repayLoan);
      el('cps-collateral-stock').addEventListener('change', updatePledgePreview);
      el('cps-pledged-shares').addEventListener('input', updatePledgePreview);
      el('cps-loan-amount').addEventListener('input', updatePledgePreview);
      el('cps-chart-hit').addEventListener('pointermove', showChartPoint);
      el('cps-chart-hit').addEventListener('pointerleave', hideChartPoint);

      let resizeFrame = null;
      const resizeObserver = new ResizeObserver(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(renderChart);
      });
      resizeObserver.observe(el('cps-chart'));

      const savedPayload = Storage.load();
      if (savedPayload) restorePayload(savedPayload, false);
      else {
        ACCOUNT_IDS.forEach((accountId) => {
          recordHistoryFor(appState.accounts[accountId], false);
          updateBaseline(appState.accounts[accountId], true);
        });
        rebuildMarketFromAccounts(false);
        applyAccountSettings();
      }
      refreshDriveControls();
      el('cps-drive-settings').open = !Drive || !Drive.isConfigured();
      render();
      if (window.lucide) window.lucide.createIcons({ attrs: { width: 16, height: 16 } });
    })();
