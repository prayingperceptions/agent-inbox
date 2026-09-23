// src/x402.js — the identity's payline. The handle is not just an inbox; it can
// RECEIVE x402 micropayments, so onboarding and earning collapse into one handle.
// Pay-per-call + pay-per-onboard in one agentic identity.
//
// This is a thin, runtime-agnostic seam. In live mode it talks to an x402
// facilitator (verify/settle). In mock mode it short-circuits so the flow is
// testable with zero setup — same pattern as token-risk-api.

const USDC_BASE_DECIMALS = 6;
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function cfg(env) {
  return {
    mode: env.PAYMENT_MODE || env.X402_MODE || "mock",
    priceUsdc: env.PRICE_USDC || env.X402_PRICE_USDC || "0.005",
    payTo: env.X402_PAY_TO || "0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA",
    facilitatorUrl: env.X402_FACILITATOR_URL || "https://api.cdp.coinbase.com/platform/v2/x402",
    network: env.X402_NETWORK || "eip155:8453",
    asset: env.X402_ASSET || USDC_BASE_MAINNET,
  };
}

export function paymentRequirements(resourceUrl, env) {
  const c = cfg(env);
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: resourceUrl, description: "Agent inbox payline", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: c.network,
        amount: String(Math.round(parseFloat(c.priceUsdc) * 10 ** USDC_BASE_DECIMALS)),
        asset: c.asset,
        payTo: c.payTo,
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", resourceUrl },
      },
    ],
  };
}

// Gate a request that targets a paid handle resource.
export async function gatePayment(req, resourceUrl, env) {
  const c = cfg(env);
  if (c.mode === "mock") return { paid: true, mode: "mock" };

  const paymentHeader = req.headers && (req.headers["x-payment"] || req.headers["X-Payment"]);
  if (!paymentHeader) {
    return {
      paid: false,
      status: 402,
      headers: { "content-type": "application/json", "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequirements(resourceUrl, env))).toString("base64") },
      body: JSON.stringify(paymentRequirements(resourceUrl, env)),
    };
  }

  const body = JSON.stringify({ x402Version: 2, paymentHeader, paymentRequirements: paymentRequirements(resourceUrl, env) });
  const verify = await fetch(`${c.facilitatorUrl}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (!verify.ok) return { paid: false, status: 402, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: `verify HTTP ${verify.status}` }) };
  const v = await verify.json();
  if (!v.isValid) return { paid: false, status: 402, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: v.invalidReason || "invalid payment" }) };

  const settle = await fetch(`${c.facilitatorUrl}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const s = await settle.json();
  if (!s.success) return { paid: false, status: 402, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: s.error || "settlement failed" }) };
  return { paid: true, txHash: s.txHash || null };
}