import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, skusTable, ingredientsTable } from "@workspace/db";
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

router.patch("/skus/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType } = req.body;
  if (!isValidObjectPath(objectPath)) {
    res.status(400).json({ error: "objectPath must start with /objects/" });
    return;
  }
  const resolvedType = (ALLOWED_PHOTO_TYPES as readonly string[]).includes(contentType)
    ? contentType as string
    : null;
  const [sku] = await db
    .update(skusTable)
    .set({ photoUrl: objectPath, photoContentType: resolvedType })
    .where(eq(skusTable.id, id))
    .returning({ photoUrl: skusTable.photoUrl, photoContentType: skusTable.photoContentType });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json(sku);
});

router.delete("/skus/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [sku] = await db
    .update(skusTable)
    .set({ photoUrl: null, photoContentType: null })
    .where(eq(skusTable.id, id))
    .returning({ id: skusTable.id });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  res.json({ success: true });
});

router.patch("/ingredients/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { objectPath, contentType } = req.body;
  if (!isValidObjectPath(objectPath)) {
    res.status(400).json({ error: "objectPath must start with /objects/" });
    return;
  }
  const resolvedType = (ALLOWED_PHOTO_TYPES as readonly string[]).includes(contentType)
    ? contentType as string
    : null;
  const [ing] = await db
    .update(ingredientsTable)
    .set({ photoUrl: objectPath, photoContentType: resolvedType })
    .where(eq(ingredientsTable.id, id))
    .returning({ photoUrl: ingredientsTable.photoUrl, photoContentType: ingredientsTable.photoContentType });
  if (!ing) { res.status(404).json({ error: "Ingredient not found" }); return; }
  res.json(ing);
});

router.delete("/ingredients/:id/photo", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [ing] = await db
    .update(ingredientsTable)
    .set({ photoUrl: null, photoContentType: null })
    .where(eq(ingredientsTable.id, id))
    .returning({ id: ingredientsTable.id });
  if (!ing) { res.status(404).json({ error: "Ingredient not found" }); return; }
  res.json({ success: true });
});

export default router;
