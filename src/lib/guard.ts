// NightDesk guard — TypeSafe System One judgments, server-side only.
// Code owns math/policy; Jev supplies intent + risk judgments. Falls back
// to deterministic rules when no key is configured or the call fails,
// so the demo path never depends on model availability.

import { sessionBadge } from "./rwa";
import type { TruthQuote } from "./rwa";

export type GuardAction = "limit_at_reference" | "alert_at_open" | "market_now" | "explain_only";

export interface GuardVerdict {
  intent: GuardAction | "no_match";
  intentConfidence: number;
  severity: number; // 0 fair → 2 extreme
  severityConfidence: number;
  shouldBlockMarket: number; // 0..1 (Noul)
  staleRisk: number; // 0..1 (Noul)
  action: GuardAction;
  blocked: boolean;
  source: "typesafe" | "fallback";
  usage?: { input_tokens: number; output_tokens: number };
}

export interface GuardMarket {
  ticker: string;
  session: string;
  spread_bps: number | null;
  onchain_price: number | null;
  ref_price: number | null;
  open_state: boolean;
  reason_code: string | null;
}

export function marketOf(q: TruthQuote): GuardMarket {
  return {
    ticker: q.ticker,
    session: sessionBadge(q),
    spread_bps: q.spreadBps != null ? Math.round(q.spreadBps) : null,
    onchain_price: q.onchainPrice,
    ref_price: q.refPrice,
    open_state: q.openState,
    reason_code: q.reasonCode,
  };
}

/** Deterministic fallback: same shape, no model. Conservative after hours. */
export function fallbackGuard(text: string, m: GuardMarket): GuardVerdict {
  const t = text.toLowerCase();
  const spread = m.spread_bps ?? 0;
  const stale = /overnight|weekend|closed|post-market|pre-market/i.test(m.session) || m.ref_price == null;
  const severity = Math.abs(spread) <= 50 ? 0 : Math.abs(spread) <= 150 ? 1 : 2;
  const wantsLimit = /limit|reference|friday|close|don't overpay|dont overpay|not.*pay/i.test(t);
  const wantsAlert = /alert|notify|open|wait|monday/i.test(t);
  const wantsMarket = /market.*now|buy now|immediate|accept/i.test(t) && !wantsLimit;
  const intent: GuardVerdict["intent"] = wantsLimit
    ? "limit_at_reference"
    : wantsAlert
      ? "alert_at_open"
      : wantsMarket
        ? "market_now"
        : stale
          ? "explain_only"
          : "no_match";
  const shouldBlock = stale && Math.abs(spread) > 50 ? 0.85 : 0.15;
  const action: GuardAction =
    intent === "limit_at_reference" || intent === "alert_at_open" || intent === "market_now"
      ? intent
      : shouldBlock > 0.7
        ? "alert_at_open"
        : "explain_only";
  return {
    intent,
    intentConfidence: 0.55,
    severity,
    severityConfidence: 0.55,
    shouldBlockMarket: shouldBlock,
    staleRisk: stale ? 0.9 : 0.1,
    action,
    blocked: shouldBlock > 0.7,
    source: "fallback",
  };
}

const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";

export async function typesafeGuard(text: string, m: GuardMarket, timeoutMs = 9000): Promise<GuardVerdict> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return fallbackGuard(text, m);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(TYPESAFE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: process.env.TYPESAFE_MODEL || "jev-latest",
        state: {
          request: { text },
          market: {
            ticker: m.ticker,
            session: m.session,
            spread_bps: m.spread_bps,
            onchain_price: m.onchain_price,
            ref_price: m.ref_price,
            open_state: m.open_state,
            reason_code: m.reason_code,
          },
          policy: { max_premium_bps_market: 50, require_simulate: true },
        },
        questions: {
          execution_intent: {
            type: "choice",
            instructions: "What does the user want to do about `request.text` given `market`?",
            criteria: {
              market_now: "User explicitly accepts current on-chain price and wants immediate market execution despite premium",
              limit_at_reference: "User wants a limit order pegged to the frozen reference price, not the current premium",
              alert_at_open: "User wants to wait and be notified when the reference market reopens, not trade now",
              explain_only: "User wants an explanation of premium, risks, venues — no execution yet",
              no_match: "Request matches none of the trading intents above",
            },
          },
          premium_severity: {
            type: "score",
            instructions: "How severe is the premium described in `market` for a buyer right now?",
            criteria: [
              "Fair: spread within normal tolerance, market execution acceptable",
              "Elevated: noticeable premium, prefer limit or wait",
              "Extreme: premium so large that market buying now is likely a bad fill",
            ],
          },
          should_block_market: {
            type: "noul",
            instructions: "Given `market.spread_bps` and `market.session`, should code block an immediate market buy?",
            criteria: {
              true: "A market buy now would likely overpay vs frozen reference and should be blocked or redirected",
              false: "Market buy is acceptable or the user explicitly accepted the premium",
            },
          },
          stale_reference_risk: {
            type: "noul",
            instructions: "Does `market` describe a stale-reference situation where on-chain price moves off a frozen reference?",
            criteria: {
              true: "Reference price is frozen/stale while on-chain price moves, creating overpay risk",
              false: "Reference price is fresh and tradable, no staleness risk",
            },
          },
        },
      }),
    });
    if (!res.ok) return fallbackGuard(text, m);
    const data = (await res.json()) as {
      answers?: {
        execution_intent?: { choice?: string; confidence?: number };
        premium_severity?: { score?: number; confidence?: number };
        should_block_market?: { noul?: number };
        stale_reference_risk?: { noul?: number };
      };
      usage?: { input_tokens: number; output_tokens: number };
    };
    const a = data.answers;
    if (!a?.execution_intent?.choice) return fallbackGuard(text, m);
    const rawIntent = a.execution_intent.choice;
    const intent: GuardVerdict["intent"] =
      rawIntent === "market_now" || rawIntent === "limit_at_reference" || rawIntent === "alert_at_open" || rawIntent === "explain_only"
        ? rawIntent
        : "no_match";
    const block = a.should_block_market?.noul ?? 0.5;
    const severity = a.premium_severity?.score ?? 1;
    const action: GuardAction =
      intent === "no_match" || intent === "explain_only" ? (block > 0.7 ? "alert_at_open" : "explain_only") : intent;
    return {
      intent,
      intentConfidence: a.execution_intent.confidence ?? 0.5,
      severity,
      severityConfidence: a.premium_severity?.confidence ?? 0.5,
      shouldBlockMarket: block,
      staleRisk: a.stale_reference_risk?.noul ?? 0.5,
      action,
      blocked: block > 0.7 && intent !== "market_now",
      source: "typesafe",
      usage: data.usage,
    };
  } catch {
    return fallbackGuard(text, m);
  } finally {
    clearTimeout(t);
  }
}
