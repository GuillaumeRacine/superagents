// Node-only transport shared by the managed finance and cash snapshots.
// Import through a server-only data module after its access check.
import { gunzipSync } from "node:zlib";

export const MAX_ENCODED_BYTES = 48000;
export const MAX_DECODED_BYTES = 2000000;

// `readJson` handles the plain JSON variable (including its own size bound),
// `validate` normalizes a parsed object, `empty` is the fail-closed value.
export function readSnapshotTransport({
  json,
  gzipBase64,
  readJson,
  validate,
  empty,
}) {
  // Presence selects this transport: an invalid compressed baseline must never
  // silently reveal an older JSON baseline, including an explicitly empty value.
  if (gzipBase64 === undefined) return readJson(json);
  try {
    if (
      typeof gzipBase64 !== "string" ||
      gzipBase64.length === 0 ||
      Buffer.byteLength(gzipBase64, "utf8") > MAX_ENCODED_BYTES ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        gzipBase64,
      )
    )
      throw Error("Invalid compressed snapshot encoding.");
    const compressed = Buffer.from(gzipBase64, "base64");
    if (compressed.toString("base64") !== gzipBase64)
      throw Error("Noncanonical compressed snapshot encoding.");
    const bytes = gunzipSync(compressed, {
      maxOutputLength: MAX_DECODED_BYTES,
    });
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { state: "ready", snapshot: validate(JSON.parse(text)) };
  } catch {
    return { state: "invalid", snapshot: empty() };
  }
}
