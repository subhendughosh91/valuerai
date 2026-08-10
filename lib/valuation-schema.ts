import { z } from "zod";

export { extractionSchema } from "./extraction-contract";
export type { MinimumExtractionResult as ExtractedValuation } from "./extraction-contract";

export const documentKinds = ["SALE_DEED", "KHATIYAN", "BUILDING_PLAN", "SALE_AGREEMENT", "RS_HAL_DAG_MAP", "GOVT_GUIDELINE_RATE", "ELECTRICITY_BILL", "MUNICIPAL_TAX", "KYC", "SITE_INSPECTION_REPORT", "OTHER"] as const;

export const valuationInputSchema = z.object({
  consideredLandClasses: z.array(z.object({ name: z.string(), areaSqFt: z.number().nonnegative(), ratePerSqFt: z.number().nonnegative().nullable() })),
  building: z.object({ type: z.enum(["RCC", "LOAD_BEARING", "SEMI_PERMANENT"]).nullable(), areaSqFt: z.number().nonnegative().nullable(), ageYears: z.number().nonnegative().nullable(), replacementRate: z.number().nonnegative().nullable(), lifeYears: z.number().positive().nullable(), salvagePercent: z.number().min(0).max(100).nullable() }).nullable(),
  marketRateAdjustment: z.number().min(0).default(1), realisableRatio: z.number().min(0).max(1).default(.9), distressRatio: z.number().min(0).max(1).default(.75)
});

export const valuationAgentSchema = valuationInputSchema.extend({ comments: z.array(z.string()).default([]) });
export type ValuationAgentOutput = z.infer<typeof valuationAgentSchema>;
