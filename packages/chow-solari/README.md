# chow-solari

Shared Solari client wrapper for all `solari-chow` examples — browsers, sandboxes, and desktops behind a single mock/real switch. Without `SOLARI_API_KEY` every call returns a promise-based mock that logs with `[mock]` and returns plausible fake data so CI and reviewers can run `npm start` with no billing; with a key it constructs `new Solari({ apiKey, baseUrl: "https://api.getsolari.com" })` and on `402`/`403` (Free-tier limits like stealth/proxy) retries once with minimal options before gracefully falling back to the mock with a warning.

```ts
import { launchBrowser, createSandbox, createDesktop, safeClose, safeKill, safeDestroy, CHOW_BANNER } from "chow-solari";

console.log(CHOW_BANNER); // "Chow 🤝 Harry Chow — Shop OS on solari"

const browser = await launchBrowser({ stealth: true, recording: true });
try {
  const page = await (browser as any).newPage();
  await page.goto("http://100.111.182.5:5173");
  console.log(await page.title());
} finally {
  // Cookbook gotcha: await solari.close() can hang — always call in finally with timeout.
  await safeClose(browser as any);
}

const sandbox = await createSandbox({ template: "base", timeoutMs: 60_000 }); // timeoutMs is a rolling window — resets on activity
try {
  await (sandbox as any).files.write("/tmp/hello.py", "print('chow')");
  console.log(await (sandbox as any).commands.run("python /tmp/hello.py"));
} finally {
  await safeKill(sandbox as any);
}

const desktop = await createDesktop({ width: 1280, height: 720 });
try {
  await (desktop as any).health();
} finally {
  await safeDestroy(desktop as any); // handles kill()/destroy()/close() shape differences
}
```
