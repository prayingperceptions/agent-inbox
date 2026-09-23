// Vercel serverless adapter for agent-inbox.
// The core "wallet address -> handle" derivation is stateless and deterministic,
// so it works perfectly serverless. The in-memory inbox is ephemeral per
// invocation (acceptable for demo; durable storage is a documented prod TODO).
import { handleForAddress, handleFingerprint, classifyAddress } from "../src/address.js";

export default function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (path === "/health" || path === "/") {
    res.status(200).json({
      ok: true, service: "agent-inbox", version: "0.1.0",
      paymentMode: process.env.PAYMENT_MODE || process.env.X402_MODE || "mock",
      network: process.env.X402_NETWORK || "eip155:8453",
      note: "serverless demo build: /handle/:address stateless; inbox persistence is a prod TODO",
    });
    return;
  }

  if (path.startsWith("/handle/")) {
    const address = decodeURIComponent(path.slice("/handle/".length));
    try {
      const h = handleForAddress(address);
      res.status(200).json({ ...h, fingerprint: handleFingerprint(h.handle) });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
    return;
  }

  if (path === "/classify") {
    const address = url.searchParams.get("address");
    res.status(200).json({ address, kind: address ? classifyAddress(address).kind : "missing" });
    return;
  }

  res.status(404).json({ error: "not found", endpoints: ["/health", "/handle/:address", "/classify?address=0x…"] });
}