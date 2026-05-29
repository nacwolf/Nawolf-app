import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, skusTable, ingredientsTable, skuProductPhotosTable, skuCertificateFilesTable } from "@workspace/db";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

function isValidObjectPath(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/objects/");
}

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

function resolveType(contentType: unknown, allowed: readonly string[]): string | null {
  return (allowed as readonly string[]).includes(contentType as string)
    ? (contentType as string)
    : null;
}

// ── SKU primary photo ────────────────────────────────────────────────────────

router.patch("/skus/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const [sku] = await db.update(skusTable)
    .set({ photoUrl: objectPath, photoContentType: resolveType(contentType, ALLOWED_PHOTO_TYPES) })
    .where(eq(skusTable.id, id))
    .returning({ photoUrl: skusTable.photoUrl, photoContentType: skusTable.photoContentType });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json(sku);
});

router.delete("/skus/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [sku] = await db.update(skusTable).set({ photoUrl: null, photoContentType: null }).where(eq(skusTable.id, id)).returning({ id: skusTable.id });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json({ success: true });
});

// ── SKU single-file uploads (label, spec sheet, dieline) ─────────────────────

router.patch("/skus/:id/label-file", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType, fileName } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const [sku] = await db.update(skusTable)
    .set({ labelFileUrl: objectPath, labelFileContentType: resolveType(contentType, ALLOWED_DOC_TYPES), labelFileName: fileName ?? null })
    .where(eq(skusTable.id, id)).returning({ labelFileUrl: skusTable.labelFileUrl, labelFileContentType: skusTable.labelFileContentType, labelFileName: skusTable.labelFileName });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json(sku);
});

router.delete("/skus/:id/label-file", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [sku] = await db.update(skusTable).set({ labelFileUrl: null, labelFileContentType: null, labelFileName: null }).where(eq(skusTable.id, id)).returning({ id: skusTable.id });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json({ success: true });
});

router.patch("/skus/:id/spec-sheet", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType, fileName } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const [sku] = await db.update(skusTable)
    .set({ specSheetUrl: objectPath, specSheetContentType: resolveType(contentType, ALLOWED_DOC_TYPES), specSheetFileName: fileName ?? null })
    .where(eq(skusTable.id, id)).returning({ specSheetUrl: skusTable.specSheetUrl, specSheetContentType: skusTable.specSheetContentType, specSheetFileName: skusTable.specSheetFileName });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json(sku);
});

router.delete("/skus/:id/spec-sheet", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [sku] = await db.update(skusTable).set({ specSheetUrl: null, specSheetContentType: null, specSheetFileName: null }).where(eq(skusTable.id, id)).returning({ id: skusTable.id });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json({ success: true });
});

router.patch("/skus/:id/dieline", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType, fileName } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const [sku] = await db.update(skusTable)
    .set({ dielineUrl: objectPath, dielineContentType: resolveType(contentType, ALLOWED_DOC_TYPES), dielineFileName: fileName ?? null })
    .where(eq(skusTable.id, id)).returning({ dielineUrl: skusTable.dielineUrl, dielineContentType: skusTable.dielineContentType, dielineFileName: skusTable.dielineFileName });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json(sku);
});

router.delete("/skus/:id/dieline", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [sku] = await db.update(skusTable).set({ dielineUrl: null, dielineContentType: null, dielineFileName: null }).where(eq(skusTable.id, id)).returning({ id: skusTable.id });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json({ success: true });
});

// ── SKU product photos (multi) ────────────────────────────────────────────────

router.get("/skus/:id/product-photos", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const photos = await db.select().from(skuProductPhotosTable).where(eq(skuProductPhotosTable.skuId, id)).orderBy(skuProductPhotosTable.sortOrder);
  res.json(photos);
});

router.post("/skus/:id/product-photos", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType, fileName } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const auth = getAuth(req);
  const [photo] = await db.insert(skuProductPhotosTable).values({
    skuId: id,
    objectPath,
    contentType: resolveType(contentType, ALLOWED_IMAGE_TYPES),
    fileName: fileName ?? null,
    uploadedBy: auth?.userId ?? null,
  }).returning();
  res.status(201).json(photo);
});

router.delete("/skus/:id/product-photos/:photoId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const photoId = parseInt(req.params.photoId, 10);
  if (isNaN(id) || isNaN(photoId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(skuProductPhotosTable).where(eq(skuProductPhotosTable.id, photoId)).returning();
  if (!deleted || deleted.skuId !== id) { res.status(404).json({ error: "Photo not found" }); return; }
  res.json({ success: true });
});

// ── SKU certificate files (multi) ────────────────────────────────────────────

router.get("/skus/:id/certificate-files", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const files = await db.select().from(skuCertificateFilesTable).where(eq(skuCertificateFilesTable.skuId, id)).orderBy(skuCertificateFilesTable.uploadedAt);
  res.json(files);
});

router.post("/skus/:id/certificate-files", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType, fileName } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const auth = getAuth(req);
  const [file] = await db.insert(skuCertificateFilesTable).values({
    skuId: id,
    objectPath,
    contentType: resolveType(contentType, ALLOWED_DOC_TYPES),
    fileName: fileName ?? null,
    uploadedBy: auth?.userId ?? null,
  }).returning();
  res.status(201).json(file);
});

router.delete("/skus/:id/certificate-files/:fileId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const fileId = parseInt(req.params.fileId, 10);
  if (isNaN(id) || isNaN(fileId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(skuCertificateFilesTable).where(eq(skuCertificateFilesTable.id, fileId)).returning();
  if (!deleted || deleted.skuId !== id) { res.status(404).json({ error: "File not found" }); return; }
  res.json({ success: true });
});

// ── SKU nutrition document ────────────────────────────────────────────────────

router.patch("/skus/:id/nutrition-doc", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const [sku] = await db.update(skusTable)
    .set({ nutritionDocPath: objectPath, nutritionDocContentType: resolveType(contentType, ALLOWED_DOC_TYPES) })
    .where(eq(skusTable.id, id))
    .returning({ nutritionDocPath: skusTable.nutritionDocPath, nutritionDocContentType: skusTable.nutritionDocContentType });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json(sku);
});

router.delete("/skus/:id/nutrition-doc", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [sku] = await db.update(skusTable).set({ nutritionDocPath: null, nutritionDocContentType: null }).where(eq(skusTable.id, id)).returning({ id: skusTable.id });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json({ success: true });
});

// ── Ingredient photo ──────────────────────────────────────────────────────────

router.patch("/ingredients/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType } = req.body;
  if (!isValidObjectPath(objectPath)) { res.status(400).json({ error: "objectPath must start with /objects/" }); return; }
  const [ing] = await db.update(ingredientsTable)
    .set({ photoUrl: objectPath, photoContentType: resolveType(contentType, ALLOWED_PHOTO_TYPES) })
    .where(eq(ingredientsTable.id, id))
    .returning({ photoUrl: ingredientsTable.photoUrl, photoContentType: ingredientsTable.photoContentType });
  if (!ing) { res.status(404).json({ error: "Ingredient not found" }); return; }
  res.json(ing);
});

router.delete("/ingredients/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [ing] = await db.update(ingredientsTable).set({ photoUrl: null, photoContentType: null }).where(eq(ingredientsTable.id, id)).returning({ id: ingredientsTable.id });
  if (!ing) { res.status(404).json({ error: "Ingredient not found" }); return; }
  res.json({ success: true });
});

export default router;
