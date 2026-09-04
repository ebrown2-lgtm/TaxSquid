// middleware/requireUser.ts
import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing auth token." });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ success: false, error: "Invalid or expired session." });
  }

  req.userId = data.user.id;
  next();
}