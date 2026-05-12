import { useRef, useState } from "react";
import { Loader2, ImagePlus, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/queryClient";

interface Props {
  entityType: "sku" | "ingredient";
  entityId: number;
  currentPhotoUrl: string | null | undefined;
  currentPhotoContentType?: string | null;
  onUpdate: () => void;
}

const ACCEPTED = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

export function PhotoUpload({ entityType, entityId, currentPhotoUrl, currentPhotoContentType, onUpdate }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // fallback for old uploads where contentType wasn't stored
  const [imgLoadFailed, setImgLoadFailed] = useState(false);

  const servingUrl = currentPhotoUrl ? getApiUrl(`/storage${currentPhotoUrl}`) : null;
  const isImage = currentPhotoContentType
    ? currentPhotoContentType.startsWith("image/")
    : !imgLoadFailed;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      const urlRes = await fetch(getApiUrl("/storage/uploads/request-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const patchRes = await fetch(getApiUrl(`/${entityType}s/${entityId}/photo`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath, contentType: file.type }),
      });
      if (!patchRes.ok) throw new Error("Failed to save photo reference");

      setImgLoadFailed(false);
      onUpdate();
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
      setImgLoadFailed(false);
      onUpdate();
      toast({ title: "Photo removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove photo" });
    }
  }

  return (
    <div className="space-y-2">
      {servingUrl ? (
        <div className="relative group w-full">
          {isImage ? (
            <img
              src={servingUrl}
              alt="Photo"
              className="w-full h-44 object-cover rounded-lg border bg-muted"
              onError={() => setImgLoadFailed(true)}
            />
          ) : (
            <a
              href={servingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center w-full h-44 border-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors gap-2"
            >
              <FileText className="w-8 h-8 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">View file</span>
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
          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 hover:bg-muted/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">Add photo</span>
              <span className="text-xs text-muted-foreground/60 mt-0.5">JPG · PNG · PDF</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFileChange} />
    </div>
  );
}
