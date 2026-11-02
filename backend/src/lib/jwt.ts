import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  id: string;
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === "string" || !decoded || typeof decoded.id !== "string" || typeof decoded.role !== "string") {
    throw new Error("Invalid access token payload");
  }

  return { id: decoded.id, role: decoded.role };
}
