import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { createExcelBlob, WorksheetData } from "./excel";

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  let i = 0;

  for (i = 0; i + 2 < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    output +=
      BASE64_ALPHABET[(chunk >> 18) & 63] +
      BASE64_ALPHABET[(chunk >> 12) & 63] +
      BASE64_ALPHABET[(chunk >> 6) & 63] +
      BASE64_ALPHABET[chunk & 63];
  }

  if (i < bytes.length) {
    const remaining = bytes.length - i;
    const chunk =
      remaining === 1
        ? bytes[i] << 16
        : (bytes[i] << 16) | (bytes[i + 1] << 8);

    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];

    if (remaining === 1) {
      output += "==";
    } else {
      output += BASE64_ALPHABET[(chunk >> 6) & 63];
      output += "=";
    }
  }

  return output;
}

export async function convertBlobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return encodeBase64(bytes);
}

function ensureXlsExtension(fileName: string): string {
  const trimmed = fileName?.trim() || "export.xls";
  const safeName = trimmed.toLowerCase().endsWith(".xls")
    ? trimmed
    : `${trimmed}.xls`;
  return safeName.replace(/[\\/]/g, "_");
}

export async function saveExcelMobile(
  fileName: string,
  sheets: WorksheetData[]
): Promise<void> {
  const blob = createExcelBlob(sheets);
  if (!blob) throw new Error("No data to export");

  const base64 = await convertBlobToBase64(blob);
  const safeName = ensureXlsExtension(fileName);
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) throw new Error("No writable directory available");

  const exportDir = `${baseDir}excel-exports`;
  try {
    await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
  } catch (error) {
    // Directory may already exist; ignore
  }

  const fileUri = `${exportDir}/${safeName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device");
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: "application/vnd.ms-excel",
    UTI: "com.microsoft.excel.xls",
    dialogTitle: "Export Excel",
  });
}

export const saveExcel = saveExcelMobile;

