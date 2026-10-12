// ponytail: stand-in for @clerk/express when CLERK_SECRET_KEY is unset (local
// dev without Replit secrets). Aliased in build.mjs, guarded so it never
// applies where the real secret key is set. Upgrade path: set a real key.
import type { RequestHandler } from "express";

export function clerkMiddleware(): RequestHandler {
  return (req, _res, next) => {
    (req as any).auth = () => ({ userId: "dev-user" });
    next();
  };
}

export function getAuth(req: any) {
  return typeof req.auth === "function" ? req.auth() : { userId: "dev-user" };
}
