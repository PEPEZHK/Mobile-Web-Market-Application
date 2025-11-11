import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportDatabaseAsJSON, importDatabaseFromJSON } from "@/lib/db";
import { Download, Upload, Database } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

export default function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      const jsonData = exportDatabaseAsJSON();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `magazin-proekt-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Database exported successfully");
    } catch (error) {
      toast.error("Failed to export database");
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
        toast.success("Database imported successfully. Reloading...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error("Failed to import database");
      }
    } catch (error) {
      toast.error("Failed to read file");
      console.error(error);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Layout title="Settings & Data">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Database Backup</h2>
              <p className="text-sm text-muted-foreground">
                Export and import your data
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Button onClick={handleExport} className="w-full" size="lg">
              <Download className="h-5 w-5 mr-2" />
              Export Database as JSON
            </Button>

            <Button 
              onClick={handleImport} 
              variant="outline" 
              className="w-full" 
              size="lg"
            >
              <Upload className="h-5 w-5 mr-2" />
              Import Database from JSON
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
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> All data is stored locally in your browser. 
              Use export to create backups and import to restore data on another device.
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-2">About</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>App:</strong> Magazin Proekt</p>
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Storage:</strong> Local SQLite (Offline-First)</p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
