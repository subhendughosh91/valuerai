insert into public.state_rule_versions (state_code, kind, version, content, status, published_at)
values
('TR', 'EXTRACTION', 1, $rules$
Tripura Extractor Agent - Version 1.0

Extract structured facts only from the submitted documents. Identify sale deed type: buy-sale; partition/bantannama; court probate; or will. Cross-check owner names, District, subdivision, revenue circle, tehsil, mouja, Khatiyan number, CS Sebek Dag number and RS Hal Dag number. Extract choudhi/adjoining owners, boundary measurements, approach road and direction.

For Khatiyan, record owners, all land classes, class-specific areas, ownership shares and MR number. Bastu and Bhiti are normally valuation eligible. Tilla or other classes require an explicit reviewer decision and reason. For building plans, extract owner/address, site area, road direction, plinth/floor areas, approval date and construction age. For sale agreements extract seller, agreement serial/date, e-stamp number, buyer and boundaries.

Area conversion provenance is mandatory: 1 Satak = 1 Decimal; 1 Kani is approximately 40 Satak / 17,424 sq ft; 1 Ganda = 2 Satak / 871.2 sq ft. RS Hal 113/224 means mother Hal 113 and bata 224. Flag contradictions; do not silently reconcile them.
$rules$, 'PUBLISHED', now()),
('TR', 'VALUATION', 1, $rules$
Tripura Valuation Agent - Version 1.0

Use only approved extraction data and the published Land Rules. Narrative output must not invent data. Monetary arithmetic is calculated by deterministic code, never by the model. Render all unavailable report fields as N/A. Build values require explicit confirmed building inputs. Default reference values: RCC life 80 years / Rs. 2,400-2,800 per sq ft; load-bearing life 60 years / Rs. 2,000-2,300 per sq ft; semi-permanent, CGI or shed life 40 years / Rs. 1,000-1,600 per sq ft; use straight-line depreciation with a 10% salvage value only when approved.
$rules$, 'PUBLISHED', now()),
('TR', 'LAND', 1, $rules$
Tripura Shared Land Rules - Version 1.0

Bastu and Bhiti land are normally considered for valuation. Tilla and other land classes may be considered only with a stated rationale. Retain recorded units and exact conversion calculations. Verify road access, boundaries, owner names and dag numbers across deed, Khatiyan, plan and agreement before valuation.
$rules$, 'PUBLISHED', now());
