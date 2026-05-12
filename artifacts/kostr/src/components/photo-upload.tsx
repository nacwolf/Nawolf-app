import { useRef, useState } from "react";
import { Loader2, ImagePlus, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";

interface Props {
  entityType: "sku" | "ingredient";
  entityId: number;
  currentPhotoUrl: string | null | undefined;
  onUpdate: (objectPath: string | null) => void;
}

const ACCEPTED = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

export function PhotoUpload({ entityType, entityId, currentPhotoUrl, onUpdate }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const servingUrl = currentPhotoUrl ? getApiUrl(`/storage${currentPhotoUrl}`) : null;
  const isPdf = currentPhotoUrl?.toLowerCase().includes("pdf") || imgError;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so the same file can be re-selected after a remove
    e.target.value = "";

    setUploading(true);
    try {
      // Step 1: get a presigned upload URL from the backend
      const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: PUT the file directly to object storage
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      // Step 3: save the objectPath on the entity
      const patchRes = await fetch(getApiUrl(`/${entityType}s/${entityId}/photo`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });
      if (!patchRes.ok) throw new Error("Failed to save photo reference");

      setImgError(false);
      onUpdate(objectPath);
      toast({ title: "Photo uploaded" });
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    try {
      const res = await fetch(getApiUrl(`/${entityType}s/${entityId}/photo`), { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove photo");
      onUpdate(null);
      setImgError(false);
      toast({ title: "Photo removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove photo" });
    }
  }

  return (
    <div className="space-y-2">
      {servingUrl ? (
        <div className="relative group w-full">
          {!isPdf ? (
            <img
              src={servingUrl}
              alt="Photo"
              className="w-full h-48 object-cover rounded-lg border bg-muted"
              onError={() => setImgError(true)}
            />
          ) : (
            <a
              href={servingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full h-48 border rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors px-6"
            >
              <FileText className="w-8 h-8 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-muted-foreground">View attached file</span>
            </a>
          )}
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs shadow"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Replace"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 p-0 shadow"
              onClick={handleRemove}
              disabled={uploading}
              title="Remove photo"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/30 rounded-lg hover:border-primary/50 hover:bg-muted/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">Add photo</span>
              <span className="text-xs text-muted-foreground/70 mt-0.5">JPG, PNG, or PDF</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
