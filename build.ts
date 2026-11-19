// Builds the extension into dist/<browser>/.
//   node build.ts                    all browsers
//   node build.ts --target=firefox   one browser
//   node build.ts --watch            Chrome (or --target), rebuilds on change

import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { INACTIVE, iconPng } from "./scripts/icons.ts";
import { cookieSvg } from "./scripts/shape.ts";

const TARGETS = ["chrome", "firefox"] as const;
type Target = (typeof TARGETS)[number];

const watch = process.argv.includes("--watch");
const picked = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length);
if (picked && !TARGETS.includes(picked as Target)) {
  throw new Error(`Unknown target "${picked}". Use one of: ${TARGETS.join(", ")}`);
}
const targets: Target[] = picked ? [picked as Target] : watch ? ["chrome"] : [...TARGETS];

type Manifest = Record<string, unknown> & { version: string };

function manifestFor(target: Target): Manifest {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8")) as Manifest;
  manifest.version = pkg.version;

  // Chrome runs the background as a service worker, Firefox as an event page.
  if (target === "firefox") {
    manifest.background = { scripts: ["background.js"] };
    manifest.browser_specific_settings = {
      gecko: {
        id: "streetpass-bluesky@kosta.lol",
        strict_min_version: "142.0",
        data_collection_permissions: {
          required: ["none"],
          // The opt-in DNS lookup sends visited domains to Cloudflare.
          optional: ["browsingActivity"],
        },
      },
    };
  }
  return manifest;
}

async function build(target: Target): Promise<void> {
  const out = `dist/${target}`;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(`${out}/icons`, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    writeFileSync(`${out}/icons/${size}.png`, iconPng(size));
    writeFileSync(`${out}/icons/inactive-${size}.png`, iconPng(size, INACTIVE));
  }

  const writeStatic = () => {
    writeFileSync(`${out}/manifest.json`, JSON.stringify(manifestFor(target), null, 2));
    copyFileSync("src/popup/popup.html", `${out}/popup.html`);
    writeFileSync(`${out}/cookie.svg`, cookieSvg());
  };

  const options: esbuild.BuildOptions = {
    entryPoints: {
      background: "src/background.ts",
      content: "src/content.ts",
      popup: "src/popup/popup.ts",
      "popup-style": "src/popup/popup.css",
    },
    outdir: out,
    bundle: true,
    format: "iife",
    target: ["chrome120", "firefox142"],
    loader: { ".woff2": "file" },
    // Written by writeStatic, next to the CSS.
    external: ["cookie.svg"],
    assetNames: "fonts/[name]",
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    logLevel: "info",
    plugins: [{ name: "static", setup: (b) => b.onEnd(writeStatic) }],
  };

  if (watch) {
    await (await esbuild.context(options)).watch();
  } else {
    await esbuild.build(options);
  }
}

await Promise.all(targets.map(build));
