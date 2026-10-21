import { ENGINE_VERSION, NETWORK } from "./constants.js";
import { parseNaturalRequest, answerFollowUp } from "./agent.js";
import { initialState, stepPipeline } from "./pipeline.js";
import { createMcpCaller } from "./mcp.js";
import { getJob, getJobByKey, getReport, listReports, saveJob, saveReport } from "./store.js";
import { reportCsv, reportMarkdown } from "./exports.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const rate = new Map();
function limited(request) { const key = request.headers.get("cf-connecting-ip") || "local", now = Date.now(), entries = (rate.get(key) || []).filter(time => now - time < 60000); entries.push(now); rate.set(key, entries); return entries.length > 30; }
async function body(request) { try { return await request.json(); } catch { throw new Error("Request body must be valid JSON."); } }

async function route(request, env) {
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/api/meta") return json({ network: NETWORK, engineVersion: ENGINE_VERSION, readOnly: true, intervalLimitHours: 24, exports: ["markdown", "csv"] });
  if (url.pathname === "/api/parse" && request.method === "POST") return json(parseNaturalRequest((await body(request)).request || ""));
  if (url.pathname === "/api/jobs" && request.method === "POST") {
    if (limited(request)) return json({ error: "Rate limit exceeded; retry after one minute." }, 429);
    const input = await body(request), requestKey = String(input.requestKey || crypto.randomUUID());
    const existing = await getJobByKey(env.DB, requestKey); if (existing) return json(existing);
    const jobId = crypto.randomUUID(), state = initialState({ ...input, jobId }); await saveJob(env.DB, state, requestKey); return json(state, 202);
  }
  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && request.method === "GET") { const job = await getJob(env.DB, parts[2]); return job ? json(job.state) : json({ error: "Job not found." }, 404); }
  if (parts[0] === "api" && parts[1] === "jobs" && parts[2] && parts[3] === "step" && request.method === "POST") {
    if (limited(request)) return json({ error: "Rate limit exceeded; retry after one minute." }, 429);
    const stored = await getJob(env.DB, parts[2]); if (!stored) return json({ error: "Job not found." }, 404);
    if (stored.state.status !== "RUNNING") return json(stored.state);
    let live = null;
    try {
      if (["RESOLVING_DATES", "FETCHING_RECEIPTS"].includes(stored.state.phase)) live = await createMcpCaller();
      const next = await stepPipeline(stored.state, { call: live?.call, fetchImpl: fetch });
      await saveJob(env.DB, next, stored.requestKey); if (next.report) await saveReport(env.DB, next.report); return json(next);
    } catch (error) {
      const failed = { ...stored.state, status: "FAILED", phase: "FAILED", error: error.message, updatedAt: new Date().toISOString() }; await saveJob(env.DB, failed, stored.requestKey); return json(failed, 400);
    } finally { if (live) await live.close(); }
  }
  if (url.pathname === "/api/reports" && request.method === "GET") return json({ reports: await listReports(env.DB) });
  if (parts[0] === "api" && parts[1] === "reports" && parts[2]) {
    const report = await getReport(env.DB, parts[2]); if (!report) return json({ error: "Report not found." }, 404);
    if (parts.length === 3 && request.method === "GET") return json({ ...report, historical: true });
    if (parts[3] === "markdown" && request.method === "GET") return new Response(reportMarkdown(report), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="pharos-wallet-statement-${report.id}.md"` } });
    if (parts[3] === "csv" && request.method === "GET") return new Response(reportCsv(report), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pharos-wallet-activity-${report.id}.csv"` } });
    if (parts[3] === "ask" && request.method === "POST") return json(answerFollowUp(report, (await body(request)).question || ""));
  }
  return env.ASSETS.fetch(request);
}
export default { async fetch(request, env) { try { return await route(request, env); } catch (error) { return json({ error: error.message, readOnly: true }, 400); } } };
