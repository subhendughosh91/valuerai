import { z } from "zod";

export type ExtractionFieldKind = "text" | "number" | "boolean" | "long_text";

type FieldDefinition = { key: string; label: string; kind?: ExtractionFieldKind; hint?: string };
type GroupDefinition = { key: string; label: string; description: string; fields: readonly FieldDefinition[] };

export const EXTRACTION_GROUPS: readonly GroupDefinition[] = [
  {
    key: "bank_details",
    label: "Bank and assignment details",
    description: "Instructions and borrower information supplied by the appointing bank or lender.",
    fields: [
      { key: "bank_name", label: "Bank name" }, { key: "branch_name", label: "Branch name" }, { key: "branch_address", label: "Branch address", kind: "long_text" },
      { key: "borrower_name", label: "Borrower name" }, { key: "customer_name", label: "Customer name" }, { key: "loan_account_or_application_number", label: "Loan account / application number" },
      { key: "purpose_of_valuation", label: "Purpose of valuation" }, { key: "mortgage_purpose", label: "Mortgage / security purpose" }, { key: "appointing_authority", label: "Appointing authority" },
      { key: "bank_official_name", label: "Bank official name" }, { key: "valuation_request_date", label: "Valuation request date" }, { key: "date_of_appointment", label: "Date of appointment" },
      { key: "report_required_format", label: "Required report format" }, { key: "special_bank_instruction", label: "Special bank instructions", kind: "long_text" },
      { key: "whether_building_value_to_be_considered", label: "Include building value", kind: "boolean" }, { key: "agreement_value_if_available", label: "Agreement value", kind: "number" },
    ],
  },
  {
    key: "parties",
    label: "Parties and ownership",
    description: "Names and roles of owners, sellers, buyers, borrowers, occupiers, and document parties.",
    fields: [
      { key: "seller_or_previous_owner_name", label: "Seller / previous owner name" }, { key: "buyer_or_current_owner_name", label: "Buyer / current owner name" },
      { key: "land_owner_name", label: "Land owner name" }, { key: "agreement_seller_name", label: "Agreement seller name" }, { key: "agreement_buyer_name", label: "Agreement buyer name" },
      { key: "owner_or_recorded_possessor_name", label: "Recorded owner / possessor name" }, { key: "parties_named_in_certificate", label: "Parties named in certificate", kind: "long_text" },
      { key: "inspected_by", label: "Inspected by" }, { key: "property_identified_by", label: "Property identified by" }, { key: "occupied_by", label: "Occupied by" },
      { key: "relationship_of_occupier_to_owner", label: "Occupier relationship to owner" },
    ],
  },
  {
    key: "property_location",
    label: "Property location",
    description: "Documented and observed address, administrative jurisdiction, coordinates, and landmarks.",
    fields: [
      { key: "property_address", label: "Property address", kind: "long_text" }, { key: "agreement_property_address", label: "Property address in agreement", kind: "long_text" },
      { key: "full_property_address_as_seen", label: "Address observed during inspection", kind: "long_text" }, { key: "mouja", label: "Mouja" }, { key: "tehsil", label: "Tehsil" },
      { key: "revenue_circle", label: "Revenue circle" }, { key: "subdivision", label: "Subdivision" }, { key: "district", label: "District" }, { key: "state", label: "State" },
      { key: "police_station", label: "Police station" }, { key: "post_office", label: "Post office" }, { key: "pin_code", label: "PIN code" },
      { key: "latitude", label: "Latitude", kind: "number" }, { key: "longitude", label: "Longitude", kind: "number" }, { key: "nearby_landmark", label: "Nearby landmark" },
    ],
  },
  {
    key: "legal_documents",
    label: "Legal and registration documents",
    description: "Deed, sale-agreement, registration, stamp, and certificate identifiers preserved as written.",
    fields: [
      { key: "deed_type", label: "Deed type" }, { key: "deed_number", label: "Deed number(s)", hint: "Separate multiple deeds with semicolons." }, { key: "deed_date", label: "Deed date(s)", hint: "Separate multiple dates with semicolons in the same order." },
      { key: "registration_office", label: "Registration office" }, { key: "agreement_number_or_serial_number", label: "Agreement number / serial number" }, { key: "agreement_date", label: "Agreement date" },
      { key: "agreement_value", label: "Agreement value", kind: "number" }, { key: "possession_clause_if_present", label: "Possession clause", kind: "long_text" }, { key: "sale_consideration_payment_terms_if_present", label: "Sale-consideration payment terms", kind: "long_text" },
      { key: "certificate_number", label: "Certificate / e-stamp number" }, { key: "registration_number", label: "Registration number" }, { key: "registration_date", label: "Registration date" },
      { key: "deed_reference_number", label: "Deed reference number" }, { key: "deed_reference_date", label: "Deed reference date" }, { key: "property_reference", label: "Property reference" },
      { key: "stamp_duty_value_if_present", label: "Stamp-duty value", kind: "number" }, { key: "government_market_value_if_present", label: "Government market value", kind: "number" },
      { key: "consideration_value_if_present", label: "Consideration / book value", kind: "number" },
    ],
  },
  {
    key: "revenue_records",
    label: "Revenue records and plot identifiers",
    description: "Khatiyan, mutation, share, and plot identifiers from land and revenue records.",
    fields: [
      { key: "khatian_number", label: "Khatiyan number" }, { key: "rs_plot_number", label: "RS plot / Hal number" }, { key: "rs_hal_mother_number", label: "RS Hal mother number" },
      { key: "rs_hal_bata_number", label: "RS Hal bata number" }, { key: "cs_plot_number", label: "CS / Sebek Dag number" }, { key: "hal_plot_number", label: "Hal plot number" },
      { key: "dag_number_if_present", label: "Dag number" }, { key: "share_or_portion_if_present", label: "Ownership share / portion" }, { key: "mutation_reference_if_present", label: "Mutation / MR reference" },
      { key: "land_classification_deed", label: "Land classification in deed" }, { key: "land_classification_khatian", label: "Land classification in Khatiyan" },
    ],
  },
  {
    key: "plan_and_permissions",
    label: "Plans and statutory permissions",
    description: "Layout, building plan, construction permission, and occupation or completion certificates.",
    fields: [
      { key: "layout_plan_available", label: "Layout plan available", kind: "boolean" }, { key: "building_plan_available", label: "Building plan available", kind: "boolean" },
      { key: "plan_number", label: "Plan number" }, { key: "plan_date", label: "Plan date" }, { key: "plan_approving_authority_name", label: "Plan approving authority" }, { key: "approval_number", label: "Plan approval number" },
      { key: "approved_land_use", label: "Approved land use" }, { key: "approved_property_type", label: "Approved property type" }, { key: "approved_site_area", label: "Approved site area" },
      { key: "approved_built_up_area", label: "Approved built-up area" }, { key: "approved_plinth_area", label: "Approved plinth area" }, { key: "approved_carpet_area", label: "Approved carpet area" },
      { key: "approved_number_of_floors", label: "Approved number of floors", kind: "number" }, { key: "approved_floorwise_area_details", label: "Approved floor-wise areas", kind: "long_text" },
      { key: "approved_dimensions_north", label: "Approved north dimension" }, { key: "approved_dimensions_south", label: "Approved south dimension" },
      { key: "approved_dimensions_east", label: "Approved east dimension" }, { key: "approved_dimensions_west", label: "Approved west dimension" },
      { key: "setback_details_if_present", label: "Setback details", kind: "long_text" }, { key: "road_width_if_present", label: "Road width" },
      { key: "construction_permission_available", label: "Construction permission available", kind: "boolean" }, { key: "permission_number", label: "Construction permission number" },
      { key: "permission_date", label: "Construction permission date" }, { key: "construction_approving_authority_name", label: "Construction approving authority" },
      { key: "approved_use", label: "Construction approved use" }, { key: "approved_floors", label: "Construction approved floors" }, { key: "approved_structure_type", label: "Approved structure type" },
      { key: "validity_period_if_present", label: "Permission validity period" }, { key: "conditions_or_restrictions_if_present", label: "Permission conditions / restrictions", kind: "long_text" },
      { key: "occupation_permission_available", label: "Occupation permission available", kind: "boolean" }, { key: "occupation_certificate_number", label: "Occupation certificate number" },
      { key: "completion_certificate_number", label: "Completion certificate number" }, { key: "certificate_date", label: "Occupation / completion certificate date" },
      { key: "issuing_authority", label: "Certificate issuing authority" }, { key: "approved_occupancy_use", label: "Approved occupancy use" }, { key: "completion_status", label: "Completion status" },
    ],
  },
  {
    key: "boundaries",
    label: "Boundaries, dimensions, and access",
    description: "Deed, agreement, plan, and site-inspection boundaries retained separately for comparison.",
    fields: [
      { key: "boundary_north_deed", label: "North boundary - deed" }, { key: "boundary_south_deed", label: "South boundary - deed" }, { key: "boundary_east_deed", label: "East boundary - deed" }, { key: "boundary_west_deed", label: "West boundary - deed" },
      { key: "boundary_north_agreement", label: "North boundary - agreement" }, { key: "boundary_south_agreement", label: "South boundary - agreement" }, { key: "boundary_east_agreement", label: "East boundary - agreement" }, { key: "boundary_west_agreement", label: "West boundary - agreement" },
      { key: "boundary_north_site", label: "North boundary - site" }, { key: "boundary_south_site", label: "South boundary - site" }, { key: "boundary_east_site", label: "East boundary - site" }, { key: "boundary_west_site", label: "West boundary - site" },
      { key: "actual_dimension_north", label: "Actual north dimension" }, { key: "actual_dimension_south", label: "Actual south dimension" }, { key: "actual_dimension_east", label: "Actual east dimension" }, { key: "actual_dimension_west", label: "Actual west dimension" },
      { key: "boundaries_matching_status", label: "Boundary matching status" }, { key: "plot_demarcated_status", label: "Plot demarcated status" },
      { key: "independent_access_to_property", label: "Independent property access", kind: "boolean" }, { key: "approach_road_description", label: "Approach-road description", kind: "long_text" },
      { key: "approach_road_side_or_direction", label: "Approach-road side / direction" }, { key: "road_access_if_mentioned", label: "Road access stated in documents", kind: "long_text" },
    ],
  },
  {
    key: "land_area_and_dimensions",
    label: "Land area and classification",
    description: "Original area values and normalised square-foot values retained by source.",
    fields: [
      { key: "deed_land_area_original_value", label: "Deed land area - original value" }, { key: "deed_land_area_original_unit", label: "Deed land area - original unit" }, { key: "deed_land_area_sqft", label: "Deed land area - sq ft", kind: "number" },
      { key: "agreement_land_area_original_value", label: "Agreement land area - original value" }, { key: "agreement_land_area_original_unit", label: "Agreement land area - original unit" }, { key: "agreement_land_area_sqft", label: "Agreement land area - sq ft", kind: "number" },
      { key: "khatian_land_area_original_value", label: "Khatiyan land area - original value" }, { key: "khatian_land_area_original_unit", label: "Khatiyan land area - original unit" }, { key: "khatian_land_area_sqft", label: "Khatiyan land area - sq ft", kind: "number" },
      { key: "site_measured_area_original_value", label: "Site-measured area - original value" }, { key: "site_measured_area_original_unit", label: "Site-measured area - original unit" }, { key: "site_measured_area_sqft", label: "Site-measured area - sq ft", kind: "number" },
      { key: "land_classes_and_areas", label: "All land classes and corresponding areas", kind: "long_text", hint: "Use one entry per line, for example: Bastu - 1000 sq ft." },
      { key: "valuation_eligible_land_classes", label: "Classes proposed for valuation", kind: "long_text" }, { key: "land_use_if_mentioned", label: "Land use stated in documents" },
      { key: "property_type_plotted_or_flat", label: "Property type - plotted / flat" },
    ],
  },
  {
    key: "building_details",
    label: "Building inspection details",
    description: "Observed structure, condition, age, floor configuration, areas, and completion data.",
    fields: [
      { key: "building_exists", label: "Building exists", kind: "boolean" }, { key: "building_identifier", label: "Building identifier" }, { key: "type_of_building", label: "Type of building" },
      { key: "structure_type", label: "Structure type" }, { key: "roofing_type", label: "Roofing type" }, { key: "stage_of_construction", label: "Stage of construction" },
      { key: "percentage_completion", label: "Percentage completion", kind: "number" }, { key: "approximate_age_of_building", label: "Approximate building age (years)", kind: "number" },
      { key: "residual_age_of_building", label: "Residual building age (years)", kind: "number" }, { key: "total_number_of_floors", label: "Total number of floors", kind: "number" },
      { key: "floor_on_which_property_is_located", label: "Property floor" }, { key: "number_of_rooms", label: "Number of rooms", kind: "number" },
      { key: "living_dining_count", label: "Living / dining count", kind: "number" }, { key: "bedroom_count", label: "Bedroom count", kind: "number" },
      { key: "toilet_count", label: "Toilet count", kind: "number" }, { key: "kitchen_count", label: "Kitchen count", kind: "number" },
      { key: "built_up_area_sqft", label: "Built-up area (sq ft)", kind: "number" }, { key: "plinth_area_sqft", label: "Plinth area (sq ft)", kind: "number" },
      { key: "carpet_area_sqft", label: "Carpet area (sq ft)", kind: "number" },
    ],
  },
  {
    key: "occupancy_and_violations",
    label: "Occupancy and violations",
    description: "Observed occupancy, possession, use, and deviations requiring review.",
    fields: [
      { key: "inspection_date", label: "Inspection date" }, { key: "approved_land_use_observed_or_reported", label: "Observed / reported land use" }, { key: "occupancy_status", label: "Occupancy status" },
      { key: "number_of_years_occupancy", label: "Years of occupancy", kind: "number" }, { key: "violation_observed", label: "Violation observed", kind: "boolean" },
      { key: "nature_of_violation", label: "Nature of violation", kind: "long_text" }, { key: "extent_of_violation", label: "Extent of violation", kind: "long_text" },
    ],
  },
  {
    key: "amenities_and_services",
    label: "Amenities and services",
    description: "Available building services and site amenities observed or documented.",
    fields: [
      { key: "drainage_available", label: "Drainage available", kind: "boolean" }, { key: "compound_wall_available", label: "Compound wall available", kind: "boolean" },
      { key: "electrical_installation_available", label: "Electrical installation available", kind: "boolean" }, { key: "plumbing_installation_available", label: "Plumbing installation available", kind: "boolean" },
      { key: "water_supply_available", label: "Water supply available", kind: "boolean" }, { key: "weather_proofing_available", label: "Weather proofing available", kind: "boolean" },
    ],
  },
  {
    key: "photos_and_maps",
    label: "Photographs and maps",
    description: "Availability and location details from photographs, key plans, and map material.",
    fields: [
      { key: "property_front_photo_available", label: "Property-front photo available", kind: "boolean" }, { key: "property_internal_photo_available", label: "Property-internal photo available", kind: "boolean" },
      { key: "approach_road_photo_available", label: "Approach-road photo available", kind: "boolean" }, { key: "boundary_photo_available", label: "Boundary photo available", kind: "boolean" },
      { key: "google_map_screenshot_available", label: "Google Map screenshot available", kind: "boolean" }, { key: "key_plan_available", label: "Key plan available", kind: "boolean" },
      { key: "map_latitude", label: "Map latitude", kind: "number" }, { key: "map_longitude", label: "Map longitude", kind: "number" },
      { key: "visible_landmarks", label: "Visible landmarks", kind: "long_text" }, { key: "photo_date_time_if_available", label: "Photo date / time" }, { key: "geo_tag_if_available", label: "Photo geotag" },
    ],
  },
  {
    key: "market_inputs",
    label: "Market and guideline inputs",
    description: "Government guideline data, comparable transactions, market enquiry, and rate justification.",
    fields: [
      { key: "government_guideline_rate", label: "Government guideline rate", kind: "number" }, { key: "government_guideline_value", label: "Government guideline value", kind: "number" },
      { key: "guideline_rate_source", label: "Guideline-rate source", kind: "long_text" }, { key: "market_rate_min", label: "Minimum market rate", kind: "number" },
      { key: "market_rate_max", label: "Maximum market rate", kind: "number" }, { key: "adopted_land_rate", label: "Adopted land rate", kind: "number" },
      { key: "comparable_transaction_1_details", label: "Comparable transaction 1 details", kind: "long_text" }, { key: "comparable_transaction_1_rate", label: "Comparable transaction 1 rate", kind: "number" },
      { key: "comparable_transaction_2_details", label: "Comparable transaction 2 details", kind: "long_text" }, { key: "comparable_transaction_2_rate", label: "Comparable transaction 2 rate", kind: "number" },
      { key: "local_enquiry_summary", label: "Local enquiry summary", kind: "long_text" }, { key: "market_trend_summary", label: "Market trend summary", kind: "long_text" },
      { key: "infrastructure_development_notes", label: "Infrastructure development notes", kind: "long_text" }, { key: "proximity_to_schools_hospitals_markets", label: "Proximity to schools, hospitals, and markets", kind: "long_text" },
      { key: "future_appreciation_notes", label: "Future appreciation notes", kind: "long_text" }, { key: "justification_for_variation_from_guideline_value", label: "Guideline-rate variation justification", kind: "long_text" },
    ],
  },
  {
    key: "calculated_inputs_ready_for_valuation",
    label: "Inputs ready for the Valuation Engine",
    description: "Reviewed inputs and placeholders used by deterministic valuation calculations. Missing calculated outputs remain blank until valuation runs.",
    fields: [
      { key: "land_area_taken_for_valuation", label: "Land area taken for valuation (sq ft)", kind: "number" }, { key: "adopted_land_rate", label: "Adopted land rate per sq ft", kind: "number" },
      { key: "estimated_land_value", label: "Estimated land value", kind: "number" }, { key: "building_replacement_rate", label: "Building replacement rate", kind: "number" },
      { key: "building_replacement_cost", label: "Building replacement cost", kind: "number" }, { key: "building_depreciation_rate", label: "Building depreciation rate (%)", kind: "number" },
      { key: "building_depreciation_amount", label: "Building depreciation amount", kind: "number" }, { key: "net_building_value_after_depreciation", label: "Net building value after depreciation", kind: "number" },
      { key: "extra_items_value", label: "Extra-items value", kind: "number" }, { key: "amenities_value", label: "Amenities value", kind: "number" },
      { key: "miscellaneous_value", label: "Miscellaneous value", kind: "number" }, { key: "services_value", label: "Services value", kind: "number" },
      { key: "total_property_value", label: "Total property value", kind: "number" }, { key: "rounded_market_value", label: "Rounded market value", kind: "number" },
      { key: "agreement_value", label: "Agreement value", kind: "number" }, { key: "realizable_value", label: "Realisable value", kind: "number" },
      { key: "distress_sale_value", label: "Distress-sale value", kind: "number" }, { key: "value_in_words", label: "Value in words", kind: "long_text" },
    ],
  },
] as const;

const valueSchema = z.union([z.string(), z.number(), z.boolean()]).nullable();
const sourceObservationSchema = z.object({
  value: valueSchema,
  source_document: z.string().nullable(),
  source_page_or_section: z.string().nullable(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).nullable(),
  remarks: z.string().nullable(),
});
const extractedFieldSchema = sourceObservationSchema.extend({ alternative_values: z.array(sourceObservationSchema) });
const groupSchemas = Object.fromEntries(EXTRACTION_GROUPS.map((group) => [group.key, z.object(Object.fromEntries(group.fields.map((field) => [field.key, extractedFieldSchema])))]));

export const extractionSchema = z.object({
  extraction_result: z.object({
    ...groupSchemas,
    validation_warnings: z.array(z.object({ field: z.string(), description: z.string(), severity: z.enum(["INFO", "WARNING", "HIGH"]), source_documents: z.array(z.string()) })),
    missing_required_fields: z.array(z.string()),
    source_trace: z.array(z.object({ field: z.string(), source_document: z.string(), source_page_or_section: z.string().nullable(), confidence: z.enum(["HIGH", "MEDIUM", "LOW"]), remarks: z.string().nullable() })),
  }),
});

export type MinimumExtractionResult = z.infer<typeof extractionSchema>;

const sourceObservationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["value", "source_document", "source_page_or_section", "confidence", "remarks"],
  properties: {
    value: { type: ["string", "number", "boolean", "null"] },
    source_document: { type: ["string", "null"] },
    source_page_or_section: { type: ["string", "null"] },
    confidence: { type: ["string", "null"], enum: ["HIGH", "MEDIUM", "LOW", null] },
    remarks: { type: ["string", "null"] },
  },
} as const;

const extractedFieldJsonSchema = {
  ...sourceObservationJsonSchema,
  required: [...sourceObservationJsonSchema.required, "alternative_values"],
  properties: { ...sourceObservationJsonSchema.properties, alternative_values: { type: "array", items: sourceObservationJsonSchema } },
} as const;

const aiExtractedFieldJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["field", ...extractedFieldJsonSchema.required],
  properties: { field: { type: "string" }, ...extractedFieldJsonSchema.properties },
} as const;

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["extraction_result"],
  properties: {
    extraction_result: {
      type: "object",
      additionalProperties: false,
      required: [...EXTRACTION_GROUPS.map((group) => group.key), "validation_warnings", "missing_required_fields", "source_trace"],
      properties: {
        ...Object.fromEntries(EXTRACTION_GROUPS.map((group) => [group.key, {
          type: "array",
          description: group.description,
          items: { ...aiExtractedFieldJsonSchema, properties: { ...aiExtractedFieldJsonSchema.properties, field: { type: "string", enum: group.fields.map((field) => field.key) } } },
        }])),
        validation_warnings: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "description", "severity", "source_documents"], properties: { field: { type: "string" }, description: { type: "string" }, severity: { type: "string", enum: ["INFO", "WARNING", "HIGH"] }, source_documents: { type: "array", items: { type: "string" } } } } },
        missing_required_fields: { type: "array", items: { type: "string" } },
        source_trace: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "source_document", "source_page_or_section", "confidence", "remarks"], properties: { field: { type: "string" }, source_document: { type: "string" }, source_page_or_section: { type: ["string", "null"] }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, remarks: { type: ["string", "null"] } } } },
      },
    },
  },
} as const;

const blankObservation = () => ({ value: null, source_document: null, source_page_or_section: null, confidence: null, remarks: null });
const blankField = () => ({ ...blankObservation(), alternative_values: [] });

export function createEmptyExtractionResult(): MinimumExtractionResult {
  const extractionResult: Record<string, unknown> = {};
  for (const group of EXTRACTION_GROUPS) extractionResult[group.key] = Object.fromEntries(group.fields.map((field) => [field.key, blankField()]));
  extractionResult.validation_warnings = [];
  extractionResult.missing_required_fields = [];
  extractionResult.source_trace = [];
  return { extraction_result: extractionResult } as MinimumExtractionResult;
}

function normaliseObservation(value: any) {
  return {
    value: value?.value ?? null,
    source_document: typeof value?.source_document === "string" ? value.source_document : null,
    source_page_or_section: typeof value?.source_page_or_section === "string" ? value.source_page_or_section : null,
    confidence: ["HIGH", "MEDIUM", "LOW"].includes(value?.confidence) ? value.confidence : null,
    remarks: typeof value?.remarks === "string" ? value.remarks : null,
  };
}

export function normalizeExtractionResult(input: any): MinimumExtractionResult {
  const normalized = createEmptyExtractionResult() as any;
  if (input?.extraction_result) {
    for (const group of EXTRACTION_GROUPS) {
      const suppliedGroup = input.extraction_result?.[group.key];
      if (Array.isArray(suppliedGroup)) {
        for (const current of suppliedGroup) {
          if (!group.fields.some((field) => field.key === current?.field)) continue;
          normalized.extraction_result[group.key][current.field] = {
            ...normaliseObservation(current),
            alternative_values: Array.isArray(current?.alternative_values) ? current.alternative_values.map(normaliseObservation) : [],
          };
        }
      } else {
        for (const field of group.fields) {
          const current = suppliedGroup?.[field.key];
          normalized.extraction_result[group.key][field.key] = {
            ...normaliseObservation(current),
            alternative_values: Array.isArray(current?.alternative_values) ? current.alternative_values.map(normaliseObservation) : [],
          };
        }
      }
    }
    normalized.extraction_result.validation_warnings = Array.isArray(input.extraction_result.validation_warnings) ? input.extraction_result.validation_warnings : [];
    normalized.extraction_result.missing_required_fields = Array.isArray(input.extraction_result.missing_required_fields) ? input.extraction_result.missing_required_fields : [];
    normalized.extraction_result.source_trace = Array.isArray(input.extraction_result.source_trace) ? input.extraction_result.source_trace : [];
    return extractionSchema.parse(normalized);
  }
  return legacyExtractionToContract(input, normalized);
}

function legacyExtractionToContract(input: any, normalized: any): MinimumExtractionResult {
  const set = (group: string, field: string, value: unknown) => { if (value !== null && value !== undefined && value !== "") normalized.extraction_result[group][field].value = value; };
  set("parties", "land_owner_name", Array.isArray(input?.ownerNames) ? input.ownerNames.join(", ") : input?.ownerNames);
  set("revenue_records", "khatian_number", input?.khatiyanNumber);
  set("revenue_records", "rs_plot_number", input?.rsHal?.raw);
  set("revenue_records", "rs_hal_mother_number", input?.rsHal?.mother);
  set("revenue_records", "rs_hal_bata_number", input?.rsHal?.bata);
  set("revenue_records", "cs_plot_number", input?.csHalNumber);
  for (const key of ["district", "subdivision", "revenueCircle", "tehsil", "mouja"]) set("property_location", key === "revenueCircle" ? "revenue_circle" : key, input?.locality?.[key]);
  const deeds = Array.isArray(input?.deeds) ? input.deeds : [];
  set("legal_documents", "deed_number", deeds.map((item: any) => item.number).filter(Boolean).join("; "));
  set("legal_documents", "deed_date", deeds.map((item: any) => item.date).filter(Boolean).join("; "));
  set("legal_documents", "deed_type", deeds.map((item: any) => item.type).filter(Boolean).join("; "));
  set("legal_documents", "consideration_value_if_present", deeds.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0) || null);
  for (const side of ["North", "South", "East", "West"]) {
    const match = deeds.flatMap((item: any) => item.adjoiningOwners || []).find((item: string) => item.toLowerCase().startsWith(side.toLowerCase()));
    set("boundaries", `boundary_${side.toLowerCase()}_deed`, match?.replace(/^[^:]+:\s*/, ""));
  }
  set("boundaries", "approach_road_side_or_direction", [input?.approachRoad?.side, input?.approachRoad?.direction].filter(Boolean).join(" / "));
  set("boundaries", "independent_access_to_property", input?.approachRoad?.attached);
  set("building_details", "type_of_building", input?.building?.type);
  set("building_details", "plinth_area_sqft", input?.building?.plinthAreaSqFt);
  set("building_details", "approximate_age_of_building", input?.building?.ageYears);
  set("plan_and_permissions", "building_plan_available", input?.building?.approvedPlanAvailable);
  set("legal_documents", "agreement_number_or_serial_number", input?.agreement?.serialNumber);
  set("legal_documents", "agreement_date", input?.agreement?.date);
  set("legal_documents", "certificate_number", input?.agreement?.eStampNumber);
  set("parties", "agreement_buyer_name", input?.agreement?.buyerName);
  const landClasses = Array.isArray(input?.landClasses) ? input.landClasses : [];
  set("land_area_and_dimensions", "land_classes_and_areas", landClasses.map((item: any) => `${item.name || "Unclassified"} - ${item.areaSqFt ?? item.sourceValue ?? "N/A"} ${item.areaSqFt ? "sq ft" : item.sourceUnit || ""}`.trim()).join("\n"));
  set("land_area_and_dimensions", "valuation_eligible_land_classes", landClasses.filter((item: any) => item.considered).map((item: any) => item.name).join(", "));
  set("calculated_inputs_ready_for_valuation", "land_area_taken_for_valuation", landClasses.filter((item: any) => item.considered).reduce((sum: number, item: any) => sum + (Number(item.areaSqFt) || 0), 0) || null);
  normalized.extraction_result.validation_warnings = (input?.contradictions || []).map((item: any) => ({ field: item.field || "legacy", description: item.description || String(item), severity: "HIGH", source_documents: item.documentIds || [] }));
  normalized.extraction_result.source_trace = (input?.evidence || []).map((item: any) => ({ field: item.field || "legacy", source_document: item.documentId || "Legacy extraction", source_page_or_section: null, confidence: item.confidence || "LOW", remarks: item.excerpt || null }));
  if (Array.isArray(input?.comments)) normalized.extraction_result.validation_warnings.push(...input.comments.map((description: string) => ({ field: "general", description, severity: "INFO", source_documents: [] })));
  return extractionSchema.parse(normalized);
}

export function extractionFieldValue(input: any, group: string, field: string) {
  const extractionResult = normalizeExtractionResult(input).extraction_result as any;
  return extractionResult[group]?.[field]?.value ?? null;
}

const stringValue = (value: unknown) => value === null || value === undefined ? null : String(value).trim() || null;
const numberValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match && Number.isFinite(Number(match[0])) ? Number(match[0]) : null;
};
const booleanValue = (value: unknown) => typeof value === "boolean" ? value : typeof value === "string" && /^(yes|true|available)$/i.test(value) ? true : typeof value === "string" && /^(no|false|not available)$/i.test(value) ? false : null;
const splitValues = (value: unknown) => stringValue(value)?.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean) || [];

function parseLandClasses(value: unknown, eligibleValue: unknown, fallbackArea: unknown) {
  const eligible = (stringValue(eligibleValue) || "").toLowerCase();
  const rows = splitValues(value);
  const parsed = rows.map((row) => {
    const match = row.match(/^(.+?)\s*[-:]\s*([\d,.]+)\s*(?:sq\.?\s*ft|sqft|square feet)?$/i) || row.match(/^([\d,.]+)\s*(?:sq\.?\s*ft|sqft|square feet)\s+(.+)$/i);
    const firstIsNumber = match && /^\d/.test(match[1]);
    const name = match ? (firstIsNumber ? match[2] : match[1]).trim() : row;
    const area = match ? Number((firstIsNumber ? match[1] : match[2]).replaceAll(",", "")) : null;
    return { name, areaSqFt: Number.isFinite(area) ? area : null, sourceUnit: "sq ft", sourceValue: match ? (firstIsNumber ? match[1] : match[2]) : null, considered: Boolean(eligible && eligible.includes(name.toLowerCase())) };
  });
  if (parsed.length) return parsed;
  const area = numberValue(fallbackArea);
  return area === null ? [] : [{ name: "Unclassified", areaSqFt: area, sourceUnit: "sq ft", sourceValue: String(area), considered: true }];
}

export function toLegacyExtractedValuation(input: any) {
  const contract = normalizeExtractionResult(input).extraction_result as any;
  const get = (group: string, field: string) => contract[group]?.[field]?.value ?? null;
  const deedNumbers = splitValues(get("legal_documents", "deed_number"));
  const deedDates = splitValues(get("legal_documents", "deed_date"));
  const deedTypes = splitValues(get("legal_documents", "deed_type"));
  const deedCount = Math.max(deedNumbers.length, deedDates.length, deedTypes.length, 1);
  const adjoiningOwners = ["north", "south", "east", "west"].map((side) => {
    const value = stringValue(get("boundaries", `boundary_${side}_deed`));
    return value ? `${side[0].toUpperCase()}${side.slice(1)}: ${value}` : null;
  }).filter(Boolean);
  const landClasses = parseLandClasses(
    get("land_area_and_dimensions", "land_classes_and_areas"),
    get("land_area_and_dimensions", "valuation_eligible_land_classes"),
    get("calculated_inputs_ready_for_valuation", "land_area_taken_for_valuation") ?? get("land_area_and_dimensions", "site_measured_area_sqft") ?? get("land_area_and_dimensions", "khatian_land_area_sqft") ?? get("land_area_and_dimensions", "deed_land_area_sqft"),
  );
  const warnings = contract.validation_warnings || [];
  const traces = contract.source_trace || [];
  return {
    ownerNames: splitValues(get("parties", "land_owner_name") || get("parties", "owner_or_recorded_possessor_name") || get("parties", "buyer_or_current_owner_name")),
    khatiyanNumber: stringValue(get("revenue_records", "khatian_number")),
    rsHal: { mother: stringValue(get("revenue_records", "rs_hal_mother_number")), bata: stringValue(get("revenue_records", "rs_hal_bata_number")), raw: stringValue(get("revenue_records", "rs_plot_number") || get("revenue_records", "hal_plot_number")) },
    csHalNumber: stringValue(get("revenue_records", "cs_plot_number") || get("revenue_records", "dag_number_if_present")),
    locality: { district: stringValue(get("property_location", "district")), subdivision: stringValue(get("property_location", "subdivision")), revenueCircle: stringValue(get("property_location", "revenue_circle")), tehsil: stringValue(get("property_location", "tehsil")), mouja: stringValue(get("property_location", "mouja")) },
    deeds: Array.from({ length: deedCount }, (_, index) => ({ number: deedNumbers[index] || null, date: deedDates[index] || null, amount: index === 0 ? numberValue(get("legal_documents", "consideration_value_if_present")) : null, type: deedTypes[index] || null, adjoiningOwners })),
    landClasses,
    approachRoad: { side: stringValue(get("boundaries", "approach_road_side_or_direction")), direction: stringValue(get("boundaries", "approach_road_description")), attached: booleanValue(get("boundaries", "independent_access_to_property")) },
    building: { type: stringValue(get("building_details", "type_of_building") || get("building_details", "structure_type")), plinthAreaSqFt: numberValue(get("building_details", "plinth_area_sqft") || get("plan_and_permissions", "approved_plinth_area")), ageYears: numberValue(get("building_details", "approximate_age_of_building")), approvedPlanAvailable: booleanValue(get("plan_and_permissions", "building_plan_available")) },
    agreement: { serialNumber: stringValue(get("legal_documents", "agreement_number_or_serial_number")), date: stringValue(get("legal_documents", "agreement_date")), eStampNumber: stringValue(get("legal_documents", "certificate_number")), buyerName: stringValue(get("parties", "agreement_buyer_name")) },
    evidence: traces.map((item: any) => ({ field: item.field, documentId: item.source_document, excerpt: item.remarks || item.source_page_or_section || "Source recorded", confidence: item.confidence })),
    contradictions: warnings.filter((item: any) => item.severity !== "INFO").map((item: any) => ({ field: item.field, description: item.description, documentIds: item.source_documents })),
    comments: warnings.filter((item: any) => item.severity === "INFO").map((item: any) => item.description),
  };
}
