// src/server.js — agent-inbox HTTP server (zero-dependency Node).
// Endpoints:
//   GET  /health                          -> status
//   GET  /handle/:address                 -> derived agentic handle (free)
//   POST /inbox/:handle/deliver           -> deliver an inbound message (from upstream mailbox/webhook)
//   GET  /inbox/:handle/messages          -> list messages
//   GET  /inbox/:handle/verifications     -> list auto-detected verification links
//   POST /inbox/:handle/verify/:verifyId  -> process a verification (x402-gated in live mode)
//   GET  /pay/:address                    -> x402 payment requirements for a handle's payline
import http from "node:http";
import { Inbox, scanVerificationLinks } from "./inbox.js";
import { handleForAddress } from "./address.js";
import { gatePayment, paymentRequirements } from "./x402.js";

const PORT = parseInt(process.env.PORT || "3411", 10);
const inbox = new Inbox(); // SECURITY: reads VERIFY_DOMAIN_ALLOWLIST env; if unset, link-scanning is OFF.

function send(res, status, obj, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(obj, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const method = req.method;
  const path = url.pathname;

  if (method === "GET" && path === "/health") {
    return send(res, 200, { ok: true, service: "agent-inbox", version: "0.1.0", paymentMode: process.env.PAYMENT_MODE || process.env.X402_MODE || "mock", network: process.env.X402_NETWORK || "eip155:8453" });
  }

  // Derive a handle from a wallet address — THE core trick. Free and stateless.
  if (method === "GET" && path.startsWith("/handle/")) {
    const address = decodeURIComponent(path.slice("/handle/".length));
    try {
      return send(res, 200, { ...handleForAddress(address), fingerprint: (await import("./address.js")).handleFingerprint(handleForAddress(address).handle) });
    } catch (err) {
      return send(res, 400, { error: String(err.message || err) });
    }
  }

  // Deliver an inbound message to a handle's inbox.
  if (method === "POST" && path.startsWith("/inbox/") && path.endsWith("/deliver")) {
    const handle = decodeURIComponent(path.slice("/inbox/".length, -"/deliver".length));
    let body = "";
    for await (const chunk of req) body += chunk;
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch { return send(res, 400, { error: "invalid JSON" }); }
    const result = inbox.deliver(handle, {
      from: payload.from, subject: payload.subject, text: payload.text, html: payload.html,
    });
    return send(res, 201, result);
  }

  // List messages / verifications.
  if (method === "GET" && path.startsWith("/inbox/") && path.endsWith("/messages")) {
    const handle = decodeURIComponent(path.slice("/inbox/".length, -"/messages".length));
    return send(res, 200, { handle, messages: inbox.listMessages(handle) });
  }
  if (method === "GET" && path.startsWith("/inbox/") && path.endsWith("/verifications")) {
    const handle = decodeURIComponent(path.slice("/inbox/".length, -"/verifications".length));
    return send(res, 200, { handle, verifications: inbox.listVerifications(handle) });
  }

  // Process a verification — the money moment: x402-gated in live mode.
  const verifyMatch = path.match(/^\/inbox\/(.+)\/verify\/([^/]+)$/);
  if (method === "POST" && verifyMatch) {
    const [, handle, verifyId] = verifyMatch.map(decodeURIComponent);
    let gate = await gatePayment(req, url.toString(), process.env);
    if (!gate.paid) {
      res.writeHead(gate.status, gate.headers);
      res.end(gate.body);
      return;
    }
    const result = inbox.processVerification(handle, verifyId);
    const status = result.ok ? 200 : 404;
    return send(res, status, { ...result, payment: gate.mode ? { mode: gate.mode } : { txHash: gate.txHash } });
  }

  // Payment requirements for a handle's payline.
  if (method === "GET" && path.startsWith("/pay/")) {
    const address = decodeURIComponent(path.slice("/pay/".length));
    return send(res, 200, { address, payTo: process.env.X402_PAY_TO || "0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA", requirements: paymentRequirements(url.toString(), process.env) });
  }

  return send(res, 404, { error: "not found", endpoints: ["/health", "/handle/:address", "/inbox/:handle/deliver", "/inbox/:handle/messages", "/inbox/:handle/verifications", "/inbox/:handle/verify/:id", "/pay/:address"] });
});

server.listen(PORT, () => console.log(`agent-inbox listening on :${PORT}`));