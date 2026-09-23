// src/address.js — derive a readable, stable handle from an EVM or SVM address.
//
// The core idea: the email local-part is DERIVED from a wallet address, so the
// handle is deterministic, verifiable, and owned by whoever holds the key.
// No registration ceremony — the address IS the identity.

// EVM: 0x + 40 hex. SVM: base58, typically 32-44 chars.
export function classifyAddress(addr) {
  if (!addr || typeof addr !== "string") return { kind: "invalid" };
  const a = addr.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return { kind: "evm", address: a.toLowerCase() };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return { kind: "svm", address: a };
  return { kind: "invalid", address: a };
}

// Produce a stable local-part: chain-prefix + first 10 chars + last 6 chars.
// e.g. eip155-833589fcd66-bd02913
export function handleForAddress(addr, networkHint = "base") {
  const { kind, address } = classifyAddress(addr);
  if (kind === "invalid") throw new Error(`Not a valid address: ${addr}`);

  const prefix = networkHint === "solana" || kind === "svm" ? "svm" : `eip155`;
  const core = kind === "evm" ? address.replace(/^0x/, "") : address;
  const local = `${prefix}-${core.slice(0, 10)}-${core.slice(-6)}`;
  return { local, domain: "agents.inbox", handle: `${local}@agents.inbox`, kind, address };
}

// Hash a handle into a checkable fingerprint (for tie-ins with agent-authority
// passports / verifiable evidence).
export function handleFingerprint(handle) {
  const s = String(handle).toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}