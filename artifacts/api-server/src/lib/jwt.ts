import jwt from "jsonwebtoken";

const SECRET = process.env["SESSION_SECRET"];
if (!SECRET) throw new Error("SESSION_SECRET environment variable is required");

export interface JwtPayload {
  userId: string;
  email: string;
  kind?: "user" | "master";
}

const EXPIRY = "7d";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET!, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET!) as JwtPayload;
}
