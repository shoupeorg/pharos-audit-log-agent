export function parseNaturalRequest(text) {
  const address = text.match(/0x[a-fA-F0-9]{40}/)?.[0]?.toLowerCase() || null;
  const dates = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z)?\b/g)].map(match => match[0]);
  return { wallet: address, start: dates[0] || null, end: dates[1] || null, needsClarification: !address || dates.length < 2, parser: "Deterministic address/date parser; no LLM reasoning claimed." };
}
export function answerFollowUp(report, question) {
  const q = question.toLowerCase();
  if (/largest|outgoing/.test(q)) return { answer: report.activities.filter(row => row.category === "TRANSFER" && row.direction === "OUT").sort((a,b)=>BigInt(a.rawAmount)===BigInt(b.rawAmount)?0:BigInt(a.rawAmount)>BigInt(b.rawAmount)?-1:1).slice(0,5), grounding: "Persisted transfer rows" };
  if (/approval|spender/.test(q)) return { answer: report.activities.filter(row => row.category === "APPROVAL"), grounding: "Persisted Approval-event rows" };
  if (/protocol|contract|interact/.test(q)) return { answer: report.activities.filter(row => row.category === "CONTRACT_INTERACTION"), grounding: "Persisted wallet-initiated contract calls" };
  if (/gas/.test(q)) return { answer: report.categoryTotals.gas, grounding: "Persisted receipt gasUsed × effectiveGasPrice" };
  if (/unknown|unclassified/.test(q)) return { answer: { hashes: report.unknownTransactions, coverage: report.coverage }, grounding: "Persisted classification and coverage" };
  return { answer: "Choose a grounded follow-up about outgoing transfers, approvals, contract interactions, gas, or unclassified activity.", grounding: "Supported deterministic follow-ups" };
}
