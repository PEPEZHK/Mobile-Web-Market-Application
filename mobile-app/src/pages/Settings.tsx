import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportDatabaseAsJSON, importDatabaseFromJSON } from "@/lib/db";
import { Download, Upload, Database, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";

export default function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { logout, user } = useAuth();
  const { t } = useTranslation();
  const displayName = user?.nickname ?? t("settings.auth.unknownUser", { defaultValue: "unknown user" });

  const handleExport = async () => {
    try {
      const jsonData = exportDatabaseAsJSON();
      const defaultName = window.prompt(
        t("settings.backup.filenamePrompt", { defaultValue: "Choose a file name for the export" }),
        `magazin-proekt-backup-${new Date().toISOString().split('T')[0]}.json`
      ) || `magazin-proekt-backup-${new Date().toISOString().split('T')[0]}.json`;

      type SaveFilePicker = (options?: {
        suggestedName?: string;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;

      const saveFilePicker: SaveFilePicker | undefined = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

      if (saveFilePicker) {
        try {
          const handle = await saveFilePicker({
            suggestedName: defaultName,
            types: [
              {
                description: "JSON",
                accept: { "application/json": [".json"] }
              }
            ]
          });
          const writable = await handle.createWritable();
          await writable.write(new Blob([jsonData], { type: 'application/json' }));
          await writable.close();
          toast.success(t("settings.toast.exportSuccess"));
          return;
        } catch (pickerError) {
          console.warn("File picker not used, falling back to download", pickerError);
        }
      }

      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("settings.toast.exportSuccess"));
    } catch (error) {
      toast.error(t("settings.toast.exportError"));
      console.error(error);
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const success = importDatabaseFromJSON(text);
      
      if (success) {
        toast.success(t("settings.toast.importSuccess"));
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error(t("settings.toast.importError"));
      }
    } catch (error) {
      toast.error(t("settings.toast.readError"));
      console.error(error);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Layout title={t("settings.title")}>
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{t("settings.backup.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("settings.backup.description")}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Button onClick={handleExport} className="w-full" size="lg">
              <Download className="h-5 w-5 mr-2" />
              {t("settings.backup.export")}
            </Button>

            <Button
              onClick={handleImport}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <Upload className="h-5 w-5 mr-2" />
              {t("settings.backup.import")}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">{t("settings.backup.note")}</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <LogOut className="h-6 w-6 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold">{t("settings.auth.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("settings.auth.description")}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {t("settings.auth.signedInAs", { values: { user: displayName } })}
            </div>
            <Button variant="destructive" className="w-full" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              {t("settings.auth.signOut")}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-2">{t("settings.about.title")}</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>{t("settings.about.app")}:</strong> Magazin Proekt</p>
            <p><strong>{t("settings.about.version")}:</strong> 1.0.0</p>
            <p><strong>{t("settings.about.storage")}:</strong> Local SQLite (Offline-First)</p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
