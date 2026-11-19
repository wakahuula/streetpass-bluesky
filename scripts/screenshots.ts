// Renders the popup screenshots for the website (site/popup-light.png and
// site/popup-dark.png) from the real Chrome build, filled with made-up people.
// Run with `npm run screenshots`, which builds dist/chrome first.
// Needs Playwright's Chromium once: npx playwright install chromium

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import type { People, Person } from "../src/lib/people.ts";

const extension = resolve("dist/chrome");
const now = Date.now();

function person(name: string, handle: string, foundOn: string, verified: boolean, ago: number): Person {
  const did = `did:plc:${handle.split(".")[0]}`;
  return { did, handle, displayName: name, foundOn, verified, foundAt: now - ago, refreshedAt: now };
}

// .example handles can't belong to anyone real.
const mira = person("Mira Lindqvist", "mira.example", "mira.example", true, 60_000);
const people: People = {
  [mira.did]: mira,
  "did:plc:jonas": person("Jonas Okafor", "jonas.example", "jonas.example", true, 2 * 3_600_000),
  "did:plc:sam": person("Sam Teller", "sam.example", "journal.example", false, 5 * 3_600_000),
};

const context = await chromium.launchPersistentContext("", {
  // The full Chromium in headless mode; Playwright's slimmer headless shell
  // can't load extensions.
  channel: "chromium",
  headless: true,
  deviceScaleFactor: 2,
  viewport: { width: 360, height: 600 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  await worker.evaluate((p) => chrome.storage.local.set({ people: p, dnsLookup: false }), people);

  // Opened as a tab, the popup sees itself as the active tab. Telling the
  // background that this tab shows Mira puts her under "On this page".
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  const tabId = await page.evaluate(async () => (await chrome.tabs.getCurrent())?.id);
  await worker.evaluate(
    ([tab, did]) => chrome.storage.session.set({ tabs: { [String(tab)]: { url: "https://mira.example/", dids: [did] } } }),
    [tabId, mira.did] as const,
  );

  let height = 0;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await page.waitForSelector(".person");
    height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 360, height });
    await page.screenshot({ path: `site/popup-${scheme}.png` });
    console.log(`site/popup-${scheme}.png  360x${height}`);
  }

  // Keep the <img> size in the page in step, so the layout doesn't jump.
  const html = readFileSync("site/index.html", "utf8");
  const updated = html.replace(/(src="popup-light\.png"\s+width="360"\s+height=")\d+/, `$1${height}`);
  if (updated === html && !html.includes(`height="${height}"`)) {
    throw new Error("Couldn't find the screenshot <img> in site/index.html to update its height.");
  }
  writeFileSync("site/index.html", updated);
} finally {
  await context.close();
}
