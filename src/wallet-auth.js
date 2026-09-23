// src/wallet-auth.js — "Sign in with your wallet address" middleware.
//
// Proves control of a wallet by recovering the signer from a signature over a
// fresh, single-use nonce, and checking it matches the address that maps to the
// handle. Uses @noble/curves secp256k1 (battle-tested, audited) + @noble/hashes
// keccak_256 for correct EVM address recovery — node:crypto alone cannot
// recover an uncompressed pubkey to an EVM address.

import crypto from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { classifyAddress, handleForAddress } from "./address.js";

// Recover the EVM address (0x…) that signed `message` with `signature`.
// signature = 65 bytes hex: r(32) + s(32) + v(01). Returns 0x… lowercased or null.
export function recoverEvmAddress(message, signature) {
  try {
    const clean = signature.replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{130}$/.test(clean)) return null;
    const sigBytes = hexToBytes(clean);
    const r = sigBytes.subarray(0, 32);
    const s = sigBytes.subarray(32, 64);
    let recId = sigBytes[64];
    if (recId === 27 || recId === 28) recId -= 27; // accept v as 27/28 (EIP-155) or 0/1
    if (recId !== 0 && recId !== 1) return null;

    const msgHash = keccak_256(Buffer.from(message, "utf8"));
    const point = secp256k1.Signature.fromCompact(bytesToHex(r) + bytesToHex(s))
      .addRecoveryBit(recId)
      .recoverPublicKey(msgHash);
    const compressed = point.toBytes(false); // uncompressed, starts 0x04
    const address = keccak_256(compressed.subarray(1)).subarray(-20);
    return "0x" + bytesToHex(address).toLowerCase();
  } catch {
    return null;
  }
}

export class WalletAuth {
  constructor({ secret = "", ttlMs = 5 * 60 * 1000 } = {}) {
    this.secret = secret || process.env.INBOX_SECRET || "dev-insecure-secret";
    this.ttlMs = ttlMs;
    this.nonces = new Map(); // address -> { message, expiresAt }
  }

  issueNonce(address) {
    const { kind } = classifyAddress(address);
    if (kind !== "evm") return { ok: false, error: "invalid or non-EVM address" };
    const a = address.toLowerCase();
    const nonce = crypto.randomBytes(24).toString("hex");
    const message = `agentOS sign-in ${nonce}`;
    this.nonces.set(a, { message, expiresAt: Date.now() + this.ttlMs });
    return { ok: true, message };
  }

  // Verify a signature against a previously-issued nonce. Consumes nonce on
  // success (single-use). Returns the wallet handle for the address.
  verify(address, message, signature) {
    const a = String(address || "").toLowerCase();
    const entry = this.nonces.get(a);
    if (!entry) return { ok: false, error: "no_nonce" };
    if (Date.now() > entry.expiresAt) { this.nonces.delete(a); return { ok: false, error: "expired" }; }
    if (message !== entry.message) return { ok: false, error: "message_mismatch" };

    const recovered = recoverEvmAddress(message, signature);
    if (!recovered || recovered !== a) return { ok: false, error: "signature_invalid" };

    this.nonces.delete(a); // single-use
    const h = handleForAddress(a);
    return { ok: true, handle: h.handle, address: a };
  }
}

// Express-style middleware factory: gate a route by wallet control.
// Expects headers: x-wallet-address, x-wallet-message, x-wallet-signature.
export function createWalletAuthMiddleware({ auth }) {
  return function walletAuth(req, res, next) {
    const address = (req.headers["x-wallet-address"] || "").toString();
    const message = (req.headers["x-wallet-message"] || "").toString();
    const signature = (req.headers["x-wallet-signature"] || "").toString();
    const result = auth.verify(address, message, signature);
    if (!result.ok) {
      res.status(401).json({ error: "unauthorized", reason: result.error });
      return;
    }
    req.wallet = result;
    next();
  };
}