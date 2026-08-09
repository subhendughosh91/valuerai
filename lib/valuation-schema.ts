import { z } from "zod";

export const documentKinds = ["SALE_DEED", "KHATIYAN", "BUILDING_PLAN", "SALE_AGREEMENT", "RS_HAL_DAG_MAP", "GOVT_GUIDELINE_RATE", "ELECTRICITY_BILL", "MUNICIPAL_TAX", "KYC", "OTHER"] as const;
export const extractionSchema = z.object({
  ownerNames: z.array(z.string()).default([]), khatiyanNumber: z.string().nullable().default(null), rsHal: z.object({ mother: z.string().nullable().default(null), bata: z.string().nullable().default(null), raw: z.string().nullable().default(null) }).default({}), csHalNumber: z.string().nullable().default(null),
  locality: z.object({ district: z.string().nullable().default(null), subdivision: z.string().nullable().default(null), revenueCircle: z.string().nullable().default(null), tehsil: z.string().nullable().default(null), mouja: z.string().nullable().default(null) }).default({}),
  deeds: z.array(z.object({ number: z.string().nullable().default(null), date: z.string().nullable().default(null), amount: z.number().nullable().default(null), type: z.string().nullable().default(null), adjoiningOwners: z.array(z.string()).default([]) })).default([]),
  landClasses: z.array(z.object({ name: z.string(), areaSqFt: z.number().nullable().default(null), sourceUnit: z.string().nullable().default(null), sourceValue: z.string().nullable().default(null), considered: z.boolean().default(false) })).default([]),
  approachRoad: z.object({ side: z.string().nullable().default(null), direction: z.string().nullable().default(null), attached: z.boolean().nullable().default(null) }).default({}),
  building: z.object({ type: z.string().nullable().default(null), plinthAreaSqFt: z.number().nullable().default(null), ageYears: z.number().nullable().default(null), approvedPlanAvailable: z.boolean().nullable().default(null) }).default({}),
  agreement: z.object({ serialNumber: z.string().nullable().default(null), date: z.string().nullable().default(null), eStampNumber: z.string().nullable().default(null), buyerName: z.string().nullable().default(null) }).default({}),
  evidence: z.array(z.object({ field: z.string(), documentId: z.string(), excerpt: z.string(), confidence: z.enum(["HIGH", "MEDIUM", "LOW"]) })).default([]),
  contradictions: z.array(z.object({ field: z.string(), description: z.string(), documentIds: z.array(z.string()) })).default([]),
  comments: z.array(z.string()).default([])
});
export type ExtractedValuation = z.infer<typeof extractionSchema>;

export const valuationInputSchema = z.object({
  consideredLandClasses: z.array(z.object({ name: z.string(), areaSqFt: z.number().nonnegative(), ratePerSqFt: z.number().nonnegative() })),
  building: z.object({ type: z.enum(["RCC", "LOAD_BEARING", "SEMI_PERMANENT"]).optional(), areaSqFt: z.number().nonnegative().optional(), ageYears: z.number().nonnegative().optional(), replacementRate: z.number().nonnegative().optional(), lifeYears: z.number().positive().optional(), salvagePercent: z.number().min(0).max(100).optional() }).optional(),
  marketRateAdjustment: z.number().min(0).default(1), realisableRatio: z.number().min(0).max(1).default(.9), distressRatio: z.number().min(0).max(1).default(.75)
});
