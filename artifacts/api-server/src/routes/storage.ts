import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getAuth } from "@clerk/express";
import { db, ingredientAttachmentsTable, skusTable, ingredientsTable, skuProductPhotosTable, skuCertificateFilesTable, packagingItemsTable } from "@workspace/db";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function requireAuth(req: Request, res: Response): boolean {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

router.post("/storage/uploads/request-url", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file, { isPublic: true });
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Authorization: objectPath must be registered in one of the known storage tables.
    // Any authenticated user can access stored objects (internal multi-user tool).
    const [attachment, skuPhoto, ingPhoto, skuFile, skuProdPhoto, skuCertFile, packagingPhoto] = await Promise.all([
      db.select({ id: ingredientAttachmentsTable.id })
        .from(ingredientAttachmentsTable)
        .where(eq(ingredientAttachmentsTable.objectPath, objectPath))
        .limit(1),
      db.select({ id: skusTable.id })
        .from(skusTable)
        .where(eq(skusTable.photoUrl, objectPath))
        .limit(1),
      db.select({ id: ingredientsTable.id })
        .from(ingredientsTable)
        .where(eq(ingredientsTable.photoUrl, objectPath))
        .limit(1),
      // SKU single-file uploads (label, spec sheet, dieline) — checked via separate queries below
      Promise.resolve([] as { id: number }[]),
      db.select({ id: skuProductPhotosTable.id })
        .from(skuProductPhotosTable)
        .where(eq(skuProductPhotosTable.objectPath, objectPath))
        .limit(1),
      db.select({ id: skuCertificateFilesTable.id })
        .from(skuCertificateFilesTable)
        .where(eq(skuCertificateFilesTable.objectPath, objectPath))
        .limit(1),
      db.select({ id: packagingItemsTable.id })
        .from(packagingItemsTable)
        .where(eq(packagingItemsTable.photoObjectPath, objectPath))
        .limit(1),
    ]);

    // Also check SKU single-file columns (label, spec sheet, dieline, nutrition doc)
    const [skuLabelFile, skuSpecFile, skuDielineFile, skuNutritionDoc] = await Promise.all([
      db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.labelFileUrl, objectPath)).limit(1),
      db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.specSheetUrl, objectPath)).limit(1),
      db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.dielineUrl, objectPath)).limit(1),
      db.select({ id: skusTable.id }).from(skusTable).where(eq(skusTable.nutritionDocPath, objectPath)).limit(1),
    ]);

    if (!attachment[0] && !skuPhoto[0] && !ingPhoto[0] && !skuLabelFile[0] && !skuSpecFile[0] && !skuDielineFile[0] && !skuNutritionDoc[0] && !skuProdPhoto[0] && !skuCertFile[0] && !packagingPhoto[0]) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
