import { ENGINE_VERSION, NETWORK, SUPPORTED_SWAP_POOLS, SWAP_TOPIC, ZERO } from "./constants.js";
import { addExact, formatUnits, hexToBigIntString } from "./exact.js";

const lower = value => String(value || "").toLowerCase();
const ok = enriched => enriched?.receipt?.status === "0x1";
const explorer = hash => `${NETWORK.explorerUrl}/tx/${hash}`;
const serializeTotals = map => [...map.values()].map(item => ({ ...item, formatted: formatUnits(item.raw, item.decimals) }));
const eventId = item => `${NETWORK.chainId}:${lower(item.tx_hash)}:${Number(item.log_index)}`;

const addressTopic = topic => /^0x[0-9a-f]{64}$/i.test(topic || "") ? `0x${topic.slice(-40).toLowerCase()}` : null;
const signed256 = word => {
  const value = BigInt(`0x${word}`), sign = 1n << 255n;
  return value & sign ? value - (1n << 256n) : value;
};
function decodeSupportedSwap(log, detail, wallet, transfers, supportedPools) {
  const venue = lower(log.address), pool = supportedPools[venue];
  if (!pool) return { reason: `Swap topic was emitted by unsupported contract ${venue || "unknown"}.` };
  if (!pool.routers.includes(lower(detail.transaction?.to))) return { reason: "Transaction destination is not a configured router for the supported pool." };
  if (!Array.isArray(log.topics) || log.topics.length !== 3 || lower(log.topics[0]) !== SWAP_TOPIC) return { reason: "Swap event indexed-topic structure is invalid." };
  const recipient = addressTopic(log.topics[2]), sender = addressTopic(log.topics[1]);
  if (!recipient || !sender) return { reason: "Swap event sender/recipient topics are malformed." };
  if (recipient !== wallet) return { reason: "Swap event recipient is not the analyzed wallet." };
  const data = String(log.data || "");
  if (!/^0x[0-9a-f]{320}$/i.test(data)) return { reason: "Swap event data does not match the five-word Uniswap V3 ABI." };
  const words = data.slice(2).match(/.{64}/g), amount0 = signed256(words[0]), amount1 = signed256(words[1]);
  if (amount0 === 0n || amount1 === 0n || (amount0 > 0n) === (amount1 > 0n)) return { reason: "Swap event token deltas do not contain one pool input and one pool output." };
  const legs = [{ token: lower(pool.token0), delta: amount0 }, { token: lower(pool.token1), delta: amount1 }];
  const matched = legs.map(leg => {
    const expected = (leg.delta < 0n ? -leg.delta : leg.delta).toString();
    const rows = transfers.filter(row => row.assetAddress === leg.token && row.rawAmount === expected && (
      leg.delta > 0n
        ? row.direction === "OUT" && row.tokenEventTo === venue
        : row.direction === "IN" && row.tokenEventFrom === venue
    ));
    return { leg, rows };
  });
  if (matched.some(item => item.rows.length !== 1)) return { reason: "Direct wallet/pool transfer amounts do not uniquely match the decoded pool deltas." };
  return {
    value: {
      venue, protocol: pool.protocol, sender, recipient, eventReference: pool.eventReference,
      input: matched.find(item => item.leg.delta > 0n).rows[0],
      output: matched.find(item => item.leg.delta < 0n).rows[0],
      amount0: amount0.toString(), amount1: amount1.toString()
    }
  };
}

const validInteger = value => (typeof value === "string" && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const sourceCoverage = (discovery, name) => {
  if (!discovery.results?.[name]) return "UNKNOWN";
  return discovery.results[name].complete === true && !(discovery.failures || []).some(item => item.source === name) ? "COMPLETE" : "PARTIAL";
};

export function buildReport(state, now = new Date(), options = {}) {
  const wallet = lower(state.wallet), discovery = state.discovery, enriched = state.enriched || {};
  const transfers = discovery.results?.["token-transfers"]?.observations || [];
  const approvals = discovery.results?.approvals?.observations || [];
  const transactions = discovery.results?.transactions?.observations || [];
  const metadata = new Map(transfers.map(item => [lower(item.token), { assetAddress: lower(item.token), symbol: item.token_symbol || null, decimals: Number.isInteger(item.token_decimals) ? item.token_decimals : null }]));
  const supportedPools = options.supportedSwapPools || SUPPORTED_SWAP_POOLS;
  const inTotals = new Map(), outTotals = new Map(), swapIn = new Map(), swapOut = new Map(), activities = [], categoriesByHash = new Map(), ambiguousSwaps = [];
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
    const swapLogs = detail.receipt.logs?.filter(log => lower(log.topics?.[0]) === SWAP_TOPIC) || [];
    const related = activities.filter(row => row.category === "TRANSFER" && row.transactionHash === hash && row.movementKind !== "SELF_TRANSFER");
    if (!swapLogs.length) continue;
    const decoded = swapLogs.map(log => ({ log, ...decodeSupportedSwap(log, detail, wallet, related, supportedPools) }));
    const verified = decoded.filter(item => item.value);
    if (verified.length !== 1) {
      ambiguousSwaps.push({ transactionHash: hash, reasons: decoded.map(item => item.reason || "More than one supported Swap event matched; transaction-level attribution is ambiguous."), explorerUrl: explorer(hash) });
      continue;
    }
    const { log, value } = verified[0], inputs = [value.input], outputs = [value.output];
    for (const row of inputs) addExact(swapIn, row.assetAddress, row.rawAmount, { assetAddress: row.assetAddress, symbol: row.symbol, decimals: row.decimals });
    for (const row of outputs) addExact(swapOut, row.assetAddress, row.rawAmount, { assetAddress: row.assetAddress, symbol: row.symbol, decimals: row.decimals });
    push({ id: `${NETWORK.chainId}:${hash}:swap`, category: "SWAP", status: "SUCCESS", transactionHash: hash, blockNumber: Number(BigInt(detail.transaction.blockNumber)), timestampUtc: related[0].timestampUtc, logIndex: Number(BigInt(log.logIndex)), venue: value.venue, protocol: value.protocol, eventSender: value.sender, eventRecipient: value.recipient, poolAmount0: value.amount0, poolAmount1: value.amount1, inputs: inputs.map(({ assetAddress, symbol, decimals, rawAmount, formattedAmount }) => ({ assetAddress, symbol, decimals, rawAmount, formattedAmount })), outputs: outputs.map(({ assetAddress, symbol, decimals, rawAmount, formattedAmount }) => ({ assetAddress, symbol, decimals, rawAmount, formattedAmount })), transactionFrom: wallet, rawAmount: null, classificationEvidence: `Configured ${value.protocol} pool emitted a structurally valid Swap event; recipient is the wallet and exact signed pool deltas uniquely match direct wallet/pool token transfers. ABI: ${value.eventReference}`, explorerUrl: explorer(hash) });
  }

  const hashes = new Set(state.hashes || Object.keys(enriched)); let success = 0, failed = 0, unknownStatus = 0, gasRaw = 0n, knownGasTransactions = 0;
  const unavailableGasTransactionHashes = [];
  for (const hash of hashes) {
    const detail = enriched[hash];
    if (!detail?.receipt) { unknownStatus += 1; unavailableGasTransactionHashes.push(hash); continue; }
    if (ok(detail)) success += 1; else failed += 1;
    if (!detail.transaction) { unavailableGasTransactionHashes.push(hash); continue; }
    if (lower(detail.transaction?.from) !== wallet) continue;
    const gasUsed = detail.receipt.gasUsed, historicalGasPrice = detail.receipt.effectiveGasPrice ?? detail.transaction?.gasPrice;
    if (!validInteger(gasUsed) || !validInteger(historicalGasPrice)) { unavailableGasTransactionHashes.push(hash); continue; }
    gasRaw += BigInt(gasUsed) * BigInt(historicalGasPrice); knownGasTransactions += 1;
  }
  const approvalRows = activities.filter(row => row.category === "APPROVAL"), contractRows = activities.filter(row => row.category === "CONTRACT_INTERACTION"), swapRows = activities.filter(row => row.category === "SWAP");
  const unknownHashes = [...new Set([...hashes].filter(hash => !categoriesByHash.has(hash)).concat(ambiguousSwaps.map(item => item.transactionHash)))];
  const transactionsCoverage = sourceCoverage(discovery, "transactions");
  const allDetailsComplete = [...hashes].every(hash => enriched[hash]?.transaction && enriched[hash]?.receipt);
  const receiptEvidencePresent = Object.values(enriched).some(item => item.receipt);
  const receiptsAndGas = transactionsCoverage === "COMPLETE" && allDetailsComplete && unavailableGasTransactionHashes.length === 0 ? "COMPLETE" : receiptEvidencePresent ? "PARTIAL" : "UNKNOWN";
  const gasStatus = transactionsCoverage === "COMPLETE" && allDetailsComplete && unavailableGasTransactionHashes.length === 0 ? "COMPLETE" : knownGasTransactions > 0 ? "PARTIAL" : "UNKNOWN";
  const coverage = {
    status: "PARTIAL",
    categories: {
      ordinaryTransactions: transactionsCoverage,
      tokenTransfers: sourceCoverage(discovery, "token-transfers"),
      approvals: sourceCoverage(discovery, "approvals"),
      receiptsAndGas,
      nativeInternalTransfers: "UNKNOWN"
    }, failures: [...(discovery.failures || []), ...Object.values(enriched).flatMap(item => item.errors || []).map(error => ({ source: "Official Pharos Chain MCP", error }))]
  };
  const categoryTotals = {
    transfersIn: serializeTotals(inTotals), transfersOut: serializeTotals(outTotals),
    swaps: { transactionCount: swapRows.length, inputs: serializeTotals(swapIn), outputs: serializeTotals(swapOut) },
    approvals: { eventCount: approvalRows.length, uniqueSpenders: new Set(approvalRows.map(row => row.counterparty)).size, grantsOrChanges: approvalRows.filter(row => row.approvalKind === "GRANT_OR_CHANGE").length, revocations: approvalRows.filter(row => row.approvalKind === "REVOKE").length, unlimited: approvalRows.filter(row => row.approvalKind === "UNLIMITED_GRANT").length },
    contractInteractions: { transactionCount: new Set(contractRows.map(row => row.transactionHash)).size, destinations: [...new Set(contractRows.map(row => row.destination))] },
    gas: { status: gasStatus, symbol: NETWORK.nativeSymbol, decimals: 18, raw: gasStatus === "UNKNOWN" ? null : gasRaw.toString(), formatted: gasStatus === "UNKNOWN" ? null : formatUnits(gasRaw, 18), knownTransactionCount: knownGasTransactions, unavailableTransactionCount: unavailableGasTransactionHashes.length, unavailableTransactionHashes: unavailableGasTransactionHashes, attribution: "Known subtotal uses receipt gasUsed × receipt effectiveGasPrice, falling back only to the same historical transaction gasPrice. Only transaction.from equal to the wallet is attributed." }
  };
  const notable = activities.filter(row => row.category === "SWAP" || row.approvalKind === "UNLIMITED_GRANT" || row.status === "FAILED").slice(0, 12).map(row => ({ transactionHash: row.transactionHash, category: row.category, reason: row.category === "SWAP" ? "Verified swap event" : row.approvalKind === "UNLIMITED_GRANT" ? "Unlimited token approval" : "Failed wallet transaction", explorerUrl: row.explorerUrl }));
  const report = { id: state.reportId || crypto.randomUUID(), jobId: state.jobId, generatedAt: now.toISOString(), engineVersion: ENGINE_VERSION, readOnly: true, wallet, network: NETWORK, requestedInterval: { startUtc: state.range.startUtc, endUtc: state.range.endUtc, semantics: state.range.semantics, inclusiveEndConverted: Boolean(state.range.inclusiveEndConverted) }, resolvedBlocks: state.boundaries, coverage, summary: { uniqueTransactions: hashes.size, successful: success, failed, unknownStatus, unknownOrUnclassified: unknownHashes.length, ambiguousSwapCandidates: ambiguousSwaps.length, warning: "Category transaction counts overlap and must not be added to derive unique transaction count." }, categoryTotals, notableTransactions: notable, activities: activities.sort((a, b) => a.blockNumber - b.blockNumber || (a.logIndex ?? -1) - (b.logIndex ?? -1)), ambiguousSwaps, unknownTransactions: unknownHashes, sources: [{ name: "Official Pharos Chain MCP", url: NETWORK.mcpUrl, purpose: "network, exact blocks, transactions, receipts, bytecode" }, { name: "Pharos Explorer API", url: `${NETWORK.indexerUrl}/api-docs`, purpose: "supplementary paginated address-history discovery" }, { name: "Uniswap V3 pool event interface", url: "https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol", purpose: "documented Swap event fields and signed pool-balance deltas" }], limitations: ["Native internal transfers/traces are not available from the configured official MCP or indexed endpoint and are UNKNOWN, not zero.", "Swap verification is limited to explicitly configured pools/routers and requires exact decoded event-to-transfer reconciliation; other candidates remain unclassified.", ...(gasStatus === "COMPLETE" ? [] : ["Wallet-paid gas is a known subtotal or UNKNOWN because one or more historical gas fields or transaction-discovery records were unavailable."]), "Approval rows are historical events; current allowance is not inferred.", "Unknown token metadata remains unlabeled rather than guessed.", "This is an evidence-backed activity statement, not tax, accounting, compliance, or profit advice."] };
  report.executiveSummary = `${wallet} had ${hashes.size} unique relevant transactions in the requested UTC interval: ${success} successful, ${failed} failed, and ${unknownStatus} with unavailable receipt status. The report identified ${swapRows.length} verified swaps, ${approvalRows.length} approval events, and ${categoryTotals.contractInteractions.transactionCount} wallet-initiated contract interactions. Coverage is ${coverage.status}; native internal transfers remain UNKNOWN.`;
  return report;
}
