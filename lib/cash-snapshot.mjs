// Node-only transport for the Cash snapshot. Import through cash-data.ts after its access check.
import { gunzipSync } from "node:zlib";
import { readCashText } from "./cash-model.mjs";

const MAX_ENCODED_BYTES = 48000;
const MAX_DECODED_BYTES = 2000000;

export function readCashSnapshot({ json, gzipBase64 } = {}) {
  if (gzipBase64 === undefined) return readCashText(json);
  try {
    if (
      typeof gzipBase64 !== "string" ||
      gzipBase64.length === 0 ||
      Buffer.byteLength(gzipBase64, "utf8") > MAX_ENCODED_BYTES ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(gzipBase64)
    )
      throw Error("Invalid compressed snapshot encoding.");
    const compressed = Buffer.from(gzipBase64, "base64");
    if (compressed.toString("base64") !== gzipBase64) throw Error("Noncanonical encoding.");
    const bytes = gunzipSync(compressed, { maxOutputLength: MAX_DECODED_BYTES });
    return readCashText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { state: "invalid", snapshot: null };
  }
}
