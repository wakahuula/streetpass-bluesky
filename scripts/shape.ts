// Material 3 Expressive "cookie" shape: a circle with scalloped edges.
// The build uses it for the extension icon and the avatar mask, so both match.

const SCALLOPS = 9;
const DEPTH = 0.07;

// Radius at angle t, as a fraction of the full radius (0..1].
export function cookieRadius(t: number): number {
  return (1 + DEPTH * Math.cos(SCALLOPS * t)) / (1 + DEPTH);
}

export function cookieSvg(): string {
  const points: string[] = [];
  const steps = 180;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const r = 50 * cookieRadius(t);
    points.push(`${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="${points.join(" ")}"/></svg>\n`;
}
