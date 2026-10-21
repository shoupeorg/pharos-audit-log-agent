export const ENGINE_VERSION = "audit-log-agent/1.1.0";
export const NETWORK = { name: "Pharos Pacific Mainnet", chainId: 1672, nativeSymbol: "PROS", rpcUrl: "https://rpc.pharos.xyz", mcpUrl: "https://mcp.pharos.xyz/mcp", officialExplorerUrl: "https://www.pharosscan.xyz", explorerUrl: "https://pharos.exploreme.pro", indexerUrl: "https://pharos.exploreme.pro" };
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
export const SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
export const SUPPORTED_SWAP_POOLS = Object.freeze({
  "0x912c9ade24d44d8922f0866d8dcb079f1363f647": Object.freeze({
    protocol: "Uniswap V3-compatible",
    token0: "0x52c48d4213107b20bc583832b0d951fb9ca8f0b0",
    token1: "0xc879c018db60520f4355c26ed1a6d572cdac1815",
    routers: Object.freeze(["0x869379f2d9df67891e0159dd2520dc1681908f10"]),
    eventReference: "https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol"
  })
});
export const LIMITS = { maxIntervalMs: 24 * 60 * 60 * 1000, maxPagesPerSource: 20, pageSize: 50, maxTransactions: 120, enrichPerStep: 8 };
export const ZERO = "0x0000000000000000000000000000000000000000";
