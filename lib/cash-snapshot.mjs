// Node-only transport. Import through cash-data.ts after its access check.
import { emptyCash, readCash, validateCash } from "./cash-model.mjs";
import { readSnapshotTransport } from "./snapshot-transport.mjs";

export function readCashSnapshot({ json, gzipBase64 } = {}) {
  return readSnapshotTransport({
    json,
    gzipBase64,
    readJson: readCash,
    validate: validateCash,
    empty: emptyCash,
  });
}
