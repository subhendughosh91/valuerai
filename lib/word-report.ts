import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

const blue = "2F5DA8";
const ink = "222222";
const paleBlue = "E8F2F8";
const paleGold = "F3F0D6";
const muted = "5A6470";

const na = (value: unknown) => value === null || value === undefined || value === "" ? "N/A" : String(value);
const names = (value: unknown) => Array.isArray(value) ? value.filter(Boolean).join(", ") || "N/A" : na(value);
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value)
  ? `Rs. ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : "N/A";
const text = (value: unknown, options: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text: na(value), bold: options.bold, size: options.size ?? 18, color: options.color ?? ink, italics: options.italics });
const borders = {
  top: { style: BorderStyle.SINGLE, size: 6, color: "555555" }, bottom: { style: BorderStyle.SINGLE, size: 6, color: "555555" },
  left: { style: BorderStyle.SINGLE, size: 6, color: "555555" }, right: { style: BorderStyle.SINGLE, size: 6, color: "555555" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "777777" }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "777777" },
};

function paragraph(value: unknown, options: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; italics?: boolean } = {}) {
  return new Paragraph({ alignment: options.align, spacing: { before: options.before, after: options.after ?? 40 }, children: [text(value, options)] });
}

function reportCell(value: unknown, options: { bold?: boolean; fill?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; columnSpan?: number; size?: number } = {}) {
  return new TableCell({
    columnSpan: options.columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
    margins: { top: 65, bottom: 65, left: 95, right: 95 },
    children: [paragraph(value, { bold: options.bold, size: options.size ?? 18, align: options.align })],
  });
}

function table(rows: TableRow[], widths?: number[]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows, columnWidths: widths });
}

function kvTable(rows: Array<[string, unknown]>) {
  return table(rows.map(([label, value]) => new TableRow({ children: [reportCell(label, { bold: true, fill: paleBlue }), reportCell(value)] })), [2600, 6500]);
}

function sectionHeading(value: string, number?: string) {
  return table([new TableRow({ children: [reportCell(number ? `${number}.` : " ", { bold: true, fill: paleBlue, align: AlignmentType.CENTER }), reportCell(value, { bold: true, fill: paleBlue })] })], [500, 8600]);
}

function labelledRows(rows: Array<[string, unknown]>) {
  return table(rows.map(([label, value]) => new TableRow({ children: [reportCell(label, { bold: true }), reportCell(value)] })), [3100, 6000]);
}

function line(value: unknown) { return new Paragraph({ children: [text(value)], spacing: { after: 65 } }); }

function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }

function sideValue(deeds: any[], side: string) {
  const exact = deeds.flatMap((deed) => deed.adjoiningOwners ?? []).find((item: unknown) => new RegExp(`^${side}\\s*[:\\-]`, "i").test(String(item)));
  return exact ? String(exact).replace(new RegExp(`^${side}\\s*[:\\-]\\s*`, "i"), "") : "N/A";
}

function keyPlan(deeds: any[], approved: any) {
  const road = [approved.approachRoad?.side, approved.approachRoad?.direction].filter(Boolean).join(" / ") || "N/A";
  return [
    paragraph("KEY PLAN", { bold: true, size: 28, color: blue, align: AlignmentType.CENTER, before: 100, after: 0 }),
    paragraph("Indicative only - not to scale - generated from confirmed valuation data", { italics: true, size: 17, color: muted, align: AlignmentType.CENTER, after: 120 }),
    table([
      new TableRow({ children: [reportCell(`North: ${sideValue(deeds, "North")}`, { align: AlignmentType.CENTER, columnSpan: 3 })] }),
      new TableRow({ children: [reportCell(`West: ${sideValue(deeds, "West")}`, { align: AlignmentType.CENTER }), reportCell(`CONCERN PROPERTY\nKhatiyan: ${na(approved.khatiyanNumber)}\nRS Hal: ${na(approved.rsHal?.raw)}`, { bold: true, fill: paleGold, align: AlignmentType.CENTER }), reportCell(`East: ${sideValue(deeds, "East")}`, { align: AlignmentType.CENTER })] }),
      new TableRow({ children: [reportCell(`South: ${sideValue(deeds, "South")}`, { align: AlignmentType.CENTER, columnSpan: 3 })] }),
      new TableRow({ children: [reportCell(`Approach road / direction: ${road}`, { bold: true, fill: paleBlue, align: AlignmentType.CENTER, columnSpan: 3 })] }),
    ], [3000, 3000, 3000]),
    paragraph("Map coordinates, site photographs, and official cadastral maps must be attached separately when supplied and verified.", { size: 16, color: muted, italics: true, before: 100 }),
  ];
}

export async function createSbiStyleValuationReport({ referenceNo, userName, approved, calculation }: { referenceNo: string; userName: string; approved: any; calculation: any }) {
  const deeds = Array.isArray(approved.deeds) ? approved.deeds : [];
  const landClasses = Array.isArray(approved.landClasses) ? approved.landClasses : [];
  const locality = approved.locality ?? {};
  const building = approved.building ?? {};
  const calculationBuilding = calculation.building ?? null;
  const property = [locality.mouja, locality.tehsil, locality.district].filter(Boolean).join(", ") || "N/A";
  const owner = names(approved.ownerNames);
  const reportDate = new Date().toLocaleDateString("en-GB");
  const landRows = landClasses.length ? landClasses.map((land: any) => {
    const item = (calculation.landItems ?? []).find((candidate: any) => candidate.name === land.name);
    return new TableRow({ children: [reportCell(land.name), reportCell(land.areaSqFt ? `${land.areaSqFt} sq ft` : "N/A", { align: AlignmentType.RIGHT }), reportCell(land.considered ? "Yes" : "No", { align: AlignmentType.CENTER }), reportCell(item ? money(item.ratePerSqFt) : "N/A", { align: AlignmentType.RIGHT }), reportCell(item ? money(item.value) : "N/A", { align: AlignmentType.RIGHT })] });
  }) : [new TableRow({ children: [reportCell("N/A"), reportCell("N/A"), reportCell("N/A"), reportCell("N/A"), reportCell("N/A")] })];

  const document = new Document({
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 800, bottom: 720, left: 800 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text("Valuation Report | ValuerAI", { size: 16, color: muted })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(`${referenceNo} | Page `, { size: 15, color: muted }), new TextRun({ children: [PageNumber.CURRENT], size: 15, color: muted })] })] }) },
      children: [
        paragraph("VALUATION REPORT", { bold: true, size: 36, color: blue, align: AlignmentType.CENTER, before: 280, after: 40 }),
        paragraph("SBI-style property valuation format", { bold: true, size: 21, color: ink, align: AlignmentType.CENTER, after: 240 }),
        table([new TableRow({ children: [reportCell("Reference No.", { bold: true, fill: paleBlue }), reportCell(referenceNo), reportCell("Date", { bold: true, fill: paleBlue }), reportCell(reportDate)] })], [1700, 3000, 1600, 2800]),
        paragraph("VALUATION CERTIFICATE", { bold: true, size: 28, color: ink, align: AlignmentType.CENTER, before: 240, after: 110 }),
        line(`This is to certify that the property situated at ${property}, owned by ${owner}, has been assessed from the approved information and documents available for this assignment. This report records unavailable information as N/A.`),
        paragraph(`Owner: ${owner}`, { bold: true, size: 27, align: AlignmentType.CENTER, before: 100, after: 180 }),
        kvTable([["Market value", money(calculation.marketValue)], ["Book value", money(deeds.reduce((sum: number, deed: any) => sum + (typeof deed.amount === "number" ? deed.amount : 0), 0))], ["Realisable value", money(calculation.realisableValue)], ["Distress sale value", money(calculation.distressValue)]]),
        paragraph("Declaration", { bold: true, size: 21, before: 240 }),
        line("The property particulars have been considered from supplied documents and approved input. Legal title, document authenticity, and statutory permissions require independent verification by the appropriate authority or legal adviser."),
        pageBreak(),
        paragraph("Annexure-XIV", { bold: true, size: 21, align: AlignmentType.RIGHT, after: 0 }),
        paragraph("FORMAT OF VALUATION REPORT", { bold: true, size: 25, align: AlignmentType.CENTER, after: 60 }),
        paragraph("(For property valuation assignments)", { size: 16, align: AlignmentType.CENTER, after: 150 }),
        kvTable([["Name & address of branch", "N/A"], ["Name of customer(s) / borrower unit", userName], ["Purpose of valuation", "N/A"]]),
        sectionHeading("Customer Details", "1"), labelledRows([["Name of land owner", owner], ["Phone number", "N/A"]]),
        sectionHeading("Property Details", "2"), labelledRows([["Address", property], ["Nearby landmark / map reference", "N/A"]]),
        sectionHeading("Document Details", "3"), labelledRows([["Layout plan", "N/A"], ["Building plan", building.approvedPlanAvailable === true ? "Available" : building.approvedPlanAvailable === false ? "Not available" : "N/A"], ["Construction permission", "N/A"], ["Occupation permission", "N/A"], ["Sale deed(s)", deeds.map((deed: any) => [deed.number, deed.date].filter(Boolean).join(" dated ")).filter(Boolean).join("; ") || "N/A"], ["Khatiyan number", approved.khatiyanNumber], ["Agreement serial / date", [approved.agreement?.serialNumber, approved.agreement?.date].filter(Boolean).join(" / ")]]),
        sectionHeading("Location of Property"), labelledRows([["RS / Hal plot number", approved.rsHal?.raw], ["CS / Sebek Dag number", approved.csHalNumber], ["Subdivision", locality.subdivision], ["Revenue circle", locality.revenueCircle], ["Tehsil", locality.tehsil], ["Mouja", locality.mouja], ["Classification of land", landClasses.map((land: any) => land.name).filter(Boolean).join(", ")]]),
        pageBreak(),
        sectionHeading("Physical Details", "4"),
        table([
          new TableRow({ children: [reportCell("Adjoining properties", { bold: true, fill: paleBlue }), reportCell("According to deed / agreement", { bold: true, fill: paleBlue }), reportCell("According to site visit", { bold: true, fill: paleBlue })] }),
          ...["North", "South", "East", "West"].map((side) => new TableRow({ children: [reportCell(side, { bold: true }), reportCell(sideValue(deeds, side)), reportCell("N/A")] })),
          new TableRow({ children: [reportCell("Approach road", { bold: true }), reportCell([approved.approachRoad?.side, approved.approachRoad?.direction].filter(Boolean).join(" / ")), reportCell("N/A")] }),
          new TableRow({ children: [reportCell("Matching of boundaries", { bold: true }), reportCell("N/A"), reportCell("N/A")] }),
          new TableRow({ children: [reportCell("Approved land use", { bold: true }), reportCell("N/A", { columnSpan: 2 })] }),
          new TableRow({ children: [reportCell("Type of property", { bold: true }), reportCell("N/A", { columnSpan: 2 })] }),
        ], [2300, 3400, 3400]),
        sectionHeading("Dimension of Property", "4A"), labelledRows([["North", "N/A"], ["South", "N/A"], ["East", "N/A"], ["West", "N/A"]]),
        sectionHeading("Building / Site Details"), labelledRows([["Number of rooms", "N/A"], ["Number of floors", "N/A"], ["Approx. age of property", building.ageYears ? `${building.ageYears} years` : "N/A"], ["Type of structure", building.type], ["Plinth area", building.plinthAreaSqFt ? `${building.plinthAreaSqFt} sq ft` : "N/A"]]),
        sectionHeading("Tenure / Occupancy Details", "5"), labelledRows([["Status of tenure", "N/A"], ["Number of years of occupancy", "N/A"], ["Relationship of tenant / owner", "N/A"]]),
        sectionHeading("Stage of Construction", "6"), labelledRows([["Stage of construction", "N/A"], ["Extent of completion", "N/A"]]),
        sectionHeading("Violations if any observed", "7"), labelledRows([["Nature and extent of violations", "N/A"]]),
        sectionHeading("Area Details of the Property", "8"), labelledRows([["Site area", landClasses.reduce((sum: number, item: any) => sum + (Number(item.areaSqFt) || 0), 0) || "N/A"], ["Built-up area", building.plinthAreaSqFt ? `${building.plinthAreaSqFt} sq ft` : "N/A"], ["Carpet area", "N/A"], ["Remarks", "N/A"]]),
        pageBreak(),
        sectionHeading("Valuation", "9"),
        paragraph("Summary of Valuation", { bold: true, size: 20, before: 100 }),
        labelledRows([["Guideline value", "N/A"], ["Prevailing market rate", "N/A"], ["Adopted rate of valuation", "N/A"], ["Estimated value of land", money(calculation.landValue)]]),
        paragraph("Part A - Land", { bold: true, size: 21, before: 130 }),
        table([new TableRow({ children: [reportCell("Land class", { bold: true, fill: paleBlue }), reportCell("Area", { bold: true, fill: paleBlue }), reportCell("Considered", { bold: true, fill: paleBlue }), reportCell("Rate", { bold: true, fill: paleBlue }), reportCell("Value", { bold: true, fill: paleBlue })] }), ...landRows, new TableRow({ children: [reportCell("Estimated land value", { bold: true, fill: paleGold, columnSpan: 4, align: AlignmentType.RIGHT }), reportCell(money(calculation.landValue), { bold: true, fill: paleGold, align: AlignmentType.RIGHT })] })], [1700, 1700, 1500, 2000, 2200]),
        paragraph("Part B - Building", { bold: true, size: 21, before: 140 }),
        table([
          new TableRow({ children: [reportCell("Particulars", { bold: true, fill: paleBlue }), reportCell("Plinth area", { bold: true, fill: paleBlue }), reportCell("Age", { bold: true, fill: paleBlue }), reportCell("Replacement cost", { bold: true, fill: paleBlue }), reportCell("Depreciation", { bold: true, fill: paleBlue }), reportCell("Net value", { bold: true, fill: paleBlue })] }),
          new TableRow({ children: [reportCell(building.type), reportCell(building.plinthAreaSqFt ? `${building.plinthAreaSqFt} sq ft` : "N/A"), reportCell(building.ageYears ? `${building.ageYears} years` : "N/A"), reportCell(money(calculationBuilding?.replacementCost)), reportCell(money(calculationBuilding?.depreciation)), reportCell(money(calculationBuilding?.netValue))] }),
          new TableRow({ children: [reportCell("Total", { bold: true, fill: paleGold, columnSpan: 5, align: AlignmentType.RIGHT }), reportCell(money(calculationBuilding?.netValue), { bold: true, fill: paleGold, align: AlignmentType.RIGHT })] }),
        ], [1900, 1300, 1000, 1800, 1600, 1500]),
        paragraph("Parts C-F - Extra items, amenities, miscellaneous and services", { bold: true, size: 20, before: 140 }),
        labelledRows([["Extra items", "N/A"], ["Amenities", "N/A"], ["Miscellaneous", "N/A"], ["Services", "N/A"]]),
        pageBreak(),
        paragraph("TOTAL ABSTRACT OF THE ENTIRE PROPERTY", { bold: true, size: 25, align: AlignmentType.CENTER, before: 50, after: 110 }),
        table([
          new TableRow({ children: [reportCell("Part A", { bold: true, fill: paleGold }), reportCell("Land", { bold: true, fill: paleGold }), reportCell(money(calculation.landValue), { bold: true, fill: paleGold, align: AlignmentType.RIGHT })] }),
          new TableRow({ children: [reportCell("Part B", { bold: true }), reportCell("Building", { bold: true }), reportCell(money(calculationBuilding?.netValue), { align: AlignmentType.RIGHT })] }),
          new TableRow({ children: [reportCell("Part C-F", { bold: true }), reportCell("Extra items, amenities, miscellaneous and services", { bold: true }), reportCell("N/A", { align: AlignmentType.RIGHT })] }),
          new TableRow({ children: [reportCell(" ", { fill: paleBlue }), reportCell("Total market value", { bold: true, fill: paleBlue }), reportCell(money(calculation.marketValue), { bold: true, fill: paleBlue, align: AlignmentType.RIGHT })] }),
        ], [1300, 4700, 3000]),
        paragraph("Remarks", { bold: true, size: 21, color: blue, before: 180 }),
        line(names(approved.comments)),
        line("This valuation is a technical opinion based on the information made available for the assignment. It does not verify title, authenticity, approvals, or legal encumbrances. Any unavailable field has been recorded as N/A."),
        table([["1. Market Value", money(calculation.marketValue)], ["2. Realisable Value", money(calculation.realisableValue)], ["3. Distress Sale Value", money(calculation.distressValue)]].map(([label, value]) => new TableRow({ children: [reportCell(label, { bold: true, fill: paleBlue }), reportCell(value, { bold: true, fill: paleBlue, align: AlignmentType.RIGHT })] })), [5200, 3800]),
        paragraph("Signature of Valuer", { bold: true, size: 20, align: AlignmentType.RIGHT, before: 650 }),
        paragraph("____________________________", { align: AlignmentType.RIGHT }),
        paragraph("Authorised Valuer", { size: 16, align: AlignmentType.RIGHT }),
        pageBreak(),
        ...keyPlan(deeds, approved),
        pageBreak(),
        paragraph("PHOTOGRAPHS AND EVIDENCE ANNEXURE", { bold: true, size: 27, color: blue, align: AlignmentType.CENTER, before: 80, after: 130 }),
        labelledRows([["Property photographs", "N/A - attach verified site photographs when available"], ["Official cadastral / dag map", "N/A - attach verified map when available"], ["Extraction evidence", Array.isArray(approved.evidence) && approved.evidence.length ? `${approved.evidence.length} evidence item(s) retained with this valuation record` : "N/A"], ["Document conflicts", Array.isArray(approved.contradictions) && approved.contradictions.length ? approved.contradictions.map((item: any) => item.description).join("; ") : "None recorded"]]),
        paragraph("END OF REPORT", { bold: true, size: 18, color: muted, align: AlignmentType.CENTER, before: 360 }),
      ],
    }],
  });
  return Packer.toBuffer(document);
}
