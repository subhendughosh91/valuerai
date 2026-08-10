# ValuerAI Admin - Extraction Engine RAG Addendum

Paste the instruction block below into the applicable state's **Extraction Engine** instructions. Keep the state's legal, land-class, and area-conversion rules in **Land Rules** so the Extraction and Valuation Engines use the same published authority.

## Ready-to-paste instruction block

```text
MINIMUM SOURCE-DOCUMENT EXTRACTION CONTRACT

Objective
Extract the minimum source-backed factual dataset required for a bank property-valuation report for land, plotted property, or land with a building. Attempt every field defined by the application's extraction contract irrespective of which document categories are uploaded. The application schema, not this RAG text, controls the field names and form layout.

Evidence and missing-data rules
1. Extract only information present in an uploaded document or expressly supplied in the user's Custom Instructions.
2. Never guess, infer, calculate, or complete an unavailable factual value. Return null when information is not found.
3. Preserve legal identifiers and dates exactly as written, including deed, agreement, registration, e-stamp/certificate, Khatiyan, mutation/MR, RS/Hal, bata, CS/Sebek, and Dag numbers.
4. For every non-null field, record the source document type and filename, source page or section when available, confidence as HIGH/MEDIUM/LOW, and a concise extraction remark where clarification is needed.
5. If different documents contain different values for the same field, retain the best-supported value as the primary value, retain every other source-backed value as an alternative, and create a validation warning naming the documents and conflicting values. Never silently reconcile a conflict.
6. Populate source trace for every primary and alternative source-backed value.
7. A value supplied only through Custom Instructions must identify its source as "User custom instruction", use LOW confidence, and state that documentary confirmation is required. Custom Instructions cannot silently override documentary evidence or published rules.
8. Photographs and maps are supporting evidence only. Do not infer legal ownership, title, or statutory approval from a photograph, physical occupation, or a visible building.

Document-specific extraction
- Bank documents: bank/branch details, borrower/customer, loan or application reference, purpose, mortgage/security purpose, appointing authority, dates, required format, special instructions, agreement value, and whether building value is to be included.
- Sale or registered deed: deed type/number/date, registration office, seller/previous owner, buyer/current owner, land owner, full property hierarchy and address, Khatiyan and plot identifiers, land class and each class-wise area, boundaries, road access, land use, consideration/book value, and adjoining owners.
- Sale agreement: number/date, seller, buyer, value, property identifiers, class-wise area, boundaries, possession clause, and payment terms.
- Registration or stamp certificate: certificate/e-stamp and registration identifiers/dates, deed references, named parties, property reference, stamp-duty value, government market value, and consideration value.
- Khatiyan or revenue record: Khatiyan, recorded owner/possessor, location hierarchy, RS/Hal/bata/CS/Sebek/Dag identifiers, each land classification and area, ownership share, and mutation/MR reference.
- Building or layout plan: availability, plan and approval identifiers/dates/authority, approved use/property type, site/built-up/plinth/carpet areas, floors and floor-wise areas, dimensions, setbacks, and road width.
- Construction permission: availability, permission number/date/authority, approved use/floors/structure, validity, conditions, and restrictions. Do not infer permission from the existence of a building.
- Occupation or completion permission: availability, certificate identifiers/date/authority, approved occupancy use, and completion status. Do not infer permission from physical occupation.
- Site inspection: inspection date/persons, observed address and coordinates, landmark/access/road, plot type, actual dimensions and site area, site boundaries, boundary-match and demarcation status, observed use, occupancy, and violations.
- Building inspection: existence/type/structure/roof/stage/completion, age/residual age, floors/rooms, built-up/plinth/carpet areas, and available services.
- Photographs and maps: availability of front/internal/road/boundary photos, Google Map/key plan, coordinates, landmarks, date/time, and geotag.
- Market and guideline documents: guideline rate/value/source, market-rate range, adopted rate if expressly stated, comparable transactions, local enquiry, trends, infrastructure/proximity, appreciation notes, and justification for rate variation.

Cross-document validation
Compare and warn on differences in:
- owner, seller, buyer, borrower, and customer names;
- property address and administrative hierarchy;
- Khatiyan, RS/Hal/bata, CS/Sebek, and Dag/plot numbers;
- each land classification and class-wise area;
- deed, Khatiyan, agreement, plan, and site-measured total areas;
- deed, agreement, plan, and site boundaries/dimensions;
- approach-road attachment, side, direction, and access;
- plan, construction permission, occupation/completion permission, and observed building;
- agreement, deed consideration, stamp, government-market, guideline, and adopted-rate values.

Area handling
1. Preserve every original area value and unit exactly as written.
2. Normalise to square feet only when a published Land Rule supplies an unambiguous conversion applicable to the source unit.
3. Record the conversion basis in remarks and retain the original value/unit.
4. When documents or published rules contain conflicting conversion factors, do not choose one. Leave the normalised value null and create a HIGH-severity validation warning for Admin/valuer review.
5. Keep every land class and its corresponding area separately. Do not combine Bastu, Bhiti, Tilla, or another class into one undifferentiated area.

Report-critical missing fields
Always check and list unavailable report-critical fields, including land owner name, deed number/date, Khatiyan number, RS/Hal and bata number, CS/Sebek/Dag number, property location, every land class and area, boundaries/dimensions, approach road, and the area proposed for valuation. Missing fields do not block the editable review form.

Calculated-field boundary
The Extraction Engine must not calculate land value, replacement cost, depreciation, net building value, total property value, rounded market value, realisable value, distress value, or value in words. It may copy a directly evidenced rate or value into an input field with provenance. Final arithmetic belongs to deterministic valuation code after user approval.
```

## Required Admin action before publishing

Resolve any inconsistent state area-conversion instructions in the current Land Rules. In particular, do not simultaneously publish different square-foot values for one Ganda. Until one authoritative factor is selected, the Extraction Engine is instructed to leave the converted value blank and raise a high-severity warning.
