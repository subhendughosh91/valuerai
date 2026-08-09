export const TRIPURA_EXTRACTION_RULES = `Tripura Extractor Agent - Version 1.0

Sale deed: identify whether buy-sale, partition/bantannama, court probate or will deed; match owner, district, subdivision, revenue circle, tehsil, mouja, Khatiyan, CS Sebek Dag and RS Hal Dag. Extract choudhi/adjoining owners, measurements, approach road and direction. Verify land class and that road attaches to the valued property.

Khatiyan: match owners and locality identifiers across documents; extract all land classes, total areas, ownership shares and MR number. Prefer Bastu and Bhiti for valuation; Tilla or another class requires explicit confirmation.

Building plan: verify owner/address, site area, road direction, plinth area and construction age. Municipality, Gram Panchayat and industrial plans have different evidence completeness.

Sale agreement: match seller, property identifiers, choudhi, boundaries, road direction, land class, agreement serial/date, e-stamp and buyer.

Conversions: 1 Satak = 1 Decimal; 1 Kani is approximately 40 Satak / 17,424 sq ft; 1 Ganda = 2 Satak / 871.2 sq ft. Example: .040 Satak / .02 = 2 Ganda x 864 = 1,728 sq ft. RS Hal 113/224 means mother Hal 113 and bata 224.`;

export const TRIPURA_VALUATION_RULES = `Tripura Valuation Agent - Version 1.0

Use only user-approved extraction data and shared land rules. Calculate land values deterministically from considered area x adopted rate. Apply market, realisable and distress values as configured by the administrator. Missing inputs must be shown as N/A, never inferred. Building defaults: RCC life 80 years, replacement rate Rs. 2,400-2,800/sq ft; load-bearing life 60 years, Rs. 2,000-2,300/sq ft; semi-permanent/CGI/shed life 40 years, Rs. 1,000-1,600/sq ft. Use straight-line depreciation and 10% salvage only after user/admin confirmation.`;

export const TRIPURA_LAND_RULES = `Shared Land Rules - Tripura

Bastu and Bhiti land are normally considered for valuation. Tilla and other land classes may be considered only with an explicit rationale. Retain original recorded unit and conversion provenance. Confirm roads, boundaries, owner names and dag numbers across deed, Khatiyan, plan and agreement before valuation.`;

export const INDIA_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];
