import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  message: string;
  saved: number;
  skipped: number;
}

function CloudUploadAnimation({ active }: { active: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={active ? "animate-bounce" : ""}>
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cloud body */}
          <ellipse cx="36" cy="42" rx="26" ry="16" fill="#e0f0ff" stroke="#3b9eed" strokeWidth="2" />
          <ellipse cx="24" cy="38" rx="14" ry="14" fill="#e0f0ff" stroke="#3b9eed" strokeWidth="2" />
          <ellipse cx="46" cy="36" rx="16" ry="16" fill="#e0f0ff" stroke="#3b9eed" strokeWidth="2" />
          {/* Upload arrow */}
          <line x1="36" y1="50" x2="36" y2="30" stroke="#3b9eed" strokeWidth="3" strokeLinecap="round" />
          <polyline points="28,38 36,30 44,38" fill="none" stroke="#3b9eed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* Folder/box at bottom */}
          <rect x="22" y="54" width="28" height="10" rx="2" fill="#f97316" />
          <path d="M22 56 Q28 52 30 54 L36 54" stroke="#f97316" strokeWidth="0" fill="#fb923c" />
          <rect x="22" y="52" width="14" height="4" rx="1" fill="#fb923c" />
        </svg>
      </div>
      {active && (
        <p className="text-xs text-primary font-medium animate-pulse">Processing…</p>
      )}
    </div>
  );
}

export function ImportSalesDataTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/sales/import-archive", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Import failed.");
      } else {
        setResult(data);
        toast({
          title: "Import Successful",
          description: data.message,
          className: "bg-green-50 border-green-200 text-green-800",
        });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err: any) {
      setError(err.message ?? "Unknown error.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Archive Sales Data
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload historical sales records from an Excel file. Each row is upserted into the sales table by Date + Brand No + Size.
          </p>
        </div>
        <a
          href="/sales_import_template.xlsx"
          download="sales_import_template.xlsx"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline flex-shrink-0 ml-4"
          data-testid="link-download-sales-template"
        >
          <Download className="w-4 h-4" />
          Download Sample Template
        </a>
      </div>

      {/* File picker + upload side by side */}
      <div className="flex gap-4 items-stretch">
        {/* Left: file drop zone */}
        <div
          className="flex-1 border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2"
          onClick={() => !isUploading && fileInputRef.current?.click()}
          data-testid="dropzone-import-sales"
        >
          <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
          {selectedFile ? (
            <>
              <p className="font-medium text-foreground text-sm">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB · Click to change</p>
            </>
          ) : (
            <>
              <p className="font-medium text-foreground text-sm">Click to select an Excel file</p>
              <p className="text-xs text-muted-foreground">.xlsx or .xls format only</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-import-sales-file"
          />
        </div>

        {/* Right: animation + button */}
        <div className="flex flex-col items-center justify-center gap-3 px-6 border border-border rounded-xl bg-muted/20 min-w-[140px]">
          <CloudUploadAnimation active={isUploading} />
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            data-testid="button-import-sales-upload"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold"
          >
            {isUploading ? "Importing…" : "Import Data"}
          </Button>
          {selectedFile && !isUploading && (
            <button
              onClick={handleClear}
              className="text-xs text-muted-foreground hover:text-destructive"
              data-testid="button-import-sales-clear"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Result / Error */}
      {result && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Import Complete</p>
            <p className="text-sm mt-0.5">{result.message}</p>
            <div className="flex gap-4 mt-2 text-sm">
              <span><strong>{result.saved}</strong> row(s) saved</span>
              {result.skipped > 0 && <span><strong>{result.skipped}</strong> row(s) skipped</span>}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
          <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Import Failed</p>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border pt-4">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Existing records for the same Brand No + Size + Sale Date will be overwritten. This action is irreversible. Verify data in the Sales page after import.
        </span>
      </div>
    </section>
  );
}
