// wallet-auth self-test: prove recovery works by signing with a real key.
import { randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { WalletAuth, recoverEvmAddress } from "./src/wallet-auth.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

let pass=0, fail=0;
const check=(n,c,d)=>{ if(c){pass++;console.log("PASS "+n);} else {fail++;console.log("FAIL "+n+" :: "+d);} };

// Generate a key, derive its EVM address (same math as our recover path, but
// from the pubkey directly — independent check of correctness).
const priv = randomBytes(32);
const pubPt = secp256k1.ProjectivePoint.fromPrivateKey(priv);
const uncompressed = pubPt.toBytes(false);
const evmAddr = "0x" + bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(-20)).toLowerCase();

// Sign a message in secp256k1 V/HC: deterministic k, recovery bit auto.
const message = "agentOS sign-in testnonce";
const sig = secp256k1.sign(keccak_256(Buffer.from(message)), priv);
const sig65 = bytesToHex(sig.toCompactRawBytes()) + String(sig.recovery).padStart(2,"0"); // v as 1-byte
const recovered = recoverEvmAddress(message, sig65);

check("recovery returns a 0x40-hex address", /^0x[0-9a-f]{40}$/.test(recovered||""), recovered||"null");
check("recovered address matches signer", recovered===evmAddr, `recovered=${recovered} expected=${evmAddr}`);

// Full WalletAuth nonce flow.
const auth = new WalletAuth({ secret: "t", ttlMs: 60_000 });
const issued = auth.issueNonce(evmAddr);
check("nonce issued", issued.ok===true && issued.message.startsWith("agentOS sign-in"), JSON.stringify(issued));

const k = await import("@noble/hashes/sha3.js"); // ensure loaded
// sign issued.message with our key
const msgHash2 = keccak_256(Buffer.from(issued.message));
const sig2 = secp256k1.sign(msgHash2, priv);
const sig2_65 = bytesToHex(sig2.toCompactRawBytes()) + String(sig2.recovery).padStart(2,"0");
const v = auth.verify(evmAddr, issued.message, sig2_65);
check("verify succeeds + returns handle", v.ok===true && v.handle.endsWith("@agents.inbox"), JSON.stringify(v));

// single-use: second verify with same nonce (now consumed) must fail
const v2 = auth.verify(evmAddr, issued.message, sig2_65);
check("nonce single-use (resuse rejected)", v2.ok===false && v2.error==="no_nonce", JSON.stringify(v2));

// wrong signature for the issued address must fail
const auth2 = new WalletAuth({ secret: "t", ttlMs: 60_000 });
const i2 = auth2.issueNonce(evmAddr);
const badSig = "0".repeat(130); // structurally valid, wrong
const v3 = auth2.verify(evmAddr, i2.message, badSig);
check("wrong signature rejected", v3.ok===false && v3.error==="signature_invalid", JSON.stringify(v3));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);