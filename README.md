# Agent Inbox 📬

**An agentic identity and inbox where your wallet address *is* your email.**

> **Verify anything. Get paid on the same handle.**

**Address in. Handle out. Zero registration.**

Agent Inbox collapses onboarding — the single biggest agent-friction point — into one stroke: your readable, derived handle is both an auto-processing inbox and an x402 payline. No signup ceremony, no email ban, no payment wall that isn't already yours.

> Built on the **[x402](https://x402.org) payment standard**, on **[Base](https://base.org)** (EVM), and the **[Coinbase](https://www.coinbase.com) CDP facilitator** — thank you for making machine-to-machine payments and agentic identity actually possible. 🙏

---

## ⚡ Quick Start

```bash
git clone https://github.com/prayingperceptions/agent-inbox.git
cd agent-inbox
npm start
```

Test it:

```bash
npm test                      # 9/9 checks
curl localhost:3411/health
curl localhost:3411/handle/0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA
```

---

## 🧭 The Model

```text
                ┌──────────────┐
                │  WALLET ADDR │
                │   (EVM/SVM)  │
                └──────┬───────┘
                       │ derived
                ┌──────▼───────┐
                │   HANDLE    │
                │  eip155-…@  │
                │  agents.inbox│
                └──────┬───────┘
            ┌──────────┼──────────┐
     ┌──────▼──────┐   ┌─────────▼──────┐
     │   INBOX    │   │     PAYLINE    │
     │  auto-     │   │   x402 v2      │
     │  verifies  │   │  + megapayments│
     │  links     │   │  (Base/USDC)   │
     └────────────┘   └────────────────┘
```

One handle to verify *and* earn. Deterministic, key-owned, API-first.

---

## 🌐 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/handle/:address` | Derive the agentic handle from a wallet address (free) |
| `POST` | `/inbox/:handle/deliver` | Deliver an inbound message (webhook / upstream mailbox) |
| `GET` | `/inbox/:handle/messages` | List messages |
| `GET` | `/inbox/:handle/verifications` | Auto-detected verification links |
| `POST` | `/inbox/:handle/verify/:id` | Process a verification — x402-gated in live mode |
| `GET` | `/pay/:address` | x402 payment requirements for a handle's payline |

**Example — derive + verify:**

```bash
# 1) Address becomes a handle
curl localhost:3411/handle/0x2091125bFE4259b2CfA889165Beb6290d0Df5DeA

# 2) A verification email arrives (from any upstream mailbox/webhook)
curl -X POST localhost:3411/inbox/EIP155-HANDLE/deliver \
  -H "Content-Type: application/json" \
  -d '{"from":"no-reply@mcp-hive.com","subject":"Verify","text":"https://mcp-hive.com/api/auth/verify-email?token=abc&id=1"}'

# 3) Detect the link
curl localhost:3411/inbox/EIP155-HANDLE/verifications

# 4) Auto-process it (charge in live mode)
curl -X POST localhost:3411/inbox/EIP155-HANDLE/verify/<id>
```

---

## 🔧 Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3411` | Listen port |
| `PAYMENT_MODE` | `mock` | `mock` (test) or `live` (x402 v2) |
| `X402_PAY_TO` | — | Receiving address (Base mainnet USDC) |
| `X402_NETWORK` | `eip155:8453` | Base mainnet |
| `X402_FACILITATOR_URL` | Coinbase CDP | Verify/settle; ⚠️ NOT `x402.org/facilitator` (testnet-only) |
| `X402_ASSET` | USDC Base mainnet | Canonical USDC contract addr |

---

## 🤝 Why this is different

- **Wallet address → handle deterministically.** Key ownership *is* identity. No email provider account to lose.
- **Inbox auto-consumes verification.** Agents (and humans) skip the "open email, click link, return" dance entirely.
- **x402 payline on the same handle.** Onboarding and earning collapse into one identity — built for the agent economy where buyers and sellers are both machines.
- **MIT licensed.** Fork it, run it, build your own.

---

## 🧪 Testing

```bash
npm test
```

9 checks: address classification, deterministic handle derivation, verification auto-scan, and proof generation.

---

## 🙏 Acknowledgements

- **[x402](https://x402.org)** — the Linux Foundation–governed open payment standard that makes machine-to-machine payments real.
- **[Base](https://base.org)** — cheap, EVM-compatible settlement for the payline.
- **[Coinbase](https://www.coinbase.com)** — the CDP x402 facilitator (mainnet) that indexes and settles these payments.

---

## 📄 License

MIT