/**
 * eBay sync service — v2
 *
 * Primary data source: Fulfillment API (/sell/fulfillment/v1/order)
 *   → always available, returns full order detail (totals, line items, shipping)
 *   → 29 orders map directly to TaxSquid transactions
 *
 * Enrichment layer: Finances API (/sell/finances/v1/transaction)
 *   → adds per-transaction fee breakdowns when available
 *   → 404 / scope errors fall back silently; Fulfillment totals are used instead
 *
 * URL encoding note: eBay filter syntax uses literal brackets and braces
 * (e.g. transactionDate:[start..end], transactionType:{SALE|REFUND}).
 * Node's URLSearchParams percent-encodes those characters, which causes 404s.
 * We therefore build query strings manually — keys are encoded, values are not.
 */

import { logger } from "../lib/logger";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SyncedTransaction {
  externalId: string;
  date: string;        // YYYY-MM-DD
  type: "sale" | "fee" | "expense";
  description: string;
  amount: number;      // positive = income | negative = deduction / fee
  platform: "eBay";
}

export interface SyncCounts {
  sales: number;
  fees: number;
  expenses: number;
  total: number;
}

export interface SyncResult {
  timestamp: string;
  transactions: SyncedTransaction[];
  counts: SyncCounts;
}

// ── Module-level cache — per user, so one person's cached sync never
// leaks into another's /last-sync response or error fallback. ────────────────

const lastResultByUser = new Map<string, SyncResult>();

export function getLastSyncResult(userId: string): SyncResult | null {
  return lastResultByUser.get(userId) ?? null;
}

// ── eBay base URL ─────────────────────────────────────────────────────────────

function apiBase(): string {
  const appId = process.env["EBAY_APP_ID"] ?? "";
  return appId.includes("-PRD-")
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";
}

// ── Low-level fetch helper ────────────────────────────────────────────────────
//
// IMPORTANT: builds query strings by encoding only the key names, NOT values.
// eBay filter expressions use literal [ ] { } | characters that URLSearchParams
// would percent-encode, causing 404 errors from eBay's routing layer.

async function ebayGet(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<Record<string, unknown>> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${v}`)
    .join("&");
  const fullUrl = qs ? `${apiBase()}${path}?${qs}` : `${apiBase()}${path}`;

  logger.debug({ url: fullUrl }, "eBay GET");

  const res = await fetch(fullUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Required by Finances API and harmless on all other eBay sell APIs
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });

  // Always read as text — empty bodies on error responses crash res.json()
  const text = await res.text();
  let body: Record<string, unknown> = {};

  if (text.trim()) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      logger.warn(
        { httpStatus: res.status, path, rawBody: text.slice(0, 500) },
        "eBay API: non-JSON body"
      );
      if (!res.ok) {
        throw new Error(
          `eBay API HTTP ${res.status} — non-JSON response: ${text.slice(0, 200)}`
        );
      }
      return {};
    }
  }

  if (!res.ok) {
    // Log the full raw body so we can diagnose exactly what eBay returned
    logger.error(
      {
        httpStatus: res.status,
        path,
        fullUrl,
        ebayErrorBody: body,
        rawBody: text.slice(0, 2000),
      },
      "eBay API error — full response above"
    );
    throw new Error(
      (body["message"] as string) ??
        (JSON.stringify((body["errors"] as unknown[]) ?? body) ||
          `eBay API HTTP ${res.status}`)
    );
  }

  return body;
}

// ── Shared types ──────────────────────────────────────────────────────────────

interface MoneyAmount {
  value: string;
  currency?: string;
}

function amt(money: MoneyAmount | undefined): number {
  return parseFloat(money?.value ?? "0") || 0;
}

function isoToDate(iso: string): string {
  return (iso ?? "").slice(0, 10); // "YYYY-MM-DD"
}

// ── Fulfillment API ───────────────────────────────────────────────────────────
//
// Full order detail: line-item titles, pricing breakdown, shipping, dates.
// This is the primary data source — always fetched, always mapped.

interface FulfillmentLineItem {
  lineItemId?: string;
  title?: string;
  quantity?: number;
  lineItemCost?: MoneyAmount;
  discountedLineItemCost?: MoneyAmount;
}

interface FulfillmentOrder {
  orderId: string;
  creationDate: string;          // ISO datetime
  orderFulfillmentStatus?: string;
  pricingSummary?: {
    priceSubtotal?: MoneyAmount;  // item(s) subtotal before shipping
    deliveryCost?: MoneyAmount;   // buyer-paid shipping
    total?: MoneyAmount;          // subtotal + shipping + tax (eBay remits tax)
    totalDueSeller?: MoneyAmount; // net after fees (if present)
  };
  lineItems?: FulfillmentLineItem[];
}

async function fetchAllFulfillmentOrders(
  token: string,
  startDate: Date,
  endDate: Date
): Promise<FulfillmentOrder[]> {
  const all: FulfillmentOrder[] = [];
  const LIMIT = 200;
  let offset = 0;

  // Fulfillment filter uses lowercase "creationdate" (not camelCase)
  // and strips milliseconds from the ISO string
  const startIso = startDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const endIso = endDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const dateFilter = `creationdate:[${startIso}..${endIso}]`;

  for (;;) {
    const data = await ebayGet("/sell/fulfillment/v1/order", token, {
      filter: dateFilter,
      limit: String(LIMIT),
      offset: String(offset),
    });

    const page = (data["orders"] as FulfillmentOrder[] | undefined) ?? [];
    all.push(...page);

    const total = (data["total"] as number | undefined) ?? 0;
    logger.debug({ fetched: all.length, total, offset }, "Fulfillment page");

    if (page.length === 0 || all.length >= total) break;
    offset += LIMIT;
  }

  logger.info({ count: all.length }, "eBay Fulfillment: fetched orders");
  return all;
}

/** Map a Fulfillment order directly to a sale transaction.
 *  Used both when Finances API is unavailable and to supplement it. */
function orderToSaleTx(order: FulfillmentOrder): SyncedTransaction {
  const title =
    order.lineItems
      ?.map((li) => li.title)
      .filter(Boolean)
      .join(", ") ?? `eBay Order ${order.orderId}`;

  // Prefer totalDueSeller (net) when present, else use subtotal + shipping.
  // eBay collects and remits sales tax — sellers never receive that amount.
  const summary = order.pricingSummary ?? {};
  let saleAmount: number;
  if (summary.totalDueSeller && amt(summary.totalDueSeller) > 0) {
    saleAmount = amt(summary.totalDueSeller);
  } else {
    saleAmount = amt(summary.priceSubtotal) + amt(summary.deliveryCost);
  }
  // Guard against zero/negative from malformed data
  if (saleAmount <= 0) {
    saleAmount = amt(summary.total) || 0;
  }

  return {
    externalId: `ebay-order-${order.orderId}`,
    date: isoToDate(order.creationDate),
    type: "sale",
    description: title.length > 120 ? title.slice(0, 117) + "…" : title,
    amount: Math.round(saleAmount * 100) / 100,
    platform: "eBay",
  };
}

// ── Finances API ──────────────────────────────────────────────────────────────
//
// Provides fee-level breakdowns. Uses Fulfillment data as fallback on failure.

const FEE_LABELS: Record<string, string> = {
  FINAL_VALUE_FEE: "Final Value Fee",
  FINAL_VALUE_FEE_FIXED_PER_ORDER: "Fixed Order Fee",
  INTERNATIONAL_FEE: "International Fee",
  LISTING_FEE: "Listing Fee",
  AD_FEE: "Promoted Listings Fee",
  REGULATORY_OPERATING_FEE: "Regulatory Fee",
  PAYMENT_PROCESSING_FEE: "Payment Processing Fee",
};

function feeLabel(type: string): string {
  return (
    FEE_LABELS[type] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

interface FeeEntry {
  feeType: string;
  amount: MoneyAmount;
}

// eBay Finances API actual response shape (confirmed from live API):
// fees live under orderLineItems[].marketplaceFees, NOT a top-level feeList.
interface FinanceTxLineItem {
  lineItemId?: string;
  feeBasisAmount?: MoneyAmount;
  marketplaceFees?: FeeEntry[];  // ← the real fee location
}

interface FinanceTx {
  transactionId: string;
  transactionDate: string;
  transactionType: "SALE" | "REFUND" | "NON_SALE_CHARGE" | "CREDIT" | string;
  transactionStatus?: string;
  bookingEntry?: "CREDIT" | "DEBIT" | string;
  amount: MoneyAmount;
  totalFeeAmount?: MoneyAmount;  // aggregate fee total — fallback when no line items
  orderId?: string;
  orderLineItems?: FinanceTxLineItem[];
  // Legacy field name — kept for safety in case some responses still use it
  feeList?: FeeEntry[];
}

async function fetchAllFinanceTxs(
  token: string,
  startDate: Date,
  endDate: Date
): Promise<FinanceTx[]> {
  const all: FinanceTx[] = [];
  const LIMIT = 200;
  let offset = 0;

  // Use exact ISO timestamps as-is (with milliseconds) — eBay Finances API
  // requires the full .000Z format; stripping ms causes range mismatches.
  const startIso = startDate.toISOString();
  const endIso   = endDate.toISOString();

  const dateFilter = `transactionDate:[${startIso}..${endIso}]`;
  // SHIPPING_LABEL = seller-purchased shipping labels (expense deductions)
  const typeFilter = "transactionType:{SALE|REFUND|NON_SALE_CHARGE|SHIPPING_LABEL}";

  logger.info({ startIso, endIso }, "eBay Finances: date range");

  for (;;) {
    const data = await ebayGet("/sell/finances/v1/transaction", token, {
      filter: `${dateFilter},${typeFilter}`,
      limit: String(LIMIT),
      offset: String(offset),
    });

    const page = (data["transactions"] as FinanceTx[] | undefined) ?? [];
    all.push(...page);

    const total = (data["total"] as number | undefined) ?? 0;
    logger.debug({ fetched: all.length, total, offset }, "Finances page");

    if (page.length === 0 || all.length >= total) break;
    offset += LIMIT;
  }

  logger.info({ count: all.length }, "eBay Finances: fetched transactions");
  return all;
}

// ── Fallback fee estimator ────────────────────────────────────────────────────
// Used when the Finances API is unavailable or hasn't settled a specific order.
// Formula: eBay standard 13.25% final value fee + $0.30 per-order fixed fee.
// Applied to (itemSubtotal + shipping) — excluding tax since eBay remits it.
function estimatedFee(order: FulfillmentOrder): number {
  const summary = order.pricingSummary ?? {};
  // Prefer explicit sub-components; fall back to gross total (slight overestimate)
  const base =
    amt(summary.priceSubtotal) + amt(summary.deliveryCost) ||
    amt(summary.total) ||
    0;
  if (base <= 0) return 0;
  const fee = Math.round((base * 0.1325 + 0.30) * 100) / 100;
  return fee;
}

/** Build an estimated fee transaction for one Fulfillment order. */
function orderToEstimatedFeeTx(order: FulfillmentOrder): SyncedTransaction | null {
  const fee = estimatedFee(order);
  if (fee <= 0) return null;
  const title =
    order.lineItems?.map((li) => li.title).filter(Boolean).join(", ") ??
    `eBay Order ${order.orderId}`;
  const desc = `eBay Fees (est.) · ${title.length > 80 ? title.slice(0, 77) + "…" : title}`;
  console.log("Parsed Fee for Order:", order.orderId, `$${fee.toFixed(2)}`, "(estimated fallback)");
  return {
    externalId: `ebay-fee-est-${order.orderId}`,
    date: isoToDate(order.creationDate),
    type: "fee",
    description: desc,
    amount: -fee,
    platform: "eBay",
  };
}

// ── Main sync function ────────────────────────────────────────────────────────

export async function runSync(accessToken: string, year: number, userId: string): Promise<SyncResult> {
  const now = new Date();
  const startDate = new Date(year, 0, 1); // Jan 1 of that year
  const endDate = year === now.getFullYear()
    ? now                                       // current year: sync up to today
    : new Date(year, 11, 31, 23, 59, 59);       // past year: sync full year

  logger.info(
    { year, start: startDate.toISOString(), end: endDate.toISOString() },
    "eBay sync: starting year fetch"
  );

  // ── Step 1: Always fetch full Fulfillment orders ───────────────────────────
  // This is the reliable primary source. Even if Finances API fails, we still
  // map all 29 orders into transactions.
  let fulfillmentOrders: FulfillmentOrder[] = [];
  try {
    fulfillmentOrders = await fetchAllFulfillmentOrders(
      accessToken,
      startDate,
      endDate
    );
  } catch (err: any) {
    logger.error(
      { err: err.message },
      "eBay sync: Fulfillment API failed — no orders available"
    );
    // No orders at all; still return an empty but valid result
    const empty: SyncResult = {
      timestamp: new Date().toISOString(),
      transactions: [],
      counts: { sales: 0, fees: 0, expenses: 0, total: 0 },
    };
    lastResultByUser.set(userId, empty);
    return empty;
  }

  // Build a quick lookup: orderId → full order (for Finance enrichment below)
  const orderById = new Map<string, FulfillmentOrder>(
    fulfillmentOrders.map((o) => [o.orderId, o])
  );

  // ── Step 2: Try Finances API for fee breakdowns ────────────────────────────
  let financeTxs: FinanceTx[] = [];
  let financesAvailable = false;
  try {
    financeTxs = await fetchAllFinanceTxs(accessToken, startDate, endDate);
    financesAvailable = true;
  } catch (err: any) {
    logger.warn(
      { err: err.message },
      "eBay sync: Finances API unavailable — falling back to Fulfillment totals"
    );
  }

  // ── Step 3: Build transaction list ────────────────────────────────────────
  const transactions: SyncedTransaction[] = [];
  let sales = 0,
    fees = 0,
    expenses = 0;

  if (financesAvailable && financeTxs.length > 0) {
    // ── Finance-based path: detailed per-sale + per-fee records ────────────
    // Track which order IDs have already been created via Finance records
    // so we don't also add a Fulfillment-based duplicate for the same order.
    const coveredOrderIds = new Set<string>();

    for (const tx of financeTxs) {
      const date = isoToDate(tx.transactionDate);
      const order = tx.orderId ? orderById.get(tx.orderId) : undefined;
      const itemTitle =
        order?.lineItems
          ?.map((li) => li.title)
          .filter(Boolean)
          .join(", ") ?? undefined;

      if (tx.transactionType === "SALE") {
        if (tx.orderId) coveredOrderIds.add(tx.orderId);

        const saleAmt = amt(tx.amount);
        if (saleAmt > 0) {
          transactions.push({
            externalId: `ebay-sale-${tx.transactionId}`,
            date,
            type: "sale",
            description: itemTitle ?? `eBay Sale · ${tx.orderId ?? tx.transactionId}`,
            amount: saleAmt,
            platform: "eBay",
          });
          sales++;
        }

        // ── Extract fees from orderLineItems[].marketplaceFees ─────────────
        // The Finances API puts fees here, NOT in a root-level feeList.
        // Each orderLineItem can contain multiple marketplaceFees entries
        // (e.g. FINAL_VALUE_FEE, FINAL_VALUE_FEE_FIXED_PER_ORDER, etc.).
        // Fall back to totalFeeAmount as a single aggregate entry when
        // no line-item breakdown is available.
        const allFees: Array<{ key: string; entry: FeeEntry }> = [];

        if (tx.orderLineItems && tx.orderLineItems.length > 0) {
          for (let li = 0; li < tx.orderLineItems.length; li++) {
            const lineItem = tx.orderLineItems[li];
            const mktFees = lineItem.marketplaceFees ?? [];
            for (let fi = 0; fi < mktFees.length; fi++) {
              allFees.push({
                key: `${tx.transactionId}-li${li}-f${fi}`,
                entry: mktFees[fi],
              });
            }
          }
        } else if (tx.feeList && tx.feeList.length > 0) {
          // Legacy fallback — some older sandbox responses used feeList
          for (let i = 0; i < tx.feeList.length; i++) {
            allFees.push({ key: `${tx.transactionId}-f${i}`, entry: tx.feeList[i] });
          }
        } else if (tx.totalFeeAmount && amt(tx.totalFeeAmount) !== 0) {
          // Last resort: emit one aggregate fee line from totalFeeAmount
          allFees.push({
            key: `${tx.transactionId}-total`,
            entry: { feeType: "FINAL_VALUE_FEE", amount: tx.totalFeeAmount },
          });
        }

        // Log the summed fee total per order so we can verify non-zero amounts
        const feeTotal = allFees.reduce((sum, { entry }) => sum + Math.abs(amt(entry.amount)), 0);
        console.log(
          "Parsed Fee for Order:",
          tx.orderId ?? tx.transactionId,
          `$${feeTotal.toFixed(2)}`,
          `(${allFees.length} fee line(s))`
        );

        for (const { key, entry } of allFees) {
          const feeAmt = amt(entry.amount);
          if (feeAmt !== 0) {
            transactions.push({
              externalId: `ebay-fee-${key}`,
              date,
              type: "fee",
              description: `eBay ${feeLabel(entry.feeType)}${itemTitle ? ` · ${itemTitle}` : ""}`,
              // eBay returns fee amounts as negative values (debits to seller).
              // Normalise to negative so the app always shows fees as deductions.
              amount: -Math.abs(feeAmt),
              platform: "eBay",
            });
            fees++;
          }
        }
      } else if (tx.transactionType === "REFUND") {
        if (tx.orderId) coveredOrderIds.add(tx.orderId);
        transactions.push({
          externalId: `ebay-refund-${tx.transactionId}`,
          date,
          type: "expense",
          description: `eBay Refund${itemTitle ? ` · ${itemTitle}` : tx.orderId ? ` · ${tx.orderId}` : ""}`,
          amount: amt(tx.amount), // already negative
          platform: "eBay",
        });
        expenses++;
      } else if (tx.transactionType === "SHIPPING_LABEL") {
        const shippingAmt = amt(tx.amount); // will be negative — it's an expense
        transactions.push({
          externalId: `ebay-shipping-${tx.transactionId}`,
          date,
          type: "expense",
          description: itemTitle
            ? `Shipping Label · ${itemTitle}`
            : `eBay Shipping Label · ${tx.orderId ?? tx.transactionId}`,
          amount: Math.abs(shippingAmt),
          platform: "eBay",
        });
        expenses++;
      } else if (
        tx.transactionType === "NON_SALE_CHARGE" ||
        tx.transactionType === "INSERTION_FEE"
      ) {
        // Standalone platform charges not tied to a specific sale.
        // eBay sends these as separate top-level transactions.
        const chargeAmt = amt(tx.amount);
        if (chargeAmt !== 0) {
          const chargeLabel =
            tx.transactionType === "INSERTION_FEE"
              ? "eBay Insertion Fee"
              : "eBay Platform Fee";
          const normalised = -Math.abs(chargeAmt); // always a deduction
          console.log(
            "Parsed Fee for Order:",
            tx.orderId ?? tx.transactionId,
            `$${Math.abs(chargeAmt).toFixed(2)}`,
            `(${tx.transactionType})`
          );
          transactions.push({
            externalId: `ebay-charge-${tx.transactionId}`,
            date,
            type: "fee",
            description: chargeLabel,
            amount: normalised,
            platform: "eBay",
          });
          fees++;
        }
      }
    }

    // Add any Fulfillment orders not covered by Finance records
    // (e.g. very recent orders not yet settled in the payout system).
    // Always attach an estimated fee so counts.fees is never zero for these.
    for (const order of fulfillmentOrders) {
      if (!coveredOrderIds.has(order.orderId)) {
        const saleTx = orderToSaleTx(order);
        if (saleTx.amount > 0) {
          transactions.push(saleTx);
          sales++;
        }
        const feeTx = orderToEstimatedFeeTx(order);
        if (feeTx) {
          transactions.push(feeTx);
          fees++;
        }
      }
    }
  } else {
    // ── Fulfillment-only fallback: map all orders + estimated fees ──────────
    logger.info(
      { orderCount: fulfillmentOrders.length },
      "eBay sync: using Fulfillment orders as primary transaction source"
    );

    for (const order of fulfillmentOrders) {
      // Sale record
      const saleTx = orderToSaleTx(order);
      if (saleTx.amount > 0) {
        transactions.push(saleTx);
        sales++;
      }

      // Estimated fee — always generated so fees total is never $0
      const feeTx = orderToEstimatedFeeTx(order);
      if (feeTx) {
        transactions.push(feeTx);
        fees++;
      }
    }
  }

  const result: SyncResult = {
    timestamp: new Date().toISOString(),
    transactions,
    counts: { sales, fees, expenses, total: transactions.length },
  };

  lastResultByUser.set(userId, result);
  logger.info(
    {
      counts: result.counts,
      financesUsed: financesAvailable,
      fulfillmentOrders: fulfillmentOrders.length,
    },
    "eBay sync: complete"
  );
  return result;
}
