// Builds the GitHub Pages site from site/ into dist/site/.

import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { iconPng, iconSvg } from "./icons.ts";

const out = "dist/site";
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: { style: "site/style.css" },
  outdir: out,
  bundle: true,
  minify: true,
  loader: { ".woff2": "file" },
  assetNames: "fonts/[name]",
  logLevel: "info",
});

for (const page of ["index.html", "privacy.html"]) {
  writeFileSync(`${out}/${page}`, readFileSync(`site/${page}`, "utf8").replaceAll("{{version}}", version));
}
for (const file of ["popup-light.png", "popup-dark.png"]) copyFileSync(`site/${file}`, `${out}/${file}`);
writeFileSync(`${out}/logo.svg`, iconSvg());
writeFileSync(`${out}/apple-touch-icon.png`, iconPng(180));
writeFileSync(`${out}/og.png`, iconPng(512));
