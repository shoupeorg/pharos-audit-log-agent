# Pharos Wallet Statement

Generated: 2026-10-21T14:40:29.240Z

- Wallet: `0x15ddce897d76ac39c188ade4d353711a60395315`
- Network: Pharos Pacific Mainnet (chain 1672)
- Requested UTC interval: 2026-09-26T17:47:00.000Z to 2026-09-26T17:50:00.000Z [start inclusive, end exclusive)
- Resolved blocks: 18641119 (included) to 18641329 (excluded)
- Coverage: **PARTIAL**
- Engine: `audit-log-agent/1.0.1`

## Executive summary

0x15ddce897d76ac39c188ade4d353711a60395315 had 1 unique relevant transactions in the requested UTC interval: 1 successful, 0 failed, and 0 with unavailable receipt status. The report identified 0 verified swaps, 1 approval events, and 0 wallet-initiated contract interactions. Coverage is PARTIAL; native internal transfers remain UNKNOWN.

Category transaction counts overlap; do not add them to derive the unique transaction total.

## Transaction totals

- Unique relevant transactions: 1
- Successful: 1
- Failed: 0
- Unknown receipt status: 0
- Unknown or unclassified: 0
- Wallet-paid gas: 0.00046423 PROS (raw 464230000000000)

## Transfers in

- None observed in covered sources.

## Transfers out

- None observed in covered sources.

## Swaps

- Verified swap transactions: 0
- Inputs:
- None observed in covered sources.
- Outputs:
- None observed in covered sources.

## Approvals

- Events: 1
- Unique spenders: 1
- Grants/changes: 0
- Revocations: 0
- Unlimited grants: 1

Approval amounts are permissions, not money spent; the events do not assert current allowance.

## Contract interactions

- Wallet-initiated contract transactions: 0
- Verified destinations: None

## Notable transactions

- [0x97b338cfc17837e963bf123e1afb07d5377b6c451c9280b88e76d82f4ada86ea](https://pharos.exploreme.pro/tx/0x97b338cfc17837e963bf123e1afb07d5377b6c451c9280b88e76d82f4ada86ea) — APPROVAL: Unlimited token approval

## Coverage

- ordinaryTransactions: **UNKNOWN**
- tokenTransfers: **UNKNOWN**
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
