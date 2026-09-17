import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { encode } from "next-auth/jwt";
import { emptyFinance, validateFinance } from "../lib/finance-model.mjs";
const secret = "synthetic-finance-verification-only",
  marker = "SYNTHETIC_PRIVATE_FINANCE_SENTINEL";
const fixture = validateFinance({
  ...emptyFinance(),
  entities: [{ id: "example", name: marker, kind: "holding" }],
});
assert(
  !existsSync(".next/server/app/finance.html"),
  "Finance must not be prerendered",
);
function scan(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, e.name);
    if (e.isDirectory()) scan(file);
    else
      assert(
        !readFileSync(file).includes(Buffer.from(marker)),
        `Private marker in ${file}`,
      );
  }
}
scan("public");
scan(".next/static");
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    env: {
      ...process.env,
      AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "example",
      AUTH_GOOGLE_SECRET: "example",
      AUTH_TRUST_HOST: "true",
      AUTHORIZED_GOOGLE_EMAILS: "owner@example.com,second@example.com",
      FINANCE_SNAPSHOT_JSON: JSON.stringify(fixture),
    },
    stdio: "ignore",
  },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + "/robots.txt");
      ready = true;
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Local server must start");
  for (const [label, email, maxAge] of [
    ["owner", "owner@example.com", 600],
    ["second", "second@example.com", 600],
    ["disallowed", "other@example.com", 600],
    ["expired", "owner@example.com", -100],
    ["missing", null, 0],
    ["invalid", null, 0],
  ]) {
    const token = email
      ? await encode({
          secret,
          salt: "authjs.session-token",
          token: { email },
          maxAge,
        })
      : label === "invalid"
        ? "invalid"
        : "";
    for (const path of ["/finance", "/api/finance", "/finance?_rsc"]) {
      const r = await fetch(base + path, {
        redirect: "manual",
        headers: {
          cookie: `authjs.session-token=${token}`,
          ...(path.includes("_rsc") ? { RSC: "1" } : {}),
          "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy",
        },
      });
      const body = await r.text();
      if (["owner", "second"].includes(label)) {
        assert.equal(r.status, 200);
        assert(body.includes(marker));
        assert.match(r.headers.get("cache-control"), /no-store/);
        if (path === "/api/finance")
          assert.deepEqual(JSON.parse(body).snapshot, fixture);
      } else {
        assert([307, 401].includes(r.status));
        assert(!body.includes(marker));
      }
    }
    console.log(`PASS finance ${label}: HTML/API/RSC`);
  }
  const post = await fetch(base + "/api/finance", {
    method: "POST",
    headers: {
      cookie: `authjs.session-token=${await encode({ secret, salt: "authjs.session-token", token: { email: "owner@example.com" }, maxAge: 600 })}`,
    },
  });
  assert.equal(post.status, 405, "No unapproved write endpoint");
  console.log(
    "PASS finance public asset exclusion, no-store and no write endpoint",
  );
} finally {
  server.kill();
}
