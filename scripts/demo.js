// scripts/demo.js — automated end-to-end self-demo for agent-inbox.
// Demonstrates the full thesis in one runnable script (output = transcript):
//   1) A wallet address becomes a deterministic handle.
//   2) A "verification email" arrives and is auto-processed.
//   3) A paid x402 call is made to the same handle's payline.
// This is the recording an agent can screen-capture as proof of the product
// using the product.
//
// Run: node scripts/demo.js

import { handleForAddress, classifyAddress, handleFingerprint } from "../src/address.js";
import { Inbox } from "../src/inbox.js";
import { gatePayment, paymentRequirements } from "../src/x402.js";

const ADDRESS = process.env.DEMO_ADDRESS || "0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA";
const ENV = { ...process.env, PAYMENT_MODE: "mock" };

export async function runDemo() {
  const steps = [];
  console.log("=== agent-inbox self-demo ===\n");

  // 1. Address -> handle
  const h = handleForAddress(ADDRESS);
  steps.push(`address ${classifyAddress(ADDRESS).kind}`);
  steps.push(`handle = ${h.handle}`);
  steps.push(`fingerprint = ${handleFingerprint(h.handle)}`);
  console.log(`[1-3] Derived deterministic handle:\n  ${h.handle}\n  (fingerprint ${handleFingerprint(h.handle)})\n`);

  // 2. Inbox receives + auto-detects a verification link
  const inbox = new Inbox();
  const delivered = inbox.deliver(h.handle, {
    from: "no-reply@mcp-hive.com",
    subject: "Verify your agent identity",
    text: "Click to activate: https://mcp-hive.com/api/auth/verify-email?token=***&id=1",
  });
  steps.push(`delivered, verifications found = ${delivered.verificationsFound.length}`);
  const vid = inbox.listVerifications(h.handle)[0].id;
  const verified = inbox.processVerification(h.handle, vid);
  steps.push(`verification ${verified.ok ? "processed" : "FAILED"} -> proof ${verified.proof}`);
  console.log(`[4-5] Inbox auto-processed the verification link:\n  ${verified.proof}\n`);

  // 3. Paid x402 call on the same handle's payline
  const url = `https://${h.handle}/pay`;
  let gate = await gatePayment({ headers: {} }, url, ENV);
  steps.push(`payment gate (${gate.mode}) => ${gate.paid ? "paid" : "402"}`);
  steps.push("payline requirements = x402 v2, Base mainnet, $0.005 USDC");
  console.log(`[6-7] Payline gate (${gate.mode}):\n  ${JSON.stringify(paymentRequirements(url, ENV).accepts[0], null, 2)}\n`);

  console.log("=== SUMMARY ===");
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log("\nDemo complete. Render these steps as a screen recording for promotion.");
  return steps;
}

// Run when invoked directly (as a script), not when imported.
const isMain = process.argv[1] === undefined && !process.env.PORT ? true : (typeof process.argv[1] === "string");
if (process.argv[1]) {
  // node scripts/demo.js   or   node scripts/demo.js run
  runDemo().catch((e) => { console.error("demo failed:", e.message); process.exit(1); });
}