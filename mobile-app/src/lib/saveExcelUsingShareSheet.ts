import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { createExcelBlob, downloadExcelFile, WorksheetData } from "@/lib/excel";
import { ExcelDownloads } from "@/capacitor/ExcelDownloads"; // <-- IMPORTANT

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

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function ensureSafeXlsName(fileName: string): string {
  const trimmed = fileName?.trim() || "export";
  const withExtension = trimmed.toLowerCase().endsWith(".xls")
    ? trimmed
    : `${trimmed}.xls`;

  return withExtension.replace(INVALID_FILENAME_CHARS, "_");
}

type SaveOptions = {
  /**
   * share  - only open the share sheet
   * save   - only write to a user-visible folder
   * both   - save first, then open the share sheet  (DEFAULT)
   */
  action?: "share" | "save" | "both";
};

/**
 * Cross-platform Excel saver:
 *
 * WEB (PC + phone browser):
 *   - uses classic download -> goes to Downloads.
 *
 * ANDROID NATIVE:
 *   - uses ExcelDownloads plugin to write into public Downloads
 *   - optionally opens Share sheet (WhatsApp, Gmail, etc.)
 *
 * iOS NATIVE:
 *   - uses Filesystem + Share as before
 */
export async function saveExcelUsingShareSheet(
  suggestedName: string,
  sheets: WorksheetData[],
  options?: SaveOptions
): Promise<void> {
  const action = options?.action ?? "both";
  const safeName = ensureSafeXlsName(suggestedName);
  const blob = createExcelBlob(sheets);
  if (!blob) throw new Error("No data to export");

  const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"

  // WEB (PC or mobile browser) → classic download
  if (platform === "web") {
    console.info("[saveExcelUsingShareSheet] Platform=web, using browser download");
    downloadExcelFile(safeName, sheets);
    return;
  }

  const isNative =
    Capacitor.isNativePlatform?.() ?? (platform === "ios" || platform === "android");

  if (!isNative) {
    console.warn(
      "[saveExcelUsingShareSheet] Not native (fallback), using browser download"
    );
    downloadExcelFile(safeName, sheets);
    return;
  }

  try {
    const base64 = await blobToBase64(blob);

    // === ANDROID: use ExcelDownloads to write into public Downloads ===
    if (platform === "android") {
      try {
        console.info("[saveExcelUsingShareSheet] ANDROID: calling ExcelDownloads.saveToDownloads");
        const { uri } = await ExcelDownloads.saveToDownloads({
          fileName: safeName,
          base64,
          mimeType: "application/vnd.ms-excel",
        });

        console.info("[saveExcelUsingShareSheet] ANDROID: Excel saved to Downloads, uri:", uri);

        if (action === "share" || action === "both") {
          let canShare = true;
          try {
            const res = await Share.canShare();
            canShare = !!res?.value;
          } catch {
            // ignore
          }

          if (canShare) {
            await Share.share({
              title: "Export Excel",
              text: safeName,
              url: uri,
              dialogTitle: "Share Excel file",
            });
          } else {
            console.warn("[saveExcelUsingShareSheet] Share not available on this device");
          }
        }

        return;
      } catch (androidErr) {
        console.error(
          "[saveExcelUsingShareSheet] ExcelDownloads.saveToDownloads failed, falling back to FS",
          androidErr
        );
        // Fall through to iOS/FS logic as a fallback
      }
    }

    // === iOS (and Android fallback) Filesystem + Share ===
    if (typeof Filesystem.requestPermissions === "function") {
      try {
        await Filesystem.requestPermissions();
      } catch (permErr) {
        console.warn("Filesystem permission request failed", permErr);
      }
    }

    const cachePath = `exports/${safeName}`;
    await Filesystem.writeFile({
      path: cachePath,
      data: base64,
      directory: Directory.Cache,
      encoding: "base64",
      recursive: true,
    });

    const { uri: cacheUri } = await Filesystem.getUri({
      path: cachePath,
      directory: Directory.Cache,
    });

    let visibleUri: string | undefined = cacheUri ?? undefined;

    if (action === "save" || action === "both") {
      try {
        const documentsPath = `exports/${safeName}`;
        await Filesystem.writeFile({
          path: documentsPath,
          data: base64,
          directory: Directory.Documents,
          encoding: "base64",
          recursive: true,
        });

        const { uri } = await Filesystem.getUri({
          path: documentsPath,
          directory: Directory.Documents,
        });

        visibleUri = uri ?? visibleUri;
      } catch (saveErr) {
        console.warn(
          "[saveExcelUsingShareSheet] Failed to save visible copy (iOS/FS fallback)",
          saveErr
        );
      }
    }

    if ((action === "share" || action === "both") && visibleUri) {
      let canShare = true;
      try {
        const res = await Share.canShare();
        canShare = !!res?.value;
      } catch {
        // ignore
      }

      if (canShare) {
        await Share.share({
          title: "Export Excel",
          text: safeName,
          url: visibleUri,
          dialogTitle: "Share Excel file",
        });
      } else {
        console.warn("[saveExcelUsingShareSheet] Share not available (fallback branch)");
      }
    }
  } catch (err) {
    console.error(
      "[saveExcelUsingShareSheet] Native save/share failed, falling back to browser download",
      err
    );
    downloadExcelFile(safeName, sheets);
  }
}
