import { valuationInputSchema } from "./valuation-schema";

export function calculateTripuraValuation(raw: unknown) {
  const input = valuationInputSchema.parse(raw);
  const landItems = input.consideredLandClasses.map(item => ({ ...item, value: item.ratePerSqFt === null ? null : round(item.areaSqFt * item.ratePerSqFt) }));
  const landValue = landItems.length && landItems.every((item) => item.value !== null)
    ? round(landItems.reduce((sum, item) => sum + (item.value ?? 0), 0) * input.marketRateAdjustment)
    : null;
  let buildingValue: number | null = null; let building: Record<string, number | string> | null = null;
  if (input.building?.type && input.building.areaSqFt && input.building.ageYears !== null && input.building.replacementRate !== null && input.building.lifeYears !== null) {
    const replacementCost = input.building.areaSqFt * input.building.replacementRate;
    const salvage = (input.building.salvagePercent ?? 10) / 100;
    const depreciable = replacementCost * (1 - salvage);
    const depreciation = Math.min(depreciable, depreciable * (input.building.ageYears / input.building.lifeYears));
    buildingValue = round(replacementCost - depreciation);
    building = { type: input.building.type, replacementCost: round(replacementCost), depreciation: round(depreciation), netValue: buildingValue };
  }
  const requiresBuildingValue = input.building !== null;
  const marketValue = landValue !== null && (!requiresBuildingValue || buildingValue !== null) ? round(landValue + (buildingValue ?? 0)) : null;
  return { landItems, landValue, building, marketValue, realisableValue: marketValue === null ? null : round(marketValue * input.realisableRatio), distressValue: marketValue === null ? null : round(marketValue * input.distressRatio), calculationMethod: "State-rule deterministic market approach" };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
