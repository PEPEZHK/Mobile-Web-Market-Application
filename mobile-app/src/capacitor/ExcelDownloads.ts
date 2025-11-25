import { registerPlugin } from "@capacitor/core";

export interface SaveToDownloadsOptions {
  fileName: string;
  base64: string;
  mimeType: string;
}

export interface SaveToDownloadsResult {
  uri: string;
  fileName: string;
  mimeType: string;
}

export interface ExcelDownloadsPlugin {
  saveToDownloads(
    options: SaveToDownloadsOptions
  ): Promise<SaveToDownloadsResult>;
}

export const ExcelDownloads = registerPlugin<ExcelDownloadsPlugin>(
  "ExcelDownloads",
  {
    web: () => ({
      async saveToDownloads() {
        throw new Error("ExcelDownloads.saveToDownloads is not available on web");
      },
    }),
  }
);
