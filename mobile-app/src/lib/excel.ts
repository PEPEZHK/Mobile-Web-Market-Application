export interface WorksheetData {
  name: string;
  rows: Array<Array<string | number>>;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatCellValue(value: string | number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "Number", value: value.toString() } as const;
  }
  return { type: "String", value: escapeXml(String(value)) } as const;
}

export function createExcelBlob(sheets: WorksheetData[]): Blob | null {
  if (sheets.length === 0) return null;
  const worksheetXml = sheets.map(sheet => {
    const rowsXml = sheet.rows.map(row => {
      const cellsXml = row.map(cell => {
        const formatted = formatCellValue(cell);
        return `<Cell><Data ss:Type="${formatted.type}">${formatted.value}</Data></Cell>`;
      }).join("");
      return `<Row>${cellsXml}</Row>`;
    }).join("");

    return `
      <Worksheet ss:Name="${escapeXml(sheet.name)}">
        <Table>
          ${rowsXml}
        </Table>
      </Worksheet>
    `;
  }).join("");

  const workbookXml = `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:html="http://www.w3.org/TR/REC-html40">
      ${worksheetXml}
    </Workbook>`;

  return new Blob([workbookXml], { type: "application/vnd.ms-excel" });
}

export function downloadExcelFile(filename: string, sheets: WorksheetData[]) {
  const blob = createExcelBlob(sheets);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") || filename.endsWith(".xlsx") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
