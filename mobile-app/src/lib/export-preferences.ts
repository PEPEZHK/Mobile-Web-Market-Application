export type ExportDestination = "downloads" | "share" | "both";

const STORAGE_KEY = "export_excel_destination";

export function getExportDestination(): ExportDestination {
  if (typeof window === "undefined") return "downloads";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "downloads" || stored === "share" || stored === "both") {
    return stored;
  }
  return "downloads";
}

export function setExportDestination(value: ExportDestination) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
}
