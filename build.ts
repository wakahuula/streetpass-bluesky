// Builds the extension into dist/. `node build.ts --watch` rebuilds on change.

import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { iconPng } from "./scripts/icons.ts";
import { cookieSvg } from "./scripts/shape.ts";

const watch = process.argv.includes("--watch");
const out = "dist";

function writeStatic(): void {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8")) as { version: string };
  manifest.version = pkg.version;
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  copyFileSync("src/popup/popup.html", `${out}/popup.html`);
  writeFileSync(`${out}/cookie.svg`, cookieSvg());
}

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/icons`, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${out}/icons/${size}.png`, iconPng(size));
}

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
  target: "chrome120",
  loader: { ".woff2": "file" },
  // Written by writeStatic, next to the CSS.
  external: ["cookie.svg"],
  assetNames: "fonts/[name]",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  plugins: [{ name: "static", setup: (build) => build.onEnd(writeStatic) }],
};

if (watch) {
  await (await esbuild.context(options)).watch();
} else {
  await esbuild.build(options);
}
