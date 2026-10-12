import { Router, type IRouter, type Request, type Response } from "express";
import { eq, or } from "drizzle-orm";
import { RequestUploadUrlBody } from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError, ObjectTooLargeError, MAX_UPLOAD_BYTES } from "../lib/objectStorage";
import { getAuth } from "@clerk/express";
import { db, ingredientAttachmentsTable, skusTable, ingredientsTable, skuProductPhotosTable, skuCertificateFilesTable, packagingItemsTable } from "@workspace/db";

// Mounted behind requireOrg, so every request has a user and an active org.
const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);

const orgOf = (req: Request) => getAuth(req).orgId as string;

const objectPathOf = (req: Request) => {
  const raw = req.params.path;
  return `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
};

router.post("/storage/uploads/request-url", async (req: Request, res: Response): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  const { name, size, contentType } = parsed.data;
  if (size > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `File is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB` });
    return;
  }

  const objectPath = objectStorageService.newObjectPath(orgOf(req));
  // uploadURL is relative while files are stored by this API (see objectStorage.ts).
  res.json({ uploadURL: objectStorageService.uploadUrl(objectPath), objectPath, metadata: { name, size, contentType } });
});

// The upload URL handed out above. Body is the raw file.
router.put("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  const objectPath = objectPathOf(req);
  if (!objectStorageService.belongsTo(objectPath, orgOf(req))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // express.json() has already consumed JSON bodies; uploads are photos and documents.
  if (req.is("application/json")) {
    res.status(415).json({ error: "JSON files cannot be uploaded" });
    return;
  }

  try {
    await objectStorageService.save(objectPath, req, req.get("content-type") || "application/octet-stream");
    res.status(200).json({ objectPath });
  } catch (error: any) {
    if (error instanceof ObjectTooLargeError) {
      res.status(413).json({ error: error.message });
    } else if (error?.code === "EEXIST") {
      res.status(409).json({ error: "Upload URL already used" });
    } else {
      req.log.error({ err: error }, "Error saving upload");
      res.status(500).json({ error: "Failed to save upload" });
    }
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  const objectPath = objectPathOf(req);
  if (!objectStorageService.belongsTo(objectPath, orgOf(req))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    // Serve only files attached to a record this org can see (rows are RLS-scoped).
    const attached = await Promise.all([
      db.select({ id: ingredientAttachmentsTable.id }).from(ingredientAttachmentsTable)
        .where(eq(ingredientAttachmentsTable.objectPath, objectPath)).limit(1),
      db.select({ id: ingredientsTable.id }).from(ingredientsTable)
        .where(eq(ingredientsTable.photoUrl, objectPath)).limit(1),
      db.select({ id: skusTable.id }).from(skusTable)
        .where(or(
          eq(skusTable.photoUrl, objectPath),
          eq(skusTable.labelFileUrl, objectPath),
          eq(skusTable.specSheetUrl, objectPath),
          eq(skusTable.dielineUrl, objectPath),
          eq(skusTable.nutritionDocPath, objectPath),
        )).limit(1),
      db.select({ id: skuProductPhotosTable.id }).from(skuProductPhotosTable)
        .where(eq(skuProductPhotosTable.objectPath, objectPath)).limit(1),
      db.select({ id: skuCertificateFilesTable.id }).from(skuCertificateFilesTable)
        .where(eq(skuCertificateFilesTable.objectPath, objectPath)).limit(1),
      db.select({ id: packagingItemsTable.id }).from(packagingItemsTable)
        .where(or(
          eq(packagingItemsTable.photoObjectPath, objectPath),
          eq(packagingItemsTable.quotationObjectPath, objectPath),
          eq(packagingItemsTable.specDocObjectPath, objectPath),
        )).limit(1),
    ]);
    if (!attached.some((rows) => rows.length > 0)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const obj = await objectStorageService.open(objectPath);
    // The stored type is whatever the uploader claimed. Only show known-safe
    // types inline; anything else (HTML, SVG, ...) downloads, so an uploaded
    // file can never run script on this origin.
    const inline = INLINE_TYPES.has(obj.contentType.toLowerCase());
    res.setHeader("Content-Type", inline ? obj.contentType : "application/octet-stream");
    res.setHeader("Content-Disposition", inline ? "inline" : "attachment");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    res.setHeader("Content-Length", String(obj.size));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    obj.stream.pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
