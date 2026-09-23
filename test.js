// test.js — agent-inbox end-to-end local test (zero deps). Run: npm test
import { handleForAddress, handleFingerprint, classifyAddress } from "./src/address.js";
import { Inbox, scanVerificationLinks } from "./src/inbox.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} :: ${detail}`); }
};

// 1. Address classification
check("classify EVM", classifyAddress("0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA").kind === "evm");
check("classify invalid", classifyAddress("not-an-address").kind === "invalid");

// 2. Deterministic handle derivation
const h1 = handleForAddress("0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA");
const h2 = handleForAddress("0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA");
check("handle deterministic", h1.handle === h2.handle);
check("handle format", /^eip155-[0-9a-f]{10}-[0-9a-f]{6}@agents\.inbox$/.test(h1.handle), h1.handle);
check("fingerprint stable", handleFingerprint(h1.handle) === handleFingerprint(h2.handle));

// 3. Inbox delivery + verification auto-scan
const inbox = new Inbox();
const del = inbox.deliver(h1.handle, {
  from: "no-reply@mcp-hive.com",
  subject: "Verify your account",
  text: "Click to activate: https://mcp-hive.com/api/auth/verify-email?token=abc&id=123",
  html: "<a href='https://mcp-hive.com/api/auth/verify-email?token=abc&id=123'>Verify</a>",
});
check("delivered + verification found", del.delivered && del.verificationsFound.length === 1, JSON.stringify(del.verificationsFound));

// 4. Verify match detection only on verification-like URLs
const scan = scanVerificationLinks({ subject: "hello", text: "https://example.com/profile and https://x.com/login?verify=1" });
check("only verify-like urls captured", scan.length === 1, JSON.stringify(scan));

// 5. Process verification produces proof
const vid = inbox.listVerifications(h1.handle)[0].id;
const proc = inbox.processVerification(h1.handle, vid);
check("verification processed", proc.ok && /processed/.test(proc.handled.status) && proc.proof, JSON.stringify(proc));

// 6. Missing verification -> not_found
const nf = inbox.processVerification(h1.handle, "does-not-exist");
check("missing verification -> not_found", nf.ok === false && nf.error === "not_found");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);