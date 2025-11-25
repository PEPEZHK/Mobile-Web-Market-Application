import { createExcelBlob, downloadExcelFile, WorksheetData } from "./excel";

export async function convertBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Failed to parse base64 data"));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

type SaveFilePicker = (
  options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }
) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function ensureXlsExtension(fileName: string): string {
  const trimmed = fileName?.trim() || "export.xls";
  return trimmed.toLowerCase().endsWith(".xls") ? trimmed : `${trimmed}.xls`;
}

export async function saveExcelWeb(
  fileName: string,
  sheets: WorksheetData[]
): Promise<void> {
  const safeName = ensureXlsExtension(fileName);
  const blob = createExcelBlob(sheets);
  if (!blob) throw new Error("No data to export");

  if (typeof window === "undefined") {
    throw new Error("saveExcelWeb can only run in a browser environment");
  }

  const picker: SaveFilePicker | undefined =
    "showSaveFilePicker" in window
      ? (window.showSaveFilePicker as SaveFilePicker)
      : undefined;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: safeName,
        types: [
          {
            description: "Excel",
            accept: { "application/vnd.ms-excel": [".xls"] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      console.warn(
        "[saveExcelWeb] showSaveFilePicker failed, falling back to download",
        error
      );
    }
  }

  // Fallback to a simple download link
  downloadExcelFile(safeName, sheets);
}

