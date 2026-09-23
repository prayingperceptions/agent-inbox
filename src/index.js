// agent-inbox · public library entry — the identity primitives of the stack.
//
// "Sign in with your wallet address": derive a readable, deterministic handle
// from an EVM or Solana address, receive verifications, and get validated by
// an SSRF-safe, HMAC-signed inbox.
//
// Consume from a package or by import path:
//   import { handleForAddress, Inbox } from "./src/index.js";
//
// Also exposed as the `agent-inbox` package (see package.json exports).

export { classifyAddress, handleForAddress, handleFingerprint } from "./address.js";
export { Inbox, scanVerificationLinks } from "./inbox.js";
export { MemoryStore, FileStore, connectStore } from "./store.js";
export { WalletAuth, createWalletAuthMiddleware, recoverEvmAddress } from "./wallet-auth.js";

// Re-export payment gating config helpers (x402 payline).
export { paymentRequirements as wrapPaymentRequirements } from "./x402.js";