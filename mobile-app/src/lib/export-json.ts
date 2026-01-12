import type { WorksheetData } from "./excel";
import { saveJsonUsingShareSheet } from "./saveJsonUsingShareSheet";

const SHEET_NAME_MAX_LENGTH = 31;
const INVALID_SHEET_CHARS = /[\\/?*\[\]:]/g;

function normalizeSheetName(name: string, index: number, used: Set<string>) {
  const base = (name?.trim() || `Sheet${index + 1}`)
    .replace(INVALID_SHEET_CHARS, " ")
    .trim()
    .slice(0, SHEET_NAME_MAX_LENGTH) || `Sheet${index + 1}`;

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const suffixLabel = `_${suffix}`;
    candidate = base.slice(0, SHEET_NAME_MAX_LENGTH - suffixLabel.length) + suffixLabel;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function toJsonPayload(sheets: WorksheetData[]) {
  const payload: Record<string, WorksheetData["rows"]> = {};
  const usedNames = new Set<string>();
  sheets.forEach((sheet, index) => {
    const name = normalizeSheetName(sheet.name, index, usedNames);
    payload[name] = sheet.rows;
  });
  return payload;
}

function ensureJsonName(fileName: string) {
  const trimmed = fileName?.trim() || "export";
  return trimmed.toLowerCase().endsWith(".json")
    ? trimmed
    : trimmed.replace(/\.xlsx$/i, "").replace(/\.xls$/i, "").concat(".json");
}

export async function exportSheetsAsJson(fileName: string, sheets: WorksheetData[]) {
  if (sheets.length === 0) return;
  const payload = toJsonPayload(sheets);
  const safeName = ensureJsonName(fileName);
  await saveJsonUsingShareSheet(safeName, payload, { action: "both" });
}
