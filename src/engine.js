import { APPROVAL_TOPIC, ENGINE_VERSION, NETWORK, SWAP_TOPIC, ZERO } from "./constants.js";
import { addExact, formatUnits, hexToBigIntString } from "./exact.js";

const lower = value => String(value || "").toLowerCase();
const ok = enriched => enriched?.receipt?.status === "0x1";
const explorer = hash => `${NETWORK.explorerUrl}/tx/${hash}`;
const serializeTotals = map => [...map.values()].map(item => ({ ...item, formatted: formatUnits(item.raw, item.decimals) }));
const eventId = item => `${NETWORK.chainId}:${lower(item.tx_hash)}:${Number(item.log_index)}`;

export function buildReport(state, now = new Date()) {
  const wallet = lower(state.wallet), discovery = state.discovery, enriched = state.enriched || {};
  const transfers = discovery.results?.["token-transfers"]?.observations || [];
  const approvals = discovery.results?.approvals?.observations || [];
  const transactions = discovery.results?.transactions?.observations || [];
  const metadata = new Map(transfers.map(item => [lower(item.token), { assetAddress: lower(item.token), symbol: item.token_symbol || null, decimals: Number.isInteger(item.token_decimals) ? item.token_decimals : null }]));
  const inTotals = new Map(), outTotals = new Map(), swapIn = new Map(), swapOut = new Map(), activities = [], categoriesByHash = new Map();
  const mark = (hash, category) => { const set = categoriesByHash.get(hash) || new Set(); set.add(category); categoriesByHash.set(hash, set); };
  const push = row => { activities.push(row); mark(row.transactionHash, row.category); };

  for (const item of transfers) {
    const hash = lower(item.tx_hash), detail = enriched[hash], status = detail?.receipt ? (ok(detail) ? "SUCCESS" : "FAILED") : "UNKNOWN";
    if (status === "FAILED") continue;
    const from = lower(item.from_addr), to = lower(item.to_addr), self = from === wallet && to === wallet;
    const direction = self ? "SELF" : from === wallet ? "OUT" : to === wallet ? "IN" : "THIRD_PARTY";
    const meta = metadata.get(lower(item.token)) || { assetAddress: lower(item.token), symbol: null, decimals: null };
    if (direction === "IN") addExact(inTotals, meta.assetAddress, item.amount, meta);
    if (direction === "OUT") addExact(outTotals, meta.assetAddress, item.amount, meta);
    push({ id: eventId(item), category: "TRANSFER", status, transactionHash: hash, blockNumber: item.block_number, timestampUtc: new Date(Number(item.ts) * 1000).toISOString(), logIndex: Number(item.log_index), assetAddress: meta.assetAddress, symbol: meta.symbol, decimals: meta.decimals, rawAmount: String(item.amount), formattedAmount: meta.decimals === null ? null : formatUnits(item.amount, meta.decimals), direction, counterparty: direction === "IN" ? from : direction === "OUT" ? to : null, tokenEventFrom: from, tokenEventTo: to, transactionFrom: lower(detail?.transaction?.from) || null, movementKind: from === ZERO ? "MINT" : to === ZERO ? "BURN" : self ? "SELF_TRANSFER" : "STANDARD", classificationEvidence: "Indexed token transfer reconciled to its transaction/receipt where available.", explorerUrl: explorer(hash) });
  }

  for (const item of approvals) {
    const hash = lower(item.tx_hash), detail = enriched[hash], status = detail?.receipt ? (ok(detail) ? "SUCCESS" : "FAILED") : "UNKNOWN";
    if (status === "FAILED") continue;
    const amount = BigInt(item.amount), kind = amount === 0n ? "REVOKE" : amount === (2n ** 256n - 1n) ? "UNLIMITED_GRANT" : "GRANT_OR_CHANGE";
    const meta = metadata.get(lower(item.token)) || { assetAddress: lower(item.token), symbol: null, decimals: null };
    push({ id: eventId(item), category: "APPROVAL", status, transactionHash: hash, blockNumber: item.block_number, timestampUtc: new Date(Number(item.ts) * 1000).toISOString(), logIndex: Number(item.log_index), assetAddress: meta.assetAddress, symbol: meta.symbol, decimals: meta.decimals, rawAmount: String(item.amount), formattedAmount: meta.decimals === null ? null : formatUnits(item.amount, meta.decimals), direction: "PERMISSION", counterparty: lower(item.spender), owner: lower(item.owner), approvalKind: kind, transactionFrom: lower(detail?.transaction?.from) || null, classificationEvidence: "Historical Approval event; this does not assert the allowance remains active today.", explorerUrl: explorer(hash) });
  }

  for (const item of transactions) {
    const hash = lower(item.tx_hash || item.hash), detail = enriched[hash], tx = detail?.transaction, receipt = detail?.receipt;
    if (!tx || !receipt) continue;
    const status = ok(detail) ? "SUCCESS" : "FAILED", from = lower(tx.from), to = lower(tx.to), value = hexToBigIntString(tx.value);
    if (BigInt(value) > 0n && status === "SUCCESS" && (from === wallet || to === wallet)) {
      const direction = from === wallet && to === wallet ? "SELF" : from === wallet ? "OUT" : "IN";
      const meta = { assetAddress: "native", symbol: NETWORK.nativeSymbol, decimals: 18 };
      if (direction === "IN") addExact(inTotals, "native", value, meta); if (direction === "OUT") addExact(outTotals, "native", value, meta);
      push({ id: `${NETWORK.chainId}:${hash}:native`, category: "TRANSFER", status, transactionHash: hash, blockNumber: Number(BigInt(tx.blockNumber)), timestampUtc: new Date(Number(item.ts) * 1000).toISOString(), logIndex: null, assetAddress: "native", symbol: NETWORK.nativeSymbol, decimals: 18, rawAmount: value, formattedAmount: formatUnits(value, 18), direction, counterparty: direction === "IN" ? from : direction === "OUT" ? to : null, transactionFrom: from, movementKind: direction === "SELF" ? "SELF_TRANSFER" : "NATIVE_TRANSFER", classificationEvidence: "Native value from the official transaction and successful receipt.", explorerUrl: explorer(hash) });
    }
    const code = state.codes?.[to];
    if (from === wallet && to && typeof code === "string" && code !== "0x" && code !== "0x0") {
      push({ id: `${NETWORK.chainId}:${hash}:call`, category: "CONTRACT_INTERACTION", status, transactionHash: hash, blockNumber: Number(BigInt(tx.blockNumber)), timestampUtc: new Date(Number(item.ts) * 1000).toISOString(), logIndex: null, destination: to, methodSelector: tx.input?.length >= 10 ? tx.input.slice(0, 10) : null, transactionFrom: from, rawAmount: null, classificationEvidence: "Wallet is transaction.from and destination had deployed bytecode at the transaction block.", explorerUrl: explorer(hash) });
    }
  }

  for (const [hash, detail] of Object.entries(enriched)) {
    if (!ok(detail) || lower(detail.transaction?.from) !== wallet) continue;
    const hasSwapEvent = detail.receipt.logs?.some(log => lower(log.topics?.[0]) === SWAP_TOPIC);
    const related = activities.filter(row => row.category === "TRANSFER" && row.transactionHash === hash && row.movementKind !== "SELF_TRANSFER");
    const inputs = related.filter(row => row.direction === "OUT"), outputs = related.filter(row => row.direction === "IN");
    if (!hasSwapEvent || !inputs.length || !outputs.length) continue;
    for (const row of inputs) addExact(swapIn, row.assetAddress, row.rawAmount, { assetAddress: row.assetAddress, symbol: row.symbol, decimals: row.decimals });
    for (const row of outputs) addExact(swapOut, row.assetAddress, row.rawAmount, { assetAddress: row.assetAddress, symbol: row.symbol, decimals: row.decimals });
    const swapLog = detail.receipt.logs.find(log => lower(log.topics?.[0]) === SWAP_TOPIC);
    push({ id: `${NETWORK.chainId}:${hash}:swap`, category: "SWAP", status: "SUCCESS", transactionHash: hash, blockNumber: Number(BigInt(detail.transaction.blockNumber)), timestampUtc: related[0].timestampUtc, logIndex: Number(BigInt(swapLog.logIndex)), venue: lower(swapLog.address), inputs: inputs.map(({ assetAddress, symbol, decimals, rawAmount, formattedAmount }) => ({ assetAddress, symbol, decimals, rawAmount, formattedAmount })), outputs: outputs.map(({ assetAddress, symbol, decimals, rawAmount, formattedAmount }) => ({ assetAddress, symbol, decimals, rawAmount, formattedAmount })), transactionFrom: wallet, rawAmount: null, classificationEvidence: "Successful receipt contains a documented Swap event plus wallet-linked token input and output; one transaction is one wallet swap even if multi-hop.", explorerUrl: explorer(hash) });
  }

  const hashes = new Set(state.hashes || Object.keys(enriched)); let success = 0, failed = 0, unknownStatus = 0, gasRaw = 0n;
  for (const hash of hashes) { const detail = enriched[hash]; if (!detail?.receipt) { unknownStatus += 1; continue; } if (ok(detail)) success += 1; else failed += 1; if (lower(detail.transaction?.from) === wallet) gasRaw += BigInt(detail.receipt.gasUsed) * BigInt(detail.receipt.effectiveGasPrice || detail.transaction.gasPrice || "0x0"); }
  const approvalRows = activities.filter(row => row.category === "APPROVAL"), contractRows = activities.filter(row => row.category === "CONTRACT_INTERACTION"), swapRows = activities.filter(row => row.category === "SWAP");
  const unknownHashes = [...hashes].filter(hash => !categoriesByHash.has(hash));
  const coverage = {
    status: "PARTIAL",
    categories: {
      ordinaryTransactions: discovery.results?.transactions ? "COMPLETE" : "UNKNOWN",
      tokenTransfers: discovery.results?.["token-transfers"] ? "COMPLETE" : "UNKNOWN",
      approvals: discovery.results?.approvals ? "COMPLETE" : "UNKNOWN",
      receiptsAndGas: Object.values(enriched).every(item => item.receipt) ? "COMPLETE" : "PARTIAL",
      nativeInternalTransfers: "UNKNOWN"
    }, failures: [...(discovery.failures || []), ...Object.values(enriched).flatMap(item => item.errors || []).map(error => ({ source: "Official Pharos Chain MCP", error }))]
  };
  const categoryTotals = {
    transfersIn: serializeTotals(inTotals), transfersOut: serializeTotals(outTotals),
    swaps: { transactionCount: swapRows.length, inputs: serializeTotals(swapIn), outputs: serializeTotals(swapOut) },
    approvals: { eventCount: approvalRows.length, uniqueSpenders: new Set(approvalRows.map(row => row.counterparty)).size, grantsOrChanges: approvalRows.filter(row => row.approvalKind === "GRANT_OR_CHANGE").length, revocations: approvalRows.filter(row => row.approvalKind === "REVOKE").length, unlimited: approvalRows.filter(row => row.approvalKind === "UNLIMITED_GRANT").length },
    contractInteractions: { transactionCount: new Set(contractRows.map(row => row.transactionHash)).size, destinations: [...new Set(contractRows.map(row => row.destination))] },
    gas: { symbol: NETWORK.nativeSymbol, decimals: 18, raw: gasRaw.toString(), formatted: formatUnits(gasRaw, 18), attribution: "Only receipts whose transaction.from equals the wallet." }
  };
  const notable = activities.filter(row => row.category === "SWAP" || row.approvalKind === "UNLIMITED_GRANT" || row.status === "FAILED").slice(0, 12).map(row => ({ transactionHash: row.transactionHash, category: row.category, reason: row.category === "SWAP" ? "Verified swap event" : row.approvalKind === "UNLIMITED_GRANT" ? "Unlimited token approval" : "Failed wallet transaction", explorerUrl: row.explorerUrl }));
  const report = { id: state.reportId || crypto.randomUUID(), jobId: state.jobId, generatedAt: now.toISOString(), engineVersion: ENGINE_VERSION, readOnly: true, wallet, network: NETWORK, requestedInterval: { startUtc: state.range.startUtc, endUtc: state.range.endUtc, semantics: state.range.semantics, inclusiveEndConverted: Boolean(state.range.inclusiveEndConverted) }, resolvedBlocks: state.boundaries, coverage, summary: { uniqueTransactions: hashes.size, successful: success, failed, unknownStatus, unknownOrUnclassified: unknownHashes.length, warning: "Category transaction counts overlap and must not be added to derive unique transaction count." }, categoryTotals, notableTransactions: notable, activities: activities.sort((a, b) => a.blockNumber - b.blockNumber || (a.logIndex ?? -1) - (b.logIndex ?? -1)), unknownTransactions: unknownHashes, sources: [{ name: "Official Pharos Chain MCP", url: NETWORK.mcpUrl, purpose: "network, exact blocks, transactions, receipts, bytecode" }, { name: "Pharos Explorer API", url: `${NETWORK.indexerUrl}/api-docs`, purpose: "supplementary paginated address-history discovery" }], limitations: ["Native internal transfers/traces are not available from the configured official MCP or indexed endpoint and are UNKNOWN, not zero.", "Approval rows are historical events; current allowance is not inferred.", "Unknown token metadata remains unlabeled rather than guessed.", "This is an evidence-backed activity statement, not tax, accounting, compliance, or profit advice."] };
  report.executiveSummary = `${wallet} had ${hashes.size} unique relevant transactions in the requested UTC interval: ${success} successful, ${failed} failed, and ${unknownStatus} with unavailable receipt status. The report identified ${swapRows.length} verified swaps, ${approvalRows.length} approval events, and ${categoryTotals.contractInteractions.transactionCount} wallet-initiated contract interactions. Coverage is ${coverage.status}; native internal transfers remain UNKNOWN.`;
  return report;
}
