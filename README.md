# Pharos Audit-Log Agent

An evidence-backed, read-only wallet statement for Pharos Pacific Mainnet. Enter a public wallet and a UTC interval, then inspect transfers, verified swaps, historical approvals, wallet-initiated contract calls, exact gas, coverage, and saved transaction evidence. Export the exact persisted report as Markdown or CSV.

## Live app

[https://pharos-audit-log-agent.shoupeorg.workers.dev](https://pharos-audit-log-agent.shoupeorg.workers.dev)

## Safety and scope

- Network: Pharos Pacific Mainnet, chain ID `1672`, native token `PROS`.
- No wallet connection, key, signer, approval, broadcast, deployment, or spending path exists.
- Time semantics are `[start inclusive, end exclusive)` in UTC. Inclusive date-only ends are converted to the next UTC midnight and recorded.
- Maximum interval is 24 hours. Dense intervals exceeding 20 indexed pages per source or 120 relevant transactions are rejected, never truncated.
- This is not tax, accounting, compliance, or profit advice.

## Data foundation

The app uses two explicitly attributed layers:

1. [Official Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp) at `https://mcp.pharos.xyz/mcp`: chain identity, exact block timestamps, transaction details, receipts, bytecode and receipt logs. Its documented log window is at most 1,000 blocks and its rate limit is 120 requests/minute/IP.
2. [Pharos Explorer developer API](https://pharos.exploreme.pro/api-docs): supplementary paginated address-history discovery for ordinary transactions, token transfers and approvals. Pages contain 50 rows and expose `x-next-cursor`.

The MCP has no address-history enumeration method, while token logs alone cannot discover ordinary/native transactions or all contract calls. Therefore explorer discovery is not silently presented as MCP data. Every discovered hash is enriched through MCP where possible; failures produce `PARTIAL` coverage.

The configured sources do not provide native internal trace discovery, so that category is `UNKNOWN`, not zero. PharosScan is the canonical official explorer, but its Pacific transaction-detail UI was observed failing during development. The report preserves inspectable local evidence and uses the attributed Pharos Explorer/indexer transaction UI for working links.

## Classification rules

- **Token transfers:** event `from`/`to` establish movement direction; they do not establish `transaction.from`. Self-transfers are separate and do not enter external in/out totals. Mint/burn are labeled.
- **Native transfers:** successful transaction `value` where the wallet is transaction sender or recipient.
- **Swaps:** verified only for an explicitly configured pool/router pair. The emitter must be that pool, the log must decode as the documented [Uniswap V3 `Swap` event](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol), its recipient must be the wallet, and one positive/one negative signed pool delta must uniquely equal direct wallet↔pool transfers for the configured token0/token1. Unknown emitters, malformed events, complex unmatched transfers, and multiple matches remain unclassified. Unrelated transfers in the same transaction never enter swap totals.
- **Approvals:** historical Approval owner/spender/amount; zero is revoke, `2^256−1` is unlimited. No claim is made that the allowance remains active.
- **Contract interactions:** wallet equals `transaction.from`, destination bytecode exists at the transaction block, and the selector is displayed without guessing its name.
- **Failed transactions:** no reverted movement is added; wallet-paid gas is still counted.
- **Gas:** exact integer `gasUsed × effectiveGasPrice`, only when the wallet is `transaction.from`. If `effectiveGasPrice` is absent, only that same historical transaction's `gasPrice` may be used. Missing `gasUsed` or both historical prices are unavailable—not zero. Reports expose `COMPLETE`, `PARTIAL` known subtotal, or `UNKNOWN` gas status. Receipt/gas coverage cannot be complete when ordinary transaction discovery is incomplete.

Category counts overlap because one transaction may transfer tokens, swap and call a contract. They must not be summed to derive unique transactions.

## Exact totals

All amounts retain the raw integer, token address, verified decimals and formatted value. Calculations use `BigInt`; unrelated asset units are never added. Missing metadata remains unknown. CSV cells beginning with `=`, `+`, `-` or `@` are prefixed to prevent spreadsheet formula execution.

## Run locally

```bash
npm install
npm test
npm run build
npm run cli -- --wallet 0x15ddce897d76ac39c188ade4d353711a60395315 --start 2026-10-20T20:20:00Z --end 2026-10-20T20:22:00Z --out demo
```

The CLI and web Worker share `src/pipeline.js`, `src/engine.js`, and export functions. The CLI writes JSON, Markdown and CSV.

## Web job lifecycle

`POST /api/jobs` validates and persists the request. Repeated `POST /api/jobs/:id/step` calls move through `RESOLVING_DATES`, `FETCHING_HISTORY`, `FETCHING_RECEIPTS`, `CLASSIFYING`, `GENERATING_REPORT` and `COMPLETE`. D1 stores each checkpoint; the same request key is idempotent. Exports under `/api/reports/:id/{markdown,csv}` read the saved report and never repeat chain analysis.

## Tests

Focused Node tests cover timestamp boundaries, block search, pagination, resume/deduplication, transfer direction and self-transfer, third-party movement attribution, supported-emitter swap decoding, unrelated Swap events, unrelated transfers inside swap transactions, unlimited approvals, missing gas fields, failed transaction gas, mixed decimals, missing-source coverage, CSV injection/escaping, export consistency and saved-report recovery.

## Engine-version note

Engine `audit-log-agent/1.1.0` introduces strict pool-event reconciliation and explicit gas availability. Reports generated by `1.0.1` remain immutable historical records and are labeled `HISTORICAL SAVED REPORT`. Their saved payloads do not include the raw receipt log data and per-transaction fee fields required to re-run the stricter rules, so they are not silently rewritten or presented as corrected `1.1.0` reports. New analysis uses the corrected semantics.

Versioned `evidence/v1.1-derived-*-report.*` artifacts are conservative, no-chain-read derivations of those saved payloads. They retain supported transfer/approval rows, declassify the old swap as ambiguous, and mark gas `UNKNOWN`. The original `evidence/live-*-report.*` files remain unchanged.

## Demonstrations

- Swap/transfer/contract example: public wallet `0x15ddce897d76ac39c188ade4d353711a60395315`, `2026-10-20T20:20:00Z` to `2026-10-20T20:22:00Z`.
- Approval example: the same public wallet, `2026-09-26T17:47:00Z` to `2026-09-26T17:50:00Z`.

These are public-chain examples and are not claimed to belong to the project author or user.
