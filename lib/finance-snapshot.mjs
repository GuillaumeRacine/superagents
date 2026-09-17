// Node-only transport. Import through finance-data.ts after its access check.
import { gunzipSync } from "node:zlib";
import {
  emptyFinance,
  readFinance,
  validateFinance,
} from "./finance-model.mjs";

const MAX_ENCODED_BYTES = 48000;
const MAX_DECODED_BYTES = 2000000;

export function readFinanceSnapshot({ json, gzipBase64 } = {}) {
  // Presence selects this transport: an invalid compressed baseline must never
  // silently reveal an older JSON baseline, including an explicitly empty value.
  if (gzipBase64 === undefined) return readFinance(json);
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
    return { state: "ready", snapshot: validateFinance(JSON.parse(text)) };
  } catch {
    return { state: "invalid", snapshot: emptyFinance() };
  }
}
