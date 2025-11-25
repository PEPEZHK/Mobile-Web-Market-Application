import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { createExcelBlob, downloadExcelFile } from "@/lib/excel";

// Same helper you wrote
export async function blobToBase64(blob: Blob): Promise<string> {
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

/**
 * Cross-platform Excel saver:
 * - Native (Capacitor): write to app Documents and open OS share sheet with the file.
 * - Web: use File System Access API if available, otherwise normal download.
 */
export async function saveExcelUsingShareSheet(
  suggestedName: string,
  sheets: Array<{ name: string; rows: Array<Array<string | number>> }>
): Promise<void> {
  const trimmed = suggestedName?.trim() || "export.xls";
  const safeName = trimmed.toLowerCase().endsWith(".xls")
    ? trimmed
    : `${trimmed}.xls`;

  const blob = createExcelBlob(sheets);
  if (!blob) throw new Error("No data to export");

  const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  const isNative = platform === "ios" || platform === "android";
  console.info("[saveExcelUsingShareSheet] platform:", platform);

  // Optional: File System Access API (Chrome/WebView 111+, desktop browsers etc.)
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

  const picker: SaveFilePicker | undefined =
    typeof window !== "undefined" && "showSaveFilePicker" in window
      ? (window.showSaveFilePicker as SaveFilePicker)
      : undefined;

  // === 1) Native path: use Capacitor Filesystem + Share ===
  if (isNative) {
    try {
      // Ask for permissions if supported (Android specific)
      if (typeof Filesystem.requestPermissions === "function") {
        try {
          await Filesystem.requestPermissions();
        } catch (permErr) {
          console.warn("Filesystem permission request failed", permErr);
        }
      }

      const base64 = await blobToBase64(blob);

      // IMPORTANT:
      // - Don't use Directory.ExternalStorage (only Android 9 or below).
      // - Don't force 'Download/' here; just use an app folder.
      const directory = Directory.Documents; // or Directory.Data
      const targetPath = `exports/${safeName}`; // app-specific subfolder
      console.warn(targetPath);
      await Filesystem.writeFile({
        path: targetPath,
        data: base64,
        directory,
        recursive: true,
      });
      
      console.info("[saveExcelUsingShareSheet] wrote file", {
        directory,
        targetPath,
      });

      const { uri } = await Filesystem.getUri({
        path: targetPath,
        directory,
      });

      console.info("[saveExcelUsingShareSheet] file uri", uri);

      if (uri) {
        // Use `files` for native file sharing (recommended on Android/iOS)
        await Share.share({
          title: "Export Excel",
          text: safeName,
          files: [uri],
          dialogTitle: "Share Excel file",
        });
      }

      return; // Done for native
    } catch (err) {
      console.warn(
        "[saveExcelUsingShareSheet] Capacitor save/share failed, falling back to web flow",
        err
      );
      // Fall through to web flow below
    }
  }

  // === 2) Web path: File System Access API, if available ===
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
      console.info("[saveExcelUsingShareSheet] Saved via showSaveFilePicker");
      return;
    } catch (error) {
      console.warn(
        "[saveExcelUsingShareSheet] showSaveFilePicker failed, falling back to download",
        error
      );
    }
  }

  // === 3) Last fallback: normal browser download ===
  downloadExcelFile(safeName, sheets);
}
