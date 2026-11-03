import "server-only";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/access-policy.mjs";
import { MAX_JSON_BYTES, emptyMetrics, readMetricsText } from "@/lib/metrics-model.mjs";

// Live core metrics (issue #61): data/metrics.json on the default branch of the
// private MoneyOS repository, read at request time through the GitHub contents
// API with a fine-grained read-only token, cached by Next for REVALIDATE_SECONDS.
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
  fetchedAt: string;
  // Commit sha of data/metrics.json on the default branch (one light commits call,
  // same revalidate); null for the file transport or when the call fails. Informational.
  commitSha: string | null;
};

const fallback = (reason: string, via: MetricsResult["via"] = "none"): MetricsResult => ({
  state: "fallback",
  reason,
  metrics: emptyMetrics(),
  via,
  fetchedAt: new Date().toISOString(),
  commitSha: null,
});

const finish = (read: ReturnType<typeof readMetricsText>, via: MetricsResult["via"], commitSha: string | null = null): MetricsResult => ({
  state: read.state === "ready" ? "ready" : "fallback",
  reason: read.reason,
  metrics: read.metrics,
  via,
  fetchedAt: new Date().toISOString(),
  commitSha,
});

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "superagents-dashboard",
});

// Latest commit touching the file. Any failure yields null: the figure is informational.
async function fileCommitSha(repo: string, token: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits?path=data/metrics.json&sha=main&per_page=1`, {
      headers: githubHeaders(token),
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status !== 200) return null;
    const body: unknown = await response.json();
    const sha = Array.isArray(body) && body[0] && typeof body[0].sha === "string" ? body[0].sha : null;
    return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

async function fromFile(path: string): Promise<MetricsResult> {
  if (!isAbsolute(path)) return fallback("MONEYOS_METRICS_FILE must be an absolute path", "file");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return fallback("local metrics file could not be read", "file");
  }
  return finish(readMetricsText(text), "file");
}

async function fromRepository(repo: string, token: string): Promise<MetricsResult> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return fallback("MONEYOS_REPO is not owner/name", "repository");
  const url = `https://api.github.com/repos/${repo}/contents/data/metrics.json?ref=main`;
  let response: Response;
  const commit = fileCommitSha(repo, token);
  try {
    response = await fetch(url, {
      headers: { ...githubHeaders(token), Accept: "application/vnd.github.raw+json" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return fallback(timedOut ? `repository read timed out after ${FETCH_TIMEOUT_MS / 1000} s` : "repository read failed (network)", "repository");
  }
  if (response.status !== 200) return fallback(`repository read returned HTTP ${response.status}`, "repository");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_JSON_BYTES) return fallback(`file larger than ${MAX_JSON_BYTES / 1000} KB`, "repository");
  let text: string;
  try {
    text = await response.text();
  } catch {
    return fallback("repository response could not be read", "repository");
  }
  return finish(readMetricsText(text), "repository", await commit);
}

// Same gate as getCashData: the session email must match the exact allowlist.
// Returns null when the caller is not allowed, so the page redirects to sign-in.
export async function getMetricsData(): Promise<MetricsResult | null> {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) return null;
  const file = process.env.MONEYOS_METRICS_FILE;
  if (file) return fromFile(file);
  const repo = process.env.MONEYOS_REPO;
  const token = process.env.MONEYOS_READ_TOKEN;
  if (!repo || !token) return fallback("live metrics not configured (MONEYOS_REPO and MONEYOS_READ_TOKEN)");
  return fromRepository(repo, token);
}
