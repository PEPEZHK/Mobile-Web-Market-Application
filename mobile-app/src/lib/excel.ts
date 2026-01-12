import * as XLSX from "xlsx";

export interface WorksheetData {
  name: string;
  rows: Array<Array<string | number>>;
}

const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SHEET_NAME_MAX_LENGTH = 31;

function toSheetName(name: string, index: number) {
  const trimmed = name?.trim() || `Sheet${index + 1}`;
  const safe = trimmed.replace(/[/\\?*\[\]:]/g, " ").slice(0, SHEET_NAME_MAX_LENGTH);
  return safe.length > 0 ? safe : `Sheet${index + 1}`;
}

function buildWorkbook(sheets: WorksheetData[]) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet, index) => {
    const rows = sheet.rows.length > 0 ? sheet.rows : [[""]];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const sheetName = toSheetName(sheet.name, index);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });
  return workbook;
}

export function createExcelBuffers(sheets: WorksheetData[]) {
  if (sheets.length === 0) return null;
  const workbook = buildWorkbook(sheets);
  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
  return { arrayBuffer, base64 };
}

export function createExcelBlob(sheets: WorksheetData[]): Blob | null {
  const buffers = createExcelBuffers(sheets);
  if (!buffers) return null;
  return new Blob([buffers.arrayBuffer], { type: EXCEL_MIME_TYPE });
}

export function downloadExcelFile(filename: string, sheets: WorksheetData[]) {
  const blob = createExcelBlob(sheets);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const normalized = filename.toLowerCase().endsWith(".xlsx")
    ? filename
    : filename.replace(/\.xls$/i, "").concat(".xlsx");
  link.download = normalized;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export { EXCEL_MIME_TYPE };
