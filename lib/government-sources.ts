export type GovernmentSource = { name: string; url: string; mode: "MANUAL" | "AUTOMATED" | "BOTH"; automatedStatus: "NOT_CONFIGURED" | "AVAILABLE" | "UNAVAILABLE" };

export const tripuraGovernmentSources: GovernmentSource[] = [
  { name: "NGDRS Tripura guideline rate", url: "https://ngdrs.tripura.gov.in/NGDRS_TR/", mode: "BOTH", automatedStatus: "NOT_CONFIGURED" },
  { name: "Tripura Khatiyan search", url: "https://jami.tripura.gov.in/EODB/citizen_search.aspx", mode: "BOTH", automatedStatus: "NOT_CONFIGURED" },
  { name: "Tripura BhuNaksha map", url: "https://bhunaksha.tripura.gov.in", mode: "BOTH", automatedStatus: "NOT_CONFIGURED" }
];

export async function retrieveGovernmentData(source: GovernmentSource, query: Record<string, string>) {
  // A connector must be implemented only after the source exposes a permitted API or written access approval.
  // This explicit fallback prevents the product from silently scraping government portals.
  return { source: source.name, query, status: "MANUAL_REQUIRED" as const, manualUrl: source.url, retrievedAt: new Date().toISOString() };
}
