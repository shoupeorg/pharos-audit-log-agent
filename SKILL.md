---
name: pharos-audit-log-agent
description: Generate a read-only, evidence-backed wallet activity statement for a bounded UTC interval on Pharos Pacific Mainnet.
license: MIT
metadata:
  network: Pharos Pacific Mainnet
  chain_id: "1672"
  mode: read-only
---

# Pharos Audit-Log Agent

Use this Skill when a user asks what a public Pharos wallet did during a specific UTC period.

## Invocation

```bash
npm install
npm run cli -- --wallet 0x... --start 2026-10-20T20:20:00Z --end 2026-10-20T20:22:00Z --out statement
```

Natural request form:

```bash
npm run cli -- --request "Summarize 0x... from 2026-10-20T20:20:00Z to 2026-10-20T20:22:00Z UTC." --out statement
```

## Required behavior

1. Validate chain ID 1672 through the official Pharos Chain MCP.
2. Interpret time as `[start inclusive, end exclusive)` in UTC. Resolve both boundaries with bounded binary searches over actual block timestamps.
3. Use the attributed Pharos Explorer indexed API only for paginated address-history discovery. Reconcile discovered hashes with official MCP transaction, receipt, bytecode, and block reads.
4. Never infer ordinary/native history from ERC-20 logs alone. If a source is unavailable, mark coverage `UNKNOWN` or `PARTIAL`, never zero.
5. Treat each transaction as a container for overlapping activities. Do not add category transaction counts to obtain the unique transaction total.
6. Classify swaps only when a successful receipt contains a Swap event and the wallet has both token input and output in that transaction.
7. Treat Approval amounts as historical permissions, not spending or proof of current allowance.
8. Calculate wallet-paid gas exactly as `gasUsed × effectiveGasPrice` only when `transaction.from` is the wallet.
9. Preserve raw integers and verified decimals. Never sum unrelated asset units.
10. Export Markdown and CSV from the persisted report; never rerun analysis during export.
11. Never connect a wallet, request a key, sign, approve, broadcast, deploy, or spend funds.

## Coverage caveat

The configured sources do not expose native internal trace discovery. Label that category `UNKNOWN`. PharosScan is the canonical official explorer, but its transaction-detail UI may be unavailable; saved evidence remains local and the attributed Pharos Explorer/indexer UI is used for working transaction links.
