// routes/account.ts
import { Router, Response } from "express";
import { logger } from "../lib/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireUser, AuthedRequest } from "../middleware/requireUser";

const router: Router = Router();

// ── POST /api/account/delete ──────────────────────────────────────────────────
// Deletes the authenticated user's Supabase auth account. All associated
// data (drives, transactions, inventory_items, user_settings, ebay_tokens)
// is removed automatically via ON DELETE CASCADE foreign keys.
router.post("/account/delete", requireUser, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    logger.info({ userId }, "Account deleted — user requested via app");
    return res.json({ success: true });
  } catch (err: any) {
    logger.error({ userId, err: err.message }, "Account deletion failed");
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;