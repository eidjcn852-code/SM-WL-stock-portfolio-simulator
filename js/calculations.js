(function (global) {
  'use strict';

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function holdingsValue(holdings) {
    return holdings.reduce((sum, holding) => {
      return sum + finiteNumber(holding.shares, 0) * finiteNumber(holding.price, 0);
    }, 0);
  }

  function holdingsExposure(holdings) {
    return holdings.reduce((sum, holding) => {
      const value = finiteNumber(holding.shares, 0) * finiteNumber(holding.price, 0);
      const multiplier = Math.max(0, finiteNumber(holding.exposureMultiplier, 1));
      return sum + value * multiplier;
    }, 0);
  }

  function outstandingLoan(loan) {
    return Math.max(0, finiteNumber(loan.balance, 0));
  }

  function totalDebt(loans) {
    return loans.reduce((sum, loan) => sum + outstandingLoan(loan), 0);
  }

  function physicalAssetsValue(assets) {
    const values = assets || {};
    return Math.max(0, finiteNumber(values.realEstate, 0)) +
      Math.max(0, finiteNumber(values.vehicles, 0));
  }

  function grossAssets(cash, holdings, assets) {
    return Math.max(0, finiteNumber(cash, 0)) + holdingsValue(holdings) +
      physicalAssetsValue(assets);
  }

  function totalExposure(holdings, assets) {
    const values = assets || {};
    return holdingsExposure(holdings) +
      Math.max(0, finiteNumber(values.realEstate, 0));
  }

  function exposureRatio(exposure, netTotal) {
    const total = finiteNumber(netTotal, 0);
    if (total <= 0) return 0;
    return Math.max(0, finiteNumber(exposure, 0)) / total * 100;
  }

  function netAssets(cash, holdings, loans, assets) {
    return grossAssets(cash, holdings, assets) - totalDebt(loans);
  }

  function maintenanceRatio(loan, holding) {
    if (!holding) return 0;
    const debt = outstandingLoan(loan);
    if (debt <= 0) return null;
    const collateralValue = Math.max(0, finiteNumber(holding.price, 0)) *
      Math.max(0, finiteNumber(loan.pledgedShares, 0));
    return collateralValue / debt * 100;
  }

  function tradeFee(gross, rate, minimumFee) {
    const amount = Math.max(0, finiteNumber(gross, 0));
    const feeRate = Math.max(0, finiteNumber(rate, 0));
    const minimum = Math.max(0, finiteNumber(minimumFee, 20));
    if (amount <= 0 || feeRate === 0) return 0;
    return Math.max(minimum, Math.round(amount * feeRate));
  }

  function maximumDrawdown(history) {
    let peak = 0;
    let maximum = 0;
    history.forEach((point) => {
      const total = finiteNumber(point.total, 0);
      peak = Math.max(peak, total);
      if (peak > 0) maximum = Math.min(maximum, total / peak - 1);
    });
    return maximum * 100;
  }

  function concentration(holdings, grossTotal) {
    const total = finiteNumber(grossTotal, 0);
    if (total <= 0) return 0;
    return Math.max(0, ...holdings.map((holding) => {
      return finiteNumber(holding.shares, 0) * finiteNumber(holding.price, 0) / total * 100;
    }));
  }

  const api = {
    concentration,
    exposureRatio,
    grossAssets,
    holdingsExposure,
    holdingsValue,
    maintenanceRatio,
    maximumDrawdown,
    netAssets,
    outstandingLoan,
    physicalAssetsValue,
    totalDebt,
    totalExposure,
    tradeFee
  };

  global.StockSimulatorCalculations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
