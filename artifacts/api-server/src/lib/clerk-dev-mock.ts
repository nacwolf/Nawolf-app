// ponytail: stand-in for @clerk/express for local dev. Aliased in build.mjs only
// when CLERK_DEV_MOCK=1. Upgrade path: set a real key.
import type { RequestHandler } from "express";

if (process.env.NODE_ENV === "production") {
  throw new Error("clerk-dev-mock must never run in production: unset CLERK_DEV_MOCK and set CLERK_SECRET_KEY");
}

export function clerkMiddleware(): RequestHandler {
  return (req, _res, next) => {
    (req as any).auth = () => ({ userId: "dev-user", orgId: process.env.DEV_ORG_ID ?? "dev-org" });
    next();
  };
}

export function getAuth(req: any) {
  return typeof req.auth === "function" ? req.auth() : { userId: "dev-user", orgId: process.env.DEV_ORG_ID ?? "dev-org" };
}
