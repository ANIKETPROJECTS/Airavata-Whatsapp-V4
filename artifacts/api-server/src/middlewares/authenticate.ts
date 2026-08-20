import { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";
import { UserModel } from "../models/User";

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

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await UserModel.findById(req.user!.userId).select("role").lean();
    if (user?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Unable to verify admin access" });
  }
}

export function requireMasterAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.kind !== "master") {
    res.status(403).json({ error: "Master Admin access required" });
    return;
  }
  next();
}

export function requireActiveUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  UserModel.findById(req.user!.userId)
    .select("active")
    .lean()
    .then((user) => {
      if (!user || user.active === false) {
        res.status(403).json({ error: "This account is inactive" });
        return;
      }
      next();
    })
    .catch(() => res.status(500).json({ error: "Unable to verify account status" }));
}
