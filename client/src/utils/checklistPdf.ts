const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 34;

function ascii(value = "") {
  return String(value)
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/✓/g, "YES")
    .replace(/•/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "");
}

function esc(value = "") {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value, width, fontSize = 8) {
  const text = ascii(value).trim();
  if (!text) return [""];
  const approxChars = Math.max(4, Math.floor(width / (fontSize * 0.52)));
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= approxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (word.length <= approxChars) {
      line = word;
    } else {
      let remaining = word;
      while (remaining.length > approxChars) {
        lines.push(remaining.slice(0, approxChars));
        remaining = remaining.slice(approxChars);
      }
      line = remaining;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function makePage() {
  return [];
}

function yPdf(top) {
  return PAGE_H - top;
}

function textCmd(text, x, top, size = 9, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size.toFixed(2)} Tf ${x.toFixed(2)} ${yPdf(top).toFixed(2)} Td (${esc(text)}) Tj ET`;
}

function lineCmd(x1, top1, x2, top2, width = 0.6) {
  return `${width.toFixed(2)} w ${x1.toFixed(2)} ${yPdf(top1).toFixed(2)} m ${x2.toFixed(2)} ${yPdf(top2).toFixed(2)} l S`;
}

function rectCmd(x, top, width, height, fillGray = null, strokeGray = 0.82) {
  const y = PAGE_H - top - height;
  const parts = [];
  if (fillGray != null) parts.push(`${fillGray.toFixed(2)} g ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f 0 g`);
  parts.push(`${strokeGray.toFixed(2)} G 0.55 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S 0 G`);
  return parts.join("\n");
}

function addWrapped(page, value, x, top, width, { size = 8, bold = false, lineHeight = 10, maxLines = 3 } = {}) {
  const lines = wrapText(value, width, size).slice(0, maxLines);
  lines.forEach((line, index) => page.push(textCmd(line, x, top + index * lineHeight, size, bold)));
  return lines.length;
}

function addHeader(page, meta, pageNo) {
  page.push(textCmd("BISHOP HEBER COLLEGE (AUTONOMOUS)", MARGIN, 34, 15, true));
  page.push(textCmd("CO-PO-PSO ATTAINMENT - HOD COMPLETION CHECKLIST", MARGIN, 52, 10.5, true));
  page.push(textCmd(`Academic Year: ${meta.academicYear}   |   Staff: ${meta.staffName}`, MARGIN, 70, 8.5));
  page.push(textCmd(`Department: ${meta.department || "-"}`, MARGIN, 83, 8.5));
  page.push(textCmd(`Generated: ${meta.generated}`, PAGE_W - MARGIN - 190, 34, 7.5));
  page.push(textCmd(`Page ${pageNo}`, PAGE_W - MARGIN - 55, 52, 7.5, true));
  page.push(lineCmd(MARGIN, 92, PAGE_W - MARGIN, 92, 0.9));
}

function tableHeader(page, columns, top, height = 24) {
  let x = MARGIN;
  for (const col of columns) {
    page.push(rectCmd(x, top, col.width, height, 0.93, 0.72));
    addWrapped(page, col.label, x + 5, top + 9, col.width - 10, { size: 7, bold: true, lineHeight: 8, maxLines: 2 });
    x += col.width;
  }
}

function tableRow(page, columns, values, top, rowHeight, { boldIndexes = [], gray = null } = {}) {
  let x = MARGIN;
  columns.forEach((col, index) => {
    page.push(rectCmd(x, top, col.width, rowHeight, gray, 0.84));
    addWrapped(page, values[index] ?? "", x + 5, top + 11, col.width - 10, {
      size: 7.2,
      bold: boldIndexes.includes(index),
      lineHeight: 9,
      maxLines: Math.max(1, Math.floor((rowHeight - 7) / 9)),
    });
    x += col.width;
  });
}

function rowHeightFor(columns, values, size = 7.2) {
  let maxLines = 1;
  columns.forEach((col, index) => {
    maxLines = Math.max(maxLines, wrapText(values[index] ?? "", col.width - 10, size).length);
  });
  return Math.max(24, 8 + Math.min(maxLines, 4) * 9);
}

function addSummaryBoxes(page, summary, top) {
  const boxes = [
    ["Total Papers", summary.total],
    ["Completed", summary.completed],
    ["Pending", summary.pending],
    ["Completion", `${summary.completion}%`],
  ];
  const gap = 10;
  const totalWidth = PAGE_W - MARGIN * 2;
  const width = (totalWidth - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach(([label, value], index) => {
    const x = MARGIN + index * (width + gap);
    page.push(rectCmd(x, top, width, 50, 0.97, 0.82));
    page.push(textCmd(label, x + 10, top + 16, 7.2, true));
    page.push(textCmd(String(value), x + 10, top + 37, 16, true));
  });
}

function buildPdf(pages) {
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const kids = [];
  let objNo = 5;
  pages.forEach((commands) => {
    const pageObj = objNo++;
    const contentObj = objNo++;
    kids.push(`${pageObj} 0 R`);
    const stream = commands.join("\n") + "\n";
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n%PDFGEN\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadHodChecklistPdf({
  academicYear,
  staffName,
  department,
  summary,
  classes,
  papers,
}) {
  const meta = {
    academicYear: ascii(academicYear || "Academic Year"),
    staffName: ascii(staffName || "-"),
    department: ascii(department || "-"),
    generated: new Date().toLocaleString(),
  };

  const pages = [];
  let page = makePage();
  pages.push(page);
  addHeader(page, meta, pages.length);
  addSummaryBoxes(page, summary, 108);

  page.push(textCmd("CLASS-WISE COMPLETION SUMMARY", MARGIN, 180, 10, true));
  page.push(textCmd("A class is COMPLETED only when every paper assigned to this staff for that class has completed attainment.", MARGIN, 194, 7.5));

  const classCols = [
    { label: "S.No", width: 38 },
    { label: "Class / Section", width: 350 },
    { label: "Papers", width: 65 },
    { label: "Completed", width: 78 },
    { label: "Pending", width: 70 },
    { label: "Class Status", width: 168 },
  ];
  let top = 210;
  tableHeader(page, classCols, top);
  top += 24;
  classes.forEach((row, index) => {
    const values = [index + 1, row.className, row.total, row.completed, row.pending, row.status];
    const height = rowHeightFor(classCols, values);
    if (top + height > PAGE_H - 48) {
      page = makePage();
      pages.push(page);
      addHeader(page, meta, pages.length);
      page.push(textCmd("CLASS-WISE COMPLETION SUMMARY (CONTINUED)", MARGIN, 112, 10, true));
      top = 128;
      tableHeader(page, classCols, top);
      top += 24;
    }
    tableRow(page, classCols, values, top, height, { boldIndexes: [1, 5], gray: index % 2 ? 0.985 : null });
    top += height;
  });

  page = makePage();
  pages.push(page);
  addHeader(page, meta, pages.length);
  page.push(textCmd("PAPER-WISE ATTAINMENT CHECKLIST", MARGIN, 112, 10, true));
  page.push(textCmd("Shows exactly which class/paper is completed and which stage is still pending.", MARGIN, 126, 7.5));

  const paperCols = [
    { label: "No", width: 28 },
    { label: "Class / Section", width: 205 },
    { label: "Sem", width: 36 },
    { label: "Batch", width: 52 },
    { label: "Paper", width: 122 },
    { label: "CIA Method", width: 88 },
    { label: "Status", width: 74 },
    { label: "Current / Pending Stage", width: 164 },
  ];
  top = 142;
  tableHeader(page, paperCols, top);
  top += 24;
  papers.forEach((row, index) => {
    const values = [
      index + 1,
      row.className,
      row.semester,
      row.batch,
      `${row.paperCode}${row.paperName ? ` - ${row.paperName}` : ""}`,
      row.method,
      row.status,
      row.stage,
    ];
    const height = rowHeightFor(paperCols, values);
    if (top + height > PAGE_H - 52) {
      page = makePage();
      pages.push(page);
      addHeader(page, meta, pages.length);
      page.push(textCmd("PAPER-WISE ATTAINMENT CHECKLIST (CONTINUED)", MARGIN, 112, 10, true));
      top = 128;
      tableHeader(page, paperCols, top);
      top += 24;
    }
    tableRow(page, paperCols, values, top, height, { boldIndexes: [1, 4, 6], gray: index % 2 ? 0.985 : null });
    top += height;
  });

  if (top + 80 > PAGE_H - 36) {
    page = makePage();
    pages.push(page);
    addHeader(page, meta, pages.length);
    top = 120;
  } else {
    top += 18;
  }
  page.push(textCmd("HOD VERIFICATION / REMARKS", MARGIN, top, 9, true));
  page.push(lineCmd(MARGIN, top + 24, PAGE_W - MARGIN, top + 24, 0.55));
  page.push(lineCmd(MARGIN, top + 44, PAGE_W - MARGIN, top + 44, 0.55));
  page.push(textCmd("HOD / Coordinator Signature: ________________________________", MARGIN, top + 68, 8));
  page.push(textCmd("Date: __________________", PAGE_W - MARGIN - 170, top + 68, 8));

  // Re-render page numbers after final count so every page has a useful footer.
  pages.forEach((commands, index) => {
    commands.push(lineCmd(MARGIN, PAGE_H - 24, PAGE_W - MARGIN, PAGE_H - 24, 0.4));
    commands.push(textCmd(`Academic Year ${meta.academicYear} | HOD Submission Checklist`, MARGIN, PAGE_H - 11, 6.8));
    commands.push(textCmd(`Page ${index + 1} of ${pages.length}`, PAGE_W - MARGIN - 62, PAGE_H - 11, 6.8, true));
  });

  const blob = buildPdf(pages);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Attainment_HOD_Checklist_${ascii(academicYear || "AY").replace(/[^0-9A-Za-z-]/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
