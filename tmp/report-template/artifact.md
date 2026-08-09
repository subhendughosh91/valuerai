# SBI-style report evidence contract

## Reference evidence

- Retained DOCX: `C:\Codex\ValuerAI\AI Valuation Tripura.docx`
- DOCX SHA-256: `c6b4f384bb7f8e352afe3c01f96d274c232830b6eba92be059a04b4300de9b6f`
- DOCX purpose: state extraction and valuation guidance, not the visual report template.
- Visual reference: `C:\Codex\ValuerAI\Sample Valuation Report.pdf`, 11 letter-sized portrait pages, rendered to `tmp/report-template/sample-01.png` through `sample-11.png` at 110 DPI.
- DOCX section evidence: one A4 portrait section, margins 1.00in/1.00in/1.00in/0.69in. Its contents remain unmodified.

## Report structure retained in ValuerAI output

1. Cover and valuation certificate with assignment reference, date, property, owner, and value summary.
2. Annexure XIV style report tables for customer, property, documents, location, legal particulars, physical details, dimensions, occupancy, construction, violations, and areas.
3. Land, building, additional-item, amenity, miscellaneous, and services valuation tables, including explicit `N/A` fallbacks.
4. Abstract, remarks, market/realisable/distress summary, disclaimer, valuer signature block.
5. Indicative key plan, clearly marked not to scale, generated only from approved location, boundary, road, and identifier data. It is not an official map.
6. Photograph and evidence annexure placeholders; source documents remain private and are not embedded automatically.

## Layout contract

- Letter portrait pages, 0.55in side margins, 0.50in top/bottom margins, compact 8-10pt table typography.
- A small repeating header: `Valuation Report | ValuerAI`; footer has reference number and page number.
- Use black/grey ruled tables with muted blue section fills; blue report headings. Do not copy the source valuer's name, signature, watermark, contact information, or photography.
- Tables may flow to a new page; do not alter source documents or fabricate data. Every unavailable factual field must render as `N/A`.

## Editable data slots

- User/borrower, owner, reference, date, locality, document identifiers, boundaries, road, land classes, building details, calculation output, comments, and evidence are populated only from approved valuation data.
- Building calculations remain `N/A` where required calculation inputs are absent.
- No jurisdiction name is hardcoded in public report branding. The approved locality may naturally contain a state where supplied.

## Fidelity gates

- Generated document must retain the report section order and table-first presentation visible in the supplied SBI-style example.
- Render every generated page and inspect for clipped headers, overflow, broken tables, or missing values before delivery.
