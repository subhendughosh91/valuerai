import { valuationInputSchema } from "./valuation-schema";

export function calculateTripuraValuation(raw: unknown) {
  const input = valuationInputSchema.parse(raw);
  const landItems = input.consideredLandClasses.map(item => ({ ...item, value: round(item.areaSqFt * item.ratePerSqFt) }));
  const landValue = round(landItems.reduce((sum, item) => sum + item.value, 0) * input.marketRateAdjustment);
  let buildingValue = 0; let building: Record<string, number | string> | null = null;
  if (input.building?.type && input.building.areaSqFt && input.building.ageYears !== undefined && input.building.replacementRate && input.building.lifeYears) {
    const replacementCost = input.building.areaSqFt * input.building.replacementRate;
    const salvage = (input.building.salvagePercent ?? 10) / 100;
    const depreciable = replacementCost * (1 - salvage);
    const depreciation = Math.min(depreciable, depreciable * (input.building.ageYears / input.building.lifeYears));
    buildingValue = round(replacementCost - depreciation);
    building = { type: input.building.type, replacementCost: round(replacementCost), depreciation: round(depreciation), netValue: buildingValue };
  }
  const marketValue = round(landValue + buildingValue);
  return { landItems, landValue, building, marketValue, realisableValue: round(marketValue * input.realisableRatio), distressValue: round(marketValue * input.distressRatio), calculationMethod: "Tripura v1 deterministic market approach" };
}
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
