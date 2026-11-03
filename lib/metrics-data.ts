import "server-only";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { readCashSnapshot } from "@/lib/cash-snapshot.mjs";
import { MAX_JSON_BYTES, emptyMetrics, readMetricsText } from "@/lib/metrics-model.mjs";

// Live core metrics (issue #61): data/metrics.json on the default branch of the
// private MoneyOS repository, read at request time through the GitHub API with a
// fine-grained read-only token, cached by Next for REVALIDATE_SECONDS.
// Fail closed: any fetch, size, parse or validation problem returns
// { state: "fallback", reason } and the page renders the env snapshot instead.
// The repository name and the token never reach the client, the HTML or the logs:
// reasons below name a class of failure, never the URL or the response body.
export const REVALIDATE_SECONDS = 300;
export const FETCH_TIMEOUT_MS = 8000;

export type MetricsResult = {
  state: "ready" | "fallback";
  reason: string;
  metrics: ReturnType<typeof emptyMetrics>;
  // How the file was obtained, for the as-of bar: "repository" or "file".
  via: "repository" | "file" | "none";
  // Commit sha of data/metrics.json on the default branch: the content is read at
  // exactly this ref, so the pair cannot disagree. Null for the file transport.
  commitSha: string | null;
  // How old the body may be: a repository read is served from Next's data cache
  // for up to REVALIDATE_SECONDS; a file read happens at render.
  cacheMaxAgeSeconds: number;
};

const fallback = (reason: string, via: MetricsResult["via"] = "none"): MetricsResult => ({
  state: "fallback",
  reason,
  metrics: emptyMetrics(),
  via,
  commitSha: null,
  cacheMaxAgeSeconds: 0,
});

const finish = (read: ReturnType<typeof readMetricsText>, via: MetricsResult["via"], commitSha: string | null, cacheMaxAgeSeconds: number): MetricsResult => ({
  state: read.state === "ready" ? "ready" : "fallback",
  reason: read.reason,
  metrics: read.metrics,
  via,
  commitSha,
  cacheMaxAgeSeconds,
});

async function fromFile(path: string): Promise<MetricsResult> {
  if (!isAbsolute(path)) return fallback("MONEYOS_METRICS_FILE must be an absolute path", "file");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return fallback("local metrics file could not be read", "file");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) return fallback(`file larger than ${MAX_JSON_BYTES / 1000} KB`, "file");
  return finish(readMetricsText(text), "file", null, 0);
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "superagents-dashboard",
});

const github = (path: string, token: string, accept?: string) =>
  fetch(`https://api.github.com/repos/${path}`, {
    headers: { ...githubHeaders(token), ...(accept ? { Accept: accept } : {}) },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

const fetchFailure = (error: unknown, what: string) => {
  const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return timedOut ? `${what} timed out after ${FETCH_TIMEOUT_MS / 1000} s` : `${what} failed (network)`;
};

// Read a body with a hard byte ceiling, whatever content-length says.
async function boundedText(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

async function fromRepository(repo: string, token: string): Promise<MetricsResult> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return fallback("MONEYOS_REPO is not owner/name", "repository");
  // 1. The latest commit touching the file; 2. the content at exactly that sha.
  let sha: string;
  try {
    const commits = await github(`${repo}/commits?path=data/metrics.json&sha=main&per_page=1`, token);
    if (commits.status !== 200) return fallback(`repository commit lookup returned HTTP ${commits.status}`, "repository");
    const body: unknown = await commits.json();
    const found = Array.isArray(body) && body[0] && typeof body[0].sha === "string" ? body[0].sha : null;
    if (!found || !/^[0-9a-f]{40}$/.test(found)) return fallback("repository has no commit for data/metrics.json on main", "repository");
    sha = found;
  } catch (error) {
    return fallback(fetchFailure(error, "repository commit lookup"), "repository");
  }
  let response: Response;
  try {
    response = await github(`${repo}/contents/data/metrics.json?ref=${sha}`, token, "application/vnd.github.raw+json");
  } catch (error) {
    return fallback(fetchFailure(error, "repository read"), "repository");
  }
  if (response.status !== 200) return fallback(`repository read returned HTTP ${response.status}`, "repository");
  let text: string | null;
  try {
    text = await boundedText(response);
  } catch {
    return fallback("repository response could not be read", "repository");
  }
  if (text === null) return fallback(`file larger than ${MAX_JSON_BYTES / 1000} KB`, "repository");
  return finish(readMetricsText(text), "repository", sha, REVALIDATE_SECONDS);
}

// No gate here: callers gate once and pass nothing private in.
async function loadMetrics(): Promise<MetricsResult> {
  const file = process.env.MONEYOS_METRICS_FILE;
  if (file) return fromFile(file);
  const repo = process.env.MONEYOS_REPO;
  const token = process.env.MONEYOS_READ_TOKEN;
  if (!repo || !token) return fallback("live metrics not configured (MONEYOS_REPO and MONEYOS_READ_TOKEN)");
  return fromRepository(repo, token);
}

export type CashDashboardData =
  | { live: MetricsResult & { state: "ready" }; snapshot: null }
  | { live: MetricsResult & { state: "fallback" }; snapshot: ReturnType<typeof readCashSnapshot> };

// One allowlist check per request (same rule as getCashData: the session email
// must match the exact allowlist, else null and the page redirects to sign-in).
// The env snapshot is read and validated only when the live read fell back, so a
// render never holds both sources.
export async function getCashDataWithLiveMetrics(): Promise<CashDashboardData | null> {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) return null;
  const live = await loadMetrics();
  if (live.state === "ready") return { live: live as MetricsResult & { state: "ready" }, snapshot: null };
  return {
    live: live as MetricsResult & { state: "fallback" },
    snapshot: readCashSnapshot({
      json: process.env.CASH_SNAPSHOT_JSON,
      gzipBase64: process.env.CASH_SNAPSHOT_GZIP_BASE64,
    }),
  };
}
