export type Role = "USER" | "ADMIN";
export type Stage = "dashboard" | "new" | "review" | "report" | "admin";
export type ValuationStatus = "Draft" | "Awaiting confirmation" | "Valued";

export type LandClass = { name: string; areaSqFt: string; considered: boolean };
export type ExtractedData = {
  owner: string; khatiyanNo: string; rsHalNo: string; csHalNo: string;
  district: string; subdivision: string; revenueCircle: string; tehsil: string; mouja: string;
  approachRoad: string; saleDeedNo: string; saleDeedDate: string; deedValue: string;
  landClasses: LandClass[]; consideredArea: string; comments: string;
};

export type Valuation = {
  id: string; property: string; createdAt: string; updatedAt: string; status: ValuationStatus;
  reportReady: boolean; data: ExtractedData;
};
