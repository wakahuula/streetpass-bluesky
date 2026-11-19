// The extension icon: two hands in a high five, white on a cookie in the
// brand color. Built as SVG, rendered to PNG at build time.

import { Resvg } from "@resvg/resvg-js";
import { cookiePoints } from "./shape.ts";

export const BRAND = "#446ccf";

const FINGER = 6.4;
const THUMB = 7.4;

// One open hand, palm towards the viewer, thumb on the left.
// Wrist at (0, 0), fingers pointing up. `grow` widens every part, which the
// second hand uses to cut a gap where the two hands meet.
function hand(fill: string, grow = 0): string {
  const finger = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fill}" stroke-width="${FINGER + grow}" stroke-linecap="round"/>`;
  const outline = grow > 0 ? ` stroke="${fill}" stroke-width="${grow}" stroke-linejoin="round"` : "";
  return [
    `<rect x="-14" y="-32" width="28" height="30" rx="9" fill="${fill}"${outline}/>`,
    `<rect x="-10" y="-8" width="20" height="22" rx="3" fill="${fill}"${outline}/>`,
    finger(-10.5, -28, -13, -51), // index
    finger(-3.5, -30, -4.5, -57), // middle
    finger(3.5, -30, 4.5, -54), // ring
    finger(10.5, -27, 13, -46), // pinky
    `<polyline points="-11,-12 -20,-22 -24.5,-32" fill="none" stroke="${fill}" stroke-width="${THUMB + grow}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join("");
}

export function iconSvg(): string {
  const cookie = cookiePoints();
  const [scale, tilt, offset, wrist] = [0.86, 22, 23, 80];
  const left = `translate(${50 - offset} ${wrist}) rotate(${tilt}) scale(${scale})`;
  const right = `translate(${50 + offset} ${wrist}) rotate(${-tilt}) scale(${-scale} ${scale})`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
    `<clipPath id="cookie"><polygon points="${cookie}"/></clipPath>`,
    `<polygon points="${cookie}" fill="${BRAND}"/>`,
    `<g clip-path="url(#cookie)">`,
    `<g transform="${left}">${hand("#fff")}</g>`,
    `<g transform="${right}">${hand(BRAND, 5)}</g>`,
    `<g transform="${right}">${hand("#fff")}</g>`,
    `</g></svg>\n`,
  ].join("");
}

export function iconPng(size: number): Buffer {
  return new Resvg(iconSvg(), { fitTo: { mode: "width", value: size } }).render().asPng();
}
