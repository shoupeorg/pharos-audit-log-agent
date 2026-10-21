export function formatUnits(raw, decimals) {
  const value = BigInt(raw ?? 0), d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 255) return null;
  const negative = value < 0n, absolute = negative ? -value : value, base = 10n ** BigInt(d);
  const whole = absolute / base, fraction = d ? (absolute % base).toString().padStart(d, "0").replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
export function sumRaw(values) { return values.reduce((total, value) => total + BigInt(value), 0n).toString(); }
export function addExact(map, key, raw, meta = {}) {
  const current = map.get(key) || { ...meta, raw: "0", count: 0 };
  current.raw = (BigInt(current.raw) + BigInt(raw)).toString(); current.count += 1; map.set(key, current);
}
export const hexToBigIntString = value => BigInt(value || "0x0").toString();
export const hexToNumber = value => Number(BigInt(value || "0x0"));
