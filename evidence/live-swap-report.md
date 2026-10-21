# Pharos Wallet Statement

Generated: 2026-10-21T14:38:57.051Z

- Wallet: `0x15ddce897d76ac39c188ade4d353711a60395315`
- Network: Pharos Pacific Mainnet (chain 1672)
- Requested UTC interval: 2026-10-20T20:20:00.000Z to 2026-10-20T20:22:00.000Z [start inclusive, end exclusive)
- Resolved blocks: 20776264 (included) to 20776384 (excluded)
- Coverage: **PARTIAL**
- Engine: `audit-log-agent/1.0.1`

## Executive summary

0x15ddce897d76ac39c188ade4d353711a60395315 had 1 unique relevant transactions in the requested UTC interval: 1 successful, 0 failed, and 0 with unavailable receipt status. The report identified 1 verified swaps, 0 approval events, and 1 wallet-initiated contract interactions. Coverage is PARTIAL; native internal transfers remain UNKNOWN.

Category transaction counts overlap; do not add them to derive the unique transaction total.

## Transaction totals

- Unique relevant transactions: 1
- Successful: 1
- Failed: 0
- Unknown receipt status: 0
- Unknown or unclassified: 0
- Wallet-paid gas: 0.001945095 PROS (raw 1945095000000000)

## Transfers in

- 405.504132963356908833 WPROS (1 events; raw 405504132963356908833; decimals 18)

## Transfers out

- 253.325339 USDC (1 events; raw 253325339; decimals 6)

## Swaps

- Verified swap transactions: 1
- Inputs:
- 253.325339 USDC (1 events; raw 253325339; decimals 6)
- Outputs:
- 405.504132963356908833 WPROS (1 events; raw 405504132963356908833; decimals 18)

## Approvals

- Events: 0
- Unique spenders: 0
- Grants/changes: 0
- Revocations: 0
- Unlimited grants: 0

Approval amounts are permissions, not money spent; the events do not assert current allowance.

## Contract interactions

- Wallet-initiated contract transactions: 1
- Verified destinations: 0x869379f2d9df67891e0159dd2520dc1681908f10

## Notable transactions

- [0xa2d0fd2a0289352badaf4f151c46dfd807de12d7f43b4008f236e4ca7bfe6399](https://pharos.exploreme.pro/tx/0xa2d0fd2a0289352badaf4f151c46dfd807de12d7f43b4008f236e4ca7bfe6399) — SWAP: Verified swap event

## Coverage

- ordinaryTransactions: **COMPLETE**
- tokenTransfers: **COMPLETE**
- approvals: **COMPLETE**
- receiptsAndGas: **COMPLETE**
- nativeInternalTransfers: **UNKNOWN**

## Limitations

- Native internal transfers/traces are not available from the configured official MCP or indexed endpoint and are UNKNOWN, not zero.
- Approval rows are historical events; current allowance is not inferred.
- Unknown token metadata remains unlabeled rather than guessed.
- This is an evidence-backed activity statement, not tax, accounting, compliance, or profit advice.

## Sources

- [Official Pharos Chain MCP](https://mcp.pharos.xyz/mcp) — network, exact blocks, transactions, receipts, bytecode
- [Pharos Explorer API](https://pharos.exploreme.pro/api-docs) — supplementary paginated address-history discovery
