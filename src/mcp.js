import { NETWORK } from "./constants.js";

export function parseToolResult(result, tool) {
  if (result?.isError) throw new Error(`${tool} failed`);
  const text = result?.content?.find(item => item.type === "text")?.text;
  if (!text) throw new Error(`${tool} returned no JSON text`);
  return JSON.parse(text);
}

export async function createMcpCaller() {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
  ]);
  const client = new Client({ name: "pharos-audit-log-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(NETWORK.mcpUrl), { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60000) }) });
  await client.connect(transport);
  const call = async (name, args = {}) => parseToolResult(await client.callTool({ name, arguments: args }), name);
  const chain = await call("get_chain_info", {});
  if (chain.chainId !== NETWORK.chainId) throw new Error(`Expected chain ${NETWORK.chainId}; received ${chain.chainId}.`);
  return { call, close: async () => { try { await transport.terminateSession(); } catch {} await client.close(); } };
}
