const assert = require('node:assert/strict');
const calc = require('../js/calculations.js');

const holdings = [
  { shares: 1000, price: 120 },
  { shares: 500, price: 80 }
];
const loans = [
  { balance: 50000, accruedInterest: 125, annualRate: 3.65 }
];
const physicalAssets = {
  realEstate: 8000000,
  vehicles: 1000000
};

assert.equal(calc.holdingsValue(holdings), 160000);
assert.equal(calc.outstandingLoan(loans[0]), 50125);
assert.equal(calc.totalDebt(loans), 50125);
assert.equal(calc.grossAssets(40000, holdings), 200000);
assert.equal(calc.netAssets(40000, holdings, loans), 149875);
assert.equal(calc.physicalAssetsValue(physicalAssets), 9000000);
assert.equal(calc.grossAssets(40000, holdings, physicalAssets), 9200000);
assert.equal(calc.totalExposure(holdings, physicalAssets), 9160000);
assert.equal(calc.netAssets(40000, holdings, loans, physicalAssets), 9149875);
assert.equal(calc.exposureRatio(9160000, 9200000).toFixed(2), '99.57');
assert.equal(calc.dailyInterest(loans[0]), 5);
assert.equal(calc.tradeFee(100000, 0.001425), 143);

const pledge = {
  balance: 50000,
  accruedInterest: 0,
  pledgedShares: 1000
};
assert.equal(calc.maintenanceRatio(pledge, { price: 80 }), 160);

const zeroRateLoan = {
  balance: 120000,
  accruedInterest: 0,
  annualRate: 0,
  termMonths: 12
};
assert.equal(calc.estimatedMonthlyPayment(zeroRateLoan), 10000);

const drawdown = calc.maximumDrawdown([
  { total: 100 },
  { total: 120 },
  { total: 90 }
]);
assert.equal(drawdown, -25);

console.log('calculations: all tests passed');
