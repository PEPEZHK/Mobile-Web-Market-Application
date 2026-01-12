import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { ExcelDownloads } from "@/capacitor/ExcelDownloads";
import { blobToBase64 } from "@/lib/saveExcelUsingShareSheet";

type SaveOptions = {
  /**
   * share  - only open the share sheet
   * save   - only write to a user-visible folder
   * both   - save first, then open the share sheet  (DEFAULT)
   */
  action?: "share" | "save" | "both";
};

function ensureSafeJsonName(fileName: string): string {
  const trimmed = fileName?.trim() || "export";
  const withExtension = trimmed.toLowerCase().endsWith(".json")
    ? trimmed
    : `${trimmed}.json`;

  return withExtension.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function downloadJsonFile(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function saveJsonUsingShareSheet(
  suggestedName: string,
  data: unknown,
  options?: SaveOptions
): Promise<void> {
  const action = options?.action ?? "both";
  const safeName = ensureSafeJsonName(suggestedName);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"

  if (platform === "web") {
    downloadJsonFile(safeName, data);
    return;
  }

  // Native flow
  try {
    const base64 = await blobToBase64(blob);

    // Android: use Downloads plugin for public visibility
    if (platform === "android") {
      try {
        const { uri } = await ExcelDownloads.saveToDownloads({
          fileName: safeName,
          base64,
          mimeType: "application/json",
        });

        if (action === "share" || action === "both") {
          const canShareResult = Share.canShare ? await Share.canShare() : { value: true };
          if (canShareResult && "value" in canShareResult && !canShareResult.value) {
            throw new Error("Share API is not available on this device");
          }

          await Share.share({
            title: "Export JSON",
            text: safeName,
            url: uri,
            dialogTitle: "Share export",
          });
        }
        return;
      } catch (androidErr) {
        console.warn("[saveJsonUsingShareSheet] Android download failed, falling back to FS", androidErr);
      }
    }

    // iOS or Android fallback: Filesystem + Share
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
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
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
          data: json,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        const { uri } = await Filesystem.getUri({
          path: documentsPath,
          directory: Directory.Documents,
        });

        visibleUri = uri ?? visibleUri;
      } catch (saveErr) {
        console.warn("[saveJsonUsingShareSheet] Failed to save visible copy (FS fallback)", saveErr);
      }
    }

    if ((action === "share" || action === "both") && visibleUri) {
      const canShareResult = Share.canShare ? await Share.canShare() : { value: true };
      if (canShareResult && "value" in canShareResult && !canShareResult.value) {
        throw new Error("Share API is not available on this device");
      }

      await Share.share({
        title: "Export JSON",
        text: safeName,
        url: visibleUri,
        dialogTitle: "Share export",
      });
    }
  } catch (err) {
    console.error("[saveJsonUsingShareSheet] Export failed, falling back to browser download", err);
    downloadJsonFile(safeName, data);
  }
}
