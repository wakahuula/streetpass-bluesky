// Material 3 Expressive "cookie" shape: a circle with scalloped edges.
// The build uses it for the extension icon and the avatar mask, so both match.

const SCALLOPS = 9;
const DEPTH = 0.07;

// Polygon points of the cookie in a 100x100 box.
export function cookiePoints(): string {
  const points: string[] = [];
  const steps = 180;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const r = (50 * (1 + DEPTH * Math.cos(SCALLOPS * t))) / (1 + DEPTH);
    points.push(`${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return points.join(" ");
}

export function cookieSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="${cookiePoints()}"/></svg>\n`;
}
