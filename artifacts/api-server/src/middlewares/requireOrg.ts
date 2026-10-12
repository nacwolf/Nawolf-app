import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { withOrg } from "@workspace/db";

// Every /api route except health: signed-in user with an active Clerk
// organization. The whole request runs on one DB connection scoped to that org.
export const requireOrg: RequestHandler = (req, res, next) => {
  const { userId, orgId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!orgId) {
    res.status(403).json({ error: "organization_required" });
    return;
  }
  withOrg(orgId, () => new Promise<void>((resolve) => {
    res.once("close", resolve);
    next();
  })).catch(next);
};
