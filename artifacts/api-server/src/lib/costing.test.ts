import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeMarginStatus,
  laborCostPerUnit,
  overheadCostPerUnit,
  meteredCostPerUnit,
  computeCogs,
  type ProductionInputs,
} from "./costing.ts";

// 100 cartons x 10 units = 1000 units/day, 20 days = 20,000 units/month
const prod: ProductionInputs = { unitsPerDay: 100, cartonSize: 10, shiftHours: 8, productionDaysPerMonth: 20 };

test("margin status thresholds", () => {
  assert.equal(computeMarginStatus(null), "unknown");
  assert.equal(computeMarginStatus(0.3), "healthy");
  assert.equal(computeMarginStatus(0.25), "review");
  assert.equal(computeMarginStatus(0.1), "review");
  assert.equal(computeMarginStatus(0.0999), "critical");
  assert.equal(computeMarginStatus(-0.5), "critical");
});

test("labor: hourly worker with oncost", () => {
  // 50/h * 1.25 * 8h = 500/day over 1000 units
  const v = laborCostPerUnit(prod, [{ payType: "hourly", hourlyWage: 50, monthlySalary: null, oncostPercent: 25 }]);
  assert.equal(v, 0.5);
});

test("labor: monthly salary spread over production days", () => {
  // 20,000 * 1.0 / 20 days = 1000/day over 1000 units
  const v = laborCostPerUnit(prod, [{ payType: "monthly", hourlyWage: 0, monthlySalary: 20000, oncostPercent: 0 }]);
  assert.equal(v, 1);
});

test("labor: monthly worker without salary falls back to hourly", () => {
  const v = laborCostPerUnit(prod, [{ payType: "monthly", hourlyWage: 100, monthlySalary: null, oncostPercent: 0 }]);
  assert.equal(v, 0.8);
});

test("labor: null when no output or no members", () => {
  assert.equal(laborCostPerUnit({ ...prod, unitsPerDay: null }, [{ payType: "hourly", hourlyWage: 50, monthlySalary: null, oncostPercent: 0 }]), null);
  assert.equal(laborCostPerUnit(prod, []), null);
});

test("overhead: annual items divided by 12", () => {
  // 10,000 monthly + 120,000/12 annual = 20,000 over 20,000 units
  const v = overheadCostPerUnit(prod, [
    { monthlyAmount: 10000, frequency: "monthly" },
    { monthlyAmount: 120000, frequency: "annual" },
  ]);
  assert.equal(v, 1);
});

test("overhead: null when nothing to spread", () => {
  assert.equal(overheadCostPerUnit(prod, []), null);
  assert.equal(overheadCostPerUnit(prod, [{ monthlyAmount: 0, frequency: "monthly" }]), null);
});

test("metered: per-unit usage wins over monthly bill", () => {
  assert.equal(meteredCostPerUnit(prod, 0.5, 4, 99999), 2);
  assert.equal(meteredCostPerUnit(prod, 0.5, null, 99999), null);
  assert.equal(meteredCostPerUnit(prod, null, null, 2000), 0.1);
  assert.equal(meteredCostPerUnit(prod, null, null, null), null);
  assert.equal(meteredCostPerUnit({ ...prod, unitsPerDay: null }, 0.5, 4, null), null);
});

test("cogs: materials plus per-unit costs, margin on sell price", () => {
  const r = computeCogs({
    materialLines: [{ unitPrice: 10, quantityPerUnit: 2 }, { unitPrice: 5, quantityPerUnit: 1 }],
    perUnitCosts: [3, null, 2],
    sellPrice: 50,
  });
  assert.equal(r.totalCogs, 30);
  assert.equal(r.grossMargin, 0.4);
});

test("cogs: any unpriced material makes cogs unknown", () => {
  const r = computeCogs({ materialLines: [{ unitPrice: null, quantityPerUnit: 1 }], perUnitCosts: [5], sellPrice: 50 });
  assert.deepEqual(r, { totalCogs: null, grossMargin: null });
});

test("cogs: empty sku is unknown; zero sell price has no margin", () => {
  assert.deepEqual(computeCogs({ materialLines: [], perUnitCosts: [null], sellPrice: 50 }), { totalCogs: null, grossMargin: null });
  assert.deepEqual(computeCogs({ materialLines: [], perUnitCosts: [4], sellPrice: 0 }), { totalCogs: 4, grossMargin: null });
});
