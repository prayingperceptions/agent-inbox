// test.js — agent-inbox security-hardened tests. Run: npm test
import { handleForAddress, handleFingerprint, classifyAddress } from "./src/address.js";
import { Inbox, scanVerificationLinks } from "./src/inbox.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} :: ${detail}`); }
};

// --- Address derivation ---
check("classify EVM", classifyAddress("0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA").kind === "evm");
check("classify invalid", classifyAddress("not-an-address").kind === "invalid");
const h1 = handleForAddress("0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA");
const h2 = handleForAddress("0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA");
check("handle deterministic", h1.handle === h2.handle);
check("fingerprint stable", handleFingerprint(h1.handle) === handleFingerprint(h2.handle));

// --- SSRF: allowlist blocks non-allowlisted verification links ---
// Inbox with NO allowlist configured => link scanning is DISABLED (safe default).
const secureInbox = new Inbox({ secret: "test-secret", allowlist: ["mcp-hive.com"] });

// Legit allowlisted host gets processed.
const blocklisted = new Inbox({ secret: "test-secret", allowlist: ["mcp-hive.com"] });
const badDeliver = await blocklisted.deliver(h1.handle, {
  from: "attacker@evil.net",
  subject: "Verify your account",
  text: "Click: https://evil.net/verify?token=xyz",
});
check("SSRF: non-allowlisted host NOT captured", badDeliver.verificationsFound.length === 0, JSON.stringify(badDeliver.verificationsFound));

// Allowlisted host gets captured (the legit flow).
const goodDeliver = await secureInbox.deliver(h1.handle, {
  from: "no-reply@mcp-hive.com",
  subject: "Verify your account",
  text: "Click to activate: https://mcp-hive.com/api/auth/verify-email?token=***&id=123",
  html: "<a href='https://mcp-hive.com/api/auth/verify-email?token=***&id=123'>Verify</a>",
});
check("allowlisted host captured", goodDeliver.verificationsFound.length === 1, JSON.stringify(goodDeliver.verificationsFound));

// --- Signed proof is verifiable and non-forgeable ---
const vid = (await secureInbox.listVerifications(h1.handle))[0].id;
const proc = await secureInbox.processVerification(h1.handle, vid);
check("verification processed", proc.ok && /processed/.test(proc.handled.status));
check("proof is HMAC-signed (has dot-payload)", proc.proof && proc.proof.includes("."));
const verbok = secureInbox.verifyProof(proc.proof);
check("proof verifies", verbok.ok === true && verbok.verificationId === vid, JSON.stringify(verbok));

// Tampered proof must FAIL.
const tampered = proc.proof.slice(0, -4) + "beef";
const verbad = secureInbox.verifyProof(tampered);
check("tampered proof rejected", verbad.ok === false && verbad.error === "invalid_signature");

// Proof from a different secret must FAIL (cross-deployer recovery check).
const otherInbox = new Inbox({ secret: "different-secret", allowlist: ["mcp-hive.com"] });
const verbad2 = otherInbox.verifyProof(proc.proof);
check("proof from different secret rejected", verbad2.ok === false && verbad2.error === "invalid_signature");

// Missing verification -> not_found
const nf = await secureInbox.processVerification(h1.handle, "does-not-exist");
check("missing verification -> not_found", nf.ok === false && nf.error === "not_found");

// scanVerificationLinks standalone with allowlist predicate
const scanned = scanVerificationLinks({ subject: "hi", text: "https://evil.net/verify=1 and https://mcp-hive.com/verify=2" }, (d) => d === "mcp-hive.com");
check("scan enforces allowlist predicate", scanned.length === 1 && scanned[0].hostname === "mcp-hive.com", JSON.stringify(scanned));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);