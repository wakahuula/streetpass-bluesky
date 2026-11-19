// Renders the Chrome Web Store graphics into store/ (committed):
//   icon-128.png         store icon, 96px artwork with 16px transparent margin
//   screenshot-1.jpg     1280x800, light popup
//   screenshot-2.jpg     1280x800, dark popup
//   promo-small.jpg      440x280
//   promo-marquee.jpg    1400x560
// Uses the popup screenshots in site/ (npm run screenshots) and Playwright's
// Chromium. The store wants JPEG or PNG without alpha for everything but the icon.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { chromium } from "playwright";
import { iconSvg } from "./icons.ts";

const out = "store";
// The HTML pages the images are rendered from; build output, not committed.
const pages = "dist/store-pages";
mkdirSync(out, { recursive: true });
mkdirSync(pages, { recursive: true });

// Store icon: shrink the 100-unit artwork to 96 of 128 pixels by widening the viewBox.
const padded = iconSvg().replace('viewBox="0 0 100 100"', 'viewBox="-16.667 -16.667 133.333 133.333"');
writeFileSync(`${out}/icon-128.png`, new Resvg(padded, { fitTo: { mode: "width", value: 128 } }).render().asPng());

const file = (path: string) => pathToFileURL(resolve(path)).href;
const font = file(
  "node_modules/@fontsource-variable/google-sans-flex/files/google-sans-flex-latin-wght-normal.woff2",
);
const logo = `data:image/svg+xml;base64,${Buffer.from(iconSvg()).toString("base64")}`;

// Light and dark surfaces from src/theme.css.
const light = { bg: "#dae1ff", fg: "#003fa4", text: "#181b25" };
const dark = { bg: "#10131c", fg: "#b3c5ff", text: "#e0e2ef" };

function page(body: string, colors: typeof light): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: "Google Sans Flex"; font-weight: 100 1000; src: url("${font}") format("woff2"); }
    * { box-sizing: border-box; margin: 0; }
    body { width: 100vw; height: 100vh; overflow: hidden; display: flex; align-items: center;
      background: ${colors.bg}; color: ${colors.text}; font-family: "Google Sans Flex", sans-serif; }
    h1 { text-wrap: balance; font-weight: 600; letter-spacing: -0.02em; color: ${colors.fg}; }
    p { font-weight: 400; }
    .popup { border-radius: 28px; border: 1px solid rgb(127 127 127 / 0.25); overflow: hidden; flex: none; }
    .popup img { display: block; width: 100%; }
  </style></head><body>${body}</body></html>`;
}

const popupLight = file("site/popup-light.png");
const popupDark = file("site/popup-dark.png");

const assets: Array<{ name: string; width: number; height: number; html: string }> = [
  {
    name: "screenshot-1.jpg",
    width: 1280,
    height: 800,
    html: page(
      `<div style="display:flex;align-items:center;gap:96px;padding:0 120px;width:100%">
        <div style="flex:1">
          <img src="${logo}" width="96" height="96" alt="">
          <h1 style="font-size:56px;line-height:64px;margin-top:32px">Find the people behind the sites you visit</h1>
          <p style="font-size:24px;line-height:34px;margin-top:24px">Domain handles and rel="me" links, checked with Bluesky.</p>
        </div>
        <div class="popup" style="width:360px"><img src="${popupLight}" alt=""></div>
      </div>`,
      light,
    ),
  },
  {
    name: "screenshot-2.jpg",
    width: 1280,
    height: 800,
    html: page(
      `<div style="display:flex;align-items:center;gap:96px;padding:0 120px;width:100%">
        <div style="flex:1">
          <h1 style="font-size:56px;line-height:64px">Your list stays on your device</h1>
          <p style="font-size:24px;line-height:34px;margin-top:24px">No account, no analytics, no server of its own. Pause it any time, or turn it off for single sites.</p>
        </div>
        <div class="popup" style="width:360px"><img src="${popupDark}" alt=""></div>
      </div>`,
      dark,
    ),
  },
  {
    name: "promo-small.jpg",
    width: 440,
    height: 280,
    html: page(
      `<div style="display:flex;flex-direction:column;align-items:center;gap:20px;width:100%">
        <img src="${logo}" width="112" height="112" alt="">
        <h1 style="font-size:30px;line-height:36px">StreetPass for Bluesky</h1>
      </div>`,
      light,
    ),
  },
  {
    name: "promo-marquee.jpg",
    width: 1400,
    height: 560,
    html: page(
      `<div style="display:flex;align-items:center;justify-content:space-between;width:100%;height:100%;padding:0 120px">
        <div>
          <img src="${logo}" width="120" height="120" alt="">
          <h1 style="font-size:64px;line-height:72px;margin-top:28px">StreetPass for Bluesky</h1>
          <p style="font-size:28px;line-height:38px;margin-top:16px">Finds the Bluesky accounts behind the sites you visit.</p>
        </div>
        <div class="popup" style="width:360px;align-self:flex-start;margin-top:64px;border-bottom:0;border-radius:28px 28px 0 0"><img src="${popupLight}" alt=""></div>
      </div>`,
      light,
    ),
  },
];

const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const asset of assets) {
    const tab = await browser.newPage({ viewport: { width: asset.width, height: asset.height } });
    const path = resolve(pages, `${asset.name}.html`);
    writeFileSync(path, asset.html);
    await tab.goto(pathToFileURL(path).href);
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: `${out}/${asset.name}`, type: "jpeg", quality: 92 });
    console.log(`${out}/${asset.name}  ${asset.width}x${asset.height}`);
  }
} finally {
  await browser.close();
}
console.log(`${out}/icon-128.png  128x128`);
