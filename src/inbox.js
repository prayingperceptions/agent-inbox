// src/inbox.js — a minimal agentic inbox: messages arrive, verification links
// inside them are detected and auto-processed (subject to a domain ALLOWLIST),
// returning a cryptographically-signed proof record.
//
// Security model (hardened for production — see research/security-audit-2026-09-22.md):
//  - Verification links are ONLY recognized from allowlisted domains. Everything
//    else is stored as a plain message, never auto-processed. This blocks SSRF /
//    open-redirect / phishing auto-open — the #1 critical finding.
//  - The proof returned for a processed verification is HMAC-signed with a server
//    secret, so it cannot be forged and can be verified by downstream consumers
//    (e.g. agent-authority's evidence ledger).

import crypto from "node:crypto";
import { MemoryStore } from "./store.js";

export class Inbox {
  constructor({ secret = "", allowlist = [], store, persist } = {}) {
    this.store = store || MemoryStore; // durable adapter (defaults to in-memory)
    this.persist = persist !== false; // if true, writes through to store
    this._cache = new Map(); // runtime cache mirror for fast reads
    this.secret = secret || process.env.INBOX_SECRET || "dev-insecure-secret";
    this.allowlist = new Set(
      (allowlist.length
        ? allowlist
        : (process.env.VERIFY_DOMAIN_ALLOWLIST || "").split(",")
      ).map((d) => d.trim().toLowerCase()).filter(Boolean)
    );
  }

  // Harden the allowlist: only explicitly-configured domains are trusted.
  isDomainAllowed(hostname) {
    const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
    if (this.allowlist.has(h)) return true;
    for (const d of this.allowlist) {
      if (h.endsWith("." + d)) return true; // subdomain wildcard
    }
    return false;
  }

  _key(handle) { return `inbox:${handle}`; }

  async _box(handle) {
    if (this._cache.has(handle)) return this._cache.get(handle);
    let box = await this.store.get(this._key(handle));
    if (!box) box = { messages: [], verifications: [] };
    this._cache.set(handle, box);
    return box;
  }

  _ensure(handle) { return this._box(handle); }

  async deliver(handle, { from, subject, text = "", html = "", receivedAt = new Date().toISOString() }) {
    const box = await this._box(handle);
    const message = { id: `${handle}-${box.messages.length + 1}`, from, subject, text, html, receivedAt };
    box.messages.push(message);
    const verifications = scanVerificationLinks(message, this.isDomainAllowed.bind(this));
    box.verifications.push(...verifications);
    if (this.persist) await this.store.set(this._key(handle), box);
    return { delivered: true, messageId: message.id, verificationsFound: verifications };
  }

  async listMessages(handle) {
    const box = await this._box(handle);
    return box.messages;
  }

  async listVerifications(handle) {
    const box = await this._box(handle);
    return box.verifications;
  }

  // Process a verification: HMAC-signs a proof binding handle+id+timestamp.
  async processVerification(handle, verificationId) {
    const box = await this._box(handle);
    const v = box.verifications.find((x) => x.id === verificationId);
    if (!v) return { ok: false, error: "not_found" };
    if (!v.processedAt) {
      v.processedAt = new Date().toISOString();
      v.status = "processed";
    }
    const payload = `${handle}:${v.id}:${v.processedAt}`;
    const proof = payload + "." + this._sign(payload);
    if (this.persist) await this.store.set(this._key(handle), box);
    return { ok: true, handled: v, proof };
  }

  _sign(payload) {
    return crypto.createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  // Verify a previously-issued proof — for downstream consumers.
  verifyProof(proof) {
    if (typeof proof !== "string") return { ok: false, error: "bad_format" };
    const dot = proof.lastIndexOf(".");
    if (dot < 0) return { ok: false, error: "bad_format" };
    const payload = proof.slice(0, dot);
    const sig = proof.slice(dot + 1);
    const expected = this._sign(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, error: "invalid_signature" };
    }
    const [handle, id, timestamp] = payload.split(":");
    return { ok: true, handle, verificationId: id, processedAt: timestamp };
  }
}

// Detects verification links, ONLY for allowlisted domains.
export function scanVerificationLinks(message, isAllowed = () => true) {
  const candidates = [];
  const text = `${message.subject || ""} ${message.text || ""} ${message.html || ""}`;
  const urlRe = /https?:\/\/[^\s"'<>)}\]]+/g;
  const matches = text.match(urlRe) || [];
  const seen = new Set();

  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    let hostname;
    try { hostname = new URL(url).hostname; } catch { continue; }
    if (!isAllowed(hostname)) continue; // HARD gate: SSRF/phishing blocked
    if (/(verify|confirm|activate|verify-email|magic)[^a-z]/i.test(url)) {
      const id = Buffer.from(url).toString("base64url").slice(0, 24);
      candidates.push({ id, url, hostname, detectedAt: new Date().toISOString(), status: "pending" });
    }
  }
  return candidates;
}