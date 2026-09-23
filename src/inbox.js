// src/inbox.js — a minimal agentic inbox: messages arrive, verification links
// inside them are detected and auto-processed, returning a proof record.
//
// Backed by an in-memory store by default; swap for a durable store in prod.
// The inbox can be wired to any readable mailbox provider (the mail.tm-compatible
// API seam below) so agents don't have to open a browser to "verify" anything.

export class Inbox {
  constructor() {
    this.store = new Map(); // handle -> { messages: [], verifications: [] }
  }

  _ensure(handle) {
    if (!this.store.has(handle)) this.store.set(handle, { messages: [], verifications: [] });
    return this.store.get(handle);
  }

  // Deliver an inbound message to a handle's inbox.
  deliver(handle, { from, subject, text = "", html = "", receivedAt = new Date().toISOString() }) {
    const box = this._ensure(handle);
    const message = { id: `${handle}-${box.messages.length + 1}`, from, subject, text, html, receivedAt };
    box.messages.push(message);
    // Auto-scan for verification links right on receive.
    const verifications = scanVerificationLinks(message);
    box.verifications.push(...verifications);
    return { delivered: true, messageId: message.id, verificationsFound: verifications };
  }

  listMessages(handle) {
    const box = this.store.get(handle);
    return (box && box.messages) || [];
  }

  listVerifications(handle) {
    const box = this.store.get(handle);
    return (box && box.verifications) || [];
  }

  // Simulate auto-clicking a verification link: returns a signed-looking proof
  // that the handle processed it. In production this performs the HTTP GET and
  // records the 2xx/3xx result as evidence.
  processVerification(handle, verificationId) {
    const box = this.store.get(handle);
    const v = box && box.verifications.find((x) => x.id === verificationId);
    if (!v) return { ok: false, error: "not_found" };
    v.processedAt = new Date().toISOString();
    v.status = "processed";
    return { ok: true, handled: v, proof: `${handle}:${v.id}:${v.processedAt}` };
  }
}

// Detects verification links in an inbound message. Broad match on common
// token/link patterns (verify|confirm|activate) — in prod, restrict to allowed
// domains to avoid opening arbitrary URLs.
export function scanVerificationLinks(message) {
  const candidates = [];
  const text = `${message.subject || ""} ${message.text || ""} ${message.html || ""}`;

  const urlRe = /https?:\/\/[^\s"'<>)\]]+/g;
  const matches = text.match(urlRe) || [];
  const seen = new Set();

  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    if (/(verify|confirm|activate|verify-email|magic)[^a-z]/i.test(url)) {
      const id = Buffer.from(url).toString("base64url").slice(0, 24);
      candidates.push({ id, url, detectedAt: new Date().toISOString(), status: "pending" });
    }
  }
  return candidates;
}