import fs from "node:fs";

const baseUrl = "https://pharos-audit-log-agent.shoupeorg.workers.dev";
const demos = [
  {
    name: "swap",
    reportId: "b62de151-d7d4-4b97-a3e9-c27deb49a8f5",
    hash: "0xa2d0fd2a0289352badaf4f151c46dfd807de12d7f43b4008f236e4ca7bfe6399",
    validate(report) {
      if (report.categoryTotals.swaps.transactionCount !== 1) throw new Error("Expected one verified swap.");
      if (report.categoryTotals.contractInteractions.transactionCount !== 1) throw new Error("Expected one contract interaction.");
      if (report.categoryTotals.transfersIn[0]?.raw !== "405504132963356908833") throw new Error("Unexpected WPROS input total.");
      if (report.categoryTotals.transfersOut[0]?.raw !== "253325339") throw new Error("Unexpected USDC output total.");
      if (report.categoryTotals.gas.status !== "COMPLETE" || report.categoryTotals.gas.raw !== "1945095000000000") throw new Error("Historical swap gas is not complete and exact.");
    },
  },
  {
    name: "approval",
    reportId: "a02bdc03-a610-49a7-b223-225afc297679",
    hash: "0x97b338cfc17837e963bf123e1afb07d5377b6c451c9280b88e76d82f4ada86ea",
    validate(report) {
      if (report.categoryTotals.approvals.eventCount !== 1 || report.categoryTotals.approvals.unlimited !== 1) throw new Error("Expected one unlimited approval.");
      if (report.categoryTotals.gas.status !== "PARTIAL" || report.categoryTotals.gas.raw !== "464230000000000") throw new Error("Unexpected known approval gas subtotal.");
      if (report.coverage.categories.approvals !== "COMPLETE") throw new Error("Approval discovery is not complete.");
    },
  },
];

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response;
}

for (const demo of demos) {
  const report = await (await get(`/api/reports/${demo.reportId}`)).json();
  const markdown = await (await get(`/api/reports/${demo.reportId}/markdown`)).text();
  const csv = await (await get(`/api/reports/${demo.reportId}/csv`)).text();

  if (report.engineVersion !== "audit-log-agent/1.1.0") throw new Error(`Unexpected ${demo.name} engine version.`);
  demo.validate(report);
  if (!report.activities.every((row) => row.transactionHash === demo.hash)) throw new Error(`Unexpected transaction in ${demo.name} report.`);
  if (!markdown.includes(demo.hash)) throw new Error(`${demo.name} Markdown disagrees with persisted report.`);
  if (csv.trim().split(/\r?\n/).length - 1 !== report.activities.length || !csv.includes(demo.hash)) throw new Error(`${demo.name} CSV disagrees with persisted activities.`);

  fs.writeFileSync(`evidence/v1.1-live-${demo.name}-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`evidence/v1.1-live-${demo.name}-report.md`, markdown);
  fs.writeFileSync(`evidence/v1.1-live-${demo.name}-report.csv`, csv);
  console.log(JSON.stringify({ name: demo.name, reportId: demo.reportId, engineVersion: report.engineVersion, coverage: report.coverage.status, activities: report.activities.length, gas: report.categoryTotals.gas }));
}
