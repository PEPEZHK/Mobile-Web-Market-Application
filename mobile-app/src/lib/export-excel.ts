import type { WorksheetData } from "./excel";
import { saveExcelUsingShareSheet } from "./saveExcelUsingShareSheet";
import { getExportDestination } from "./export-preferences";

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function ensureXlsxName(fileName: string) {
  const trimmed = fileName?.trim() || "export";
  const normalized = trimmed.toLowerCase().endsWith(".xlsx")
    ? trimmed
    : trimmed.replace(/\.json$/i, "").replace(/\.xls$/i, "").concat(".xlsx");
  return normalized.replace(INVALID_FILENAME_CHARS, "_");
}

export async function exportSheetsAsExcel(fileName: string, sheets: WorksheetData[]) {
  if (sheets.length === 0) return;
  const safeName = ensureXlsxName(fileName);
  const destination = getExportDestination();
  const action =
    destination === "downloads" ? "save" : destination === "share" ? "share" : "both";
  await saveExcelUsingShareSheet(safeName, sheets, { action });
}
