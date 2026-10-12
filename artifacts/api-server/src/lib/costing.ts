// Pure cost math: no DB access, so it is unit-testable (costing.test.ts).
// kostr.ts loads rows from the DB and passes them here.

export interface ProductionInputs {
  unitsPerDay: number | null;
  cartonSize: number;
  shiftHours: number;
  productionDaysPerMonth: number;
}

export interface LaborMember {
  payType: string | null;
  hourlyWage: number;
  monthlySalary: number | null;
  oncostPercent: number;
}

export interface OverheadItem {
  monthlyAmount: number;
  frequency: string | null;
}

export function computeMarginStatus(grossMargin: number | null): "healthy" | "review" | "critical" | "unknown" {
  if (grossMargin === null) return "unknown";
  if (grossMargin > 0.25) return "healthy";
  if (grossMargin >= 0.10) return "review";
  return "critical";
}

export function unitsPerDay(p: ProductionInputs): number {
  return (p.unitsPerDay ?? 0) * (p.cartonSize || 1);
}

export function unitsPerMonth(p: ProductionInputs): number {
  return unitsPerDay(p) * p.productionDaysPerMonth;
}

export function laborCostPerUnit(p: ProductionInputs, members: LaborMember[]): number | null {
  const dayUnits = unitsPerDay(p);
  if (dayUnits === 0 || members.length === 0) return null;

  let total = 0;
  for (const m of members) {
    const loaded = 1 + m.oncostPercent / 100;
    if ((m.payType ?? "hourly") === "monthly" && m.monthlySalary) {
      total += (m.monthlySalary * loaded) / p.productionDaysPerMonth / dayUnits;
    } else {
      total += (m.hourlyWage * loaded * p.shiftHours) / dayUnits;
    }
  }
  return total;
}

export function overheadCostPerUnit(p: ProductionInputs, items: OverheadItem[]): number | null {
  const monthUnits = unitsPerMonth(p);
  if (monthUnits === 0 || items.length === 0) return null;
  const totalMonthly = items.reduce(
    (sum, i) => sum + (i.frequency === "annual" ? i.monthlyAmount / 12 : i.monthlyAmount),
    0,
  );
  if (totalMonthly === 0) return null;
  return totalMonthly / monthUnits;
}

// Utilities and water: metered per unit if set, else a monthly bill spread over monthly output.
export function meteredCostPerUnit(
  p: ProductionInputs,
  usagePerUnit: number | null,
  ratePerUsage: number | null,
  monthlyBill: number | null,
): number | null {
  if (!p.unitsPerDay) return null;
  if (usagePerUnit != null) return ratePerUsage == null ? null : usagePerUnit * ratePerUsage;
  if (!monthlyBill) return null;
  const monthUnits = unitsPerMonth(p);
  return monthUnits === 0 ? null : monthlyBill / monthUnits;
}

// Material lines carry a unit price; null price means "unknown", which makes the whole COGS unknown.
export interface CogsInputs {
  materialLines: { unitPrice: number | null; quantityPerUnit: number }[];
  perUnitCosts: (number | null)[];
  sellPrice: number;
}

export function computeCogs({ materialLines, perUnitCosts, sellPrice }: CogsInputs): {
  totalCogs: number | null;
  grossMargin: number | null;
} {
  if (materialLines.length === 0 && perUnitCosts.every((c) => c === null)) {
    return { totalCogs: null, grossMargin: null };
  }
  let totalCogs = 0;
  for (const line of materialLines) {
    if (line.unitPrice === null) return { totalCogs: null, grossMargin: null };
    totalCogs += line.unitPrice * line.quantityPerUnit;
  }
  for (const c of perUnitCosts) if (c !== null) totalCogs += c;

  if (sellPrice === 0) return { totalCogs, grossMargin: null };
  return { totalCogs, grossMargin: (sellPrice - totalCogs) / sellPrice };
}
