import { Router, Response } from "express";
import { logger } from "../lib/logger";
import { runSync, getLastSyncResult } from "../services/ebaySync";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  getTokens,
  saveTokens,
  deleteTokens,
  hasValidTokens,
  EbayTokens,
} from "../services/ebayTokens";
import { requireUser, AuthedRequest } from "../middleware/requireUser";

const router: Router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireCredentials() {
  const appId = process.env["EBAY_APP_ID"];
  const certId = process.env["EBAY_CERT_ID"];
  const ruName = process.env["EBAY_RUNAME"];
  if (!appId || !certId || !ruName) {
    throw new Error(
      "Missing eBay credentials — EBAY_APP_ID, EBAY_CERT_ID, and EBAY_RUNAME must all be set."
    );
  }
  return { appId, certId, ruName };
}

function ebayUrls() {
  const appId = process.env["EBAY_APP_ID"] ?? "";
  const isProd = appId.includes("-PRD-");
  return {
    auth: isProd
      ? "https://auth.ebay.com/oauth2/authorize"
      : "https://auth.sandbox.ebay.com/oauth2/authorize",
    token: isProd
      ? "https://api.ebay.com/identity/v1/oauth2/token"
      : "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
  };
}

// ── GET /api/ebay/login ───────────────────────────────────────────────────────
router.get("/ebay/login", async (req, res) => {
  try {
    const token = req.query["token"] as string | undefined;
    const redirectTo = req.query["redirectTo"] as string | undefined;
    if (!token) {
      return res.status(400).send(callbackPage("Missing Session", "No login session provided.", false));
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).send(callbackPage("Session Expired", "Please sign in again and retry.", false));
    }
    const userId = data.user.id;

    const { appId, ruName } = requireCredentials();
    const { auth } = ebayUrls();

    const scopes = [
      "https://api.ebay.com/oauth/api_scope",
      "https://api.ebay.com/oauth/api_scope/sell.finances",
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
    ].join(" ");

    // Pack userId + redirectTo together — eBay's `state` only holds one string
    const state = Buffer.from(JSON.stringify({ userId, redirectTo })).toString("base64url");

    const params = new URLSearchParams({
      client_id: appId,
      response_type: "code",
      redirect_uri: ruName,
      scope: scopes,
      state,
    });

    const authUrl = `${auth}?${params.toString().replace(/\+/g, "%20")}`;
    logger.info({ userId }, "Redirecting to eBay authorization");
    res.redirect(authUrl);
  } catch (err: any) {
    logger.error({ err: err.message }, "eBay login setup error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/ebay/callback ────────────────────────────────────────────────────
  router.get("/ebay/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<
      string,
      string | undefined
    >;

    // Decode state as early as possible — even on error paths we want the
    // browser to redirect back into the app if we can, rather than getting
    // stuck on a page the person has to manually dismiss.
    let userId: string | undefined;
    let redirectTo: string | undefined;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
        userId = decoded.userId;
        redirectTo = decoded.redirectTo;
      } catch {
        // Malformed state — fall through to the generic error pages below
      }
    }

    if (error) {
      logger.error({ error, error_description }, "eBay denied authorization");
      if (redirectTo) {
        return res.redirect(`${redirectTo}?ebay=error&message=${encodeURIComponent(error_description ?? error)}`);
      }
      return res
        .status(400)
        .send(callbackPage("Authorization Denied", error_description ?? error, false));
    }

    if (!code || !userId) {
      if (redirectTo) {
        return res.redirect(`${redirectTo}?ebay=error&message=${encodeURIComponent("Missing authorization code.")}`);
      }
      return res
        .status(400)
        .send(callbackPage("Missing Data", "No authorization code or session state was returned.", false));
    }

  try {
    const { appId, certId, ruName } = requireCredentials();
    const { token: tokenUrl } = ebayUrls();

    const credentials = Buffer.from(`${appId}:${certId}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ruName,
    });

    logger.info({ tokenUrl, userId }, "Exchanging authorization code for eBay tokens");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      logger.error(
        { httpStatus: response.status, ebayResponse: data },
        "eBay token exchange failed — exact API error above"
      );
      const msg =
        (data["error_description"] as string) ??
        (data["error"] as string) ??
        JSON.stringify(data);
      return res.status(502).send(callbackPage("Connection Failed", msg, false));
    }

    const tokens: EbayTokens = {
      access_token: data["access_token"] as string,
      refresh_token: (data["refresh_token"] as string) ?? "",
      expires_at: Date.now() + ((data["expires_in"] as number) ?? 7200) * 1000,
      token_type: (data["token_type"] as string) ?? "User Access Token",
    };

    await saveTokens(userId, tokens);

    logger.info(
      { userId, token_type: tokens.token_type, expires_at: new Date(tokens.expires_at).toISOString() },
      "eBay tokens stored — triggering post-login background sync"
    );

    const loginYear = new Date().getFullYear();
    setImmediate(async () => {
      try {
        await runSync(tokens.access_token, loginYear, userId);
        logger.info({ userId }, "eBay post-login sync complete");
      } catch (err: any) {
        logger.error({ userId, err: err.message }, "eBay post-login sync failed");
      }
    });

if (redirectTo) {
  return res.redirect(`${redirectTo}?ebay=connected`);
}
return res.send(
  callbackPage(
    "Connected to eBay!",
    "Syncing your last 90 days of transactions in the background. You can close this tab and return to TaxSquid.",
    true
  )
);
} catch (err: any) {
logger.error({ err: err.message, stack: err.stack, userId }, "eBay callback unhandled error");
if (redirectTo) {
  return res.redirect(`${redirectTo}?ebay=error&message=${encodeURIComponent(err.message)}`);
}
return res.status(500).send(callbackPage("Server Error", err.message, false));
}
});

// ── GET /api/ebay/status ──────────────────────────────────────────────────────
router.get("/ebay/status", requireUser, async (req: AuthedRequest, res: Response) => {
  const tokens = await getTokens(req.userId!);
  res.json({
    connected: hasValidTokens(tokens),
    expiresAt: tokens?.expires_at ?? null,
  });
});

// ── POST /api/ebay/disconnect ─────────────────────────────────────────────────
router.post("/ebay/disconnect", requireUser, async (req: AuthedRequest, res: Response) => {
  await deleteTokens(req.userId!);
  logger.info({ userId: req.userId }, "eBay tokens cleared — user disconnected");
  res.json({ disconnected: true });
});

// ── GET /api/ebay/sync ────────────────────────────────────────────────────────
router.get("/ebay/sync", requireUser, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const tokens = await getTokens(userId);
  if (!hasValidTokens(tokens)) {
    return res.status(401).json({
      success: false,
      error: "Not connected to eBay. Please authenticate first.",
    });
  }

  try {
    const yearParam = parseInt((req.query as Record<string, string>).year ?? "", 10);
    const syncYear = !isNaN(yearParam) ? yearParam : new Date().getFullYear();
    logger.info({ syncYear, userId }, "eBay sync: manual trigger");
    const result = await runSync(tokens.access_token, syncYear, userId);
    return res.status(200).json({
      success: true,
      count: result.counts.total,
      timestamp: result.timestamp,
      transactions: result.transactions,
      counts: result.counts,
      feesImported: result.counts.fees,
    });
  } catch (err: any) {
    logger.error({ err: err.message, userId }, "eBay sync: unexpected top-level error");
    const cached = getLastSyncResult(userId);
    return res.status(200).json({
      success: false,
      error: err.message,
      count: cached?.counts.total ?? 0,
      timestamp: cached?.timestamp ?? new Date().toISOString(),
      transactions: cached?.transactions ?? [],
      counts: cached?.counts ?? { sales: 0, fees: 0, expenses: 0, total: 0 },
    });
  }
});

// ── GET /api/ebay/last-sync ───────────────────────────────────────────────────
router.get("/ebay/last-sync", requireUser, (req: AuthedRequest, res: Response) => {
  const result = getLastSyncResult(req.userId!);
  if (!result) {
    return res.json({ synced: false, timestamp: null, counts: null });
  }
  return res.json({
    synced: true,
    timestamp: result.timestamp,
    counts: result.counts,
  });
});

// ── Hourly cron ───────────────────────────────────────────────────────────────
export function startHourlyCron(): void {
  const ONE_HOUR_MS = 60 * 60 * 1000;

  setInterval(async () => {
    const { getAllConnectedUserIds } = await import("../services/ebayTokens");
    const userIds = await getAllConnectedUserIds();
    logger.info({ userCount: userIds.length }, "eBay cron: starting hourly sync sweep");

    for (const userId of userIds) {
      const tokens = await getTokens(userId);
      if (!hasValidTokens(tokens)) continue;
      try {
        const result = await runSync(tokens.access_token, new Date().getFullYear(), userId);
        logger.info({ userId, counts: result.counts }, "eBay cron: user sync complete");
      } catch (err: any) {
        logger.error({ userId, err: err.message }, "eBay cron: user sync failed");
      }
    }
  }, ONE_HOUR_MS);

  logger.info({ intervalMs: ONE_HOUR_MS }, "eBay hourly sync cron started");
}

// ── Callback result HTML page ─────────────────────────────────────────────────
function callbackPage(title: string, message: string, success: boolean): string {
  const accent = success ? "#0ecaa4" : "#ef4444";
  const icon = success ? "✓" : "✕";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — TaxSquid</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0f0f12;color:#e5e5e7;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      min-height:100vh;display:flex;align-items:center;
      justify-content:center;padding:24px}
    .card{background:#1a1a24;border:1px solid #2a2a3a;border-radius:20px;
      padding:48px 32px;text-align:center;max-width:420px;width:100%}
    .icon{width:72px;height:72px;border-radius:50%;background:${accent}22;
      border:2px solid ${accent}55;display:flex;align-items:center;
      justify-content:center;font-size:32px;color:${accent};margin:0 auto 28px}
    .brand{color:${accent};font-weight:700;font-size:11px;letter-spacing:.12em;
      text-transform:uppercase;margin-bottom:10px}
    h1{font-size:22px;font-weight:700;margin-bottom:12px}
    p{font-size:15px;color:#8888aa;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="brand">TaxSquid</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export default router;