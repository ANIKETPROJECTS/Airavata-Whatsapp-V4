import { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  // Accept token from Authorization: Bearer header (primary) or cookie (fallback)
  let token: string | undefined;

  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = req.cookies?.["auth_token"] as string | undefined;
  }

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
