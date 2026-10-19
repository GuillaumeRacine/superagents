// Node-only transport. Import through finance-data.ts after its access check.
import {
  emptyFinance,
  readFinance,
  validateFinance,
} from "./finance-model.mjs";
import { readSnapshotTransport } from "./snapshot-transport.mjs";

export function readFinanceSnapshot({ json, gzipBase64 } = {}) {
  return readSnapshotTransport({
    json,
    gzipBase64,
    readJson: readFinance,
    validate: validateFinance,
    empty: emptyFinance,
  });
}
