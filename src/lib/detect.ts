// Pure parsing helpers. No network, no chrome APIs, so they run under node:test.

// atproto handle syntax: https://atproto.com/specs/handle
const HANDLE =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

// Only the two DID methods atproto accepts.
const DID = /^did:(plc|web):[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/;

const PROFILE_HOSTS = new Set(["bsky.app", "www.bsky.app"]);

export function isHandle(value: string): boolean {
  return value.length <= 253 && HANDLE.test(value.toLowerCase());
}

export function isDid(value: string): boolean {
  return value.length <= 2048 && DID.test(value);
}

// The hostname a page could use as its owner's handle, or null.
// Only https pages qualify, because handle resolution over HTTP needs https.
export function handleCandidate(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!isHandle(host)) return null;
  return host;
}

// The Bluesky actor (handle or DID) a rel="me" link points to, or null.
// Accepts https://bsky.app/profile/<actor> and at://<actor>.
export function actorFromHref(href: string): string | null {
  let actor: string | undefined;
  if (href.startsWith("at://")) {
    // new URL() can't parse at://did:plc:abc (it reads "plc" as a port).
    actor = href.slice("at://".length).split(/[/?#]/)[0];
  } else {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      PROFILE_HOSTS.has(url.hostname.toLowerCase())
    ) {
      const [first, second] = url.pathname.split("/").filter(Boolean);
      if (first === "profile") actor = second;
    }
  }
  if (!actor) return null;

  try {
    actor = decodeURIComponent(actor);
  } catch {
    return null;
  }
  actor = actor.replace(/^@/, "");

  if (isDid(actor)) return actor;
  if (isHandle(actor)) return actor.toLowerCase();
  return null;
}

// Body of https://<host>/.well-known/atproto-did. Sites that don't serve the
// file often answer with their HTML 404 page and status 200, so be strict.
export function didFromWellKnown(body: string): string | null {
  const did = body.trim();
  if (did.includes("\n")) return null;
  return isDid(did) ? did : null;
}

type DnsJson = { Status?: number; Answer?: Array<{ type?: number; data?: string }> };

// DNS-over-HTTPS JSON answer for TXT _atproto.<host>.
// The spec says to ignore the record when several "did=" values disagree.
export function didFromDnsJson(json: unknown): string | null {
  const answers = (json as DnsJson | null)?.Answer;
  if (!Array.isArray(answers)) return null;

  const dids = new Set<string>();
  for (const answer of answers) {
    if (answer.type !== 16 || typeof answer.data !== "string") continue;
    // TXT data arrives as one or more quoted strings: "did=did:plc:abc"
    const text = answer.data.replace(/"\s*"/g, "").replace(/^"|"$/g, "");
    if (!text.startsWith("did=")) continue;
    const did = text.slice("did=".length);
    if (isDid(did)) dids.add(did);
  }
  if (dids.size !== 1) return null;
  return [...dids][0] ?? null;
}

// The site a page belongs to, for exclusions and display: the hostname
// without "www.", for http and https pages only.
export function siteOf(pageUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.hostname.toLowerCase().replace(/^www\./, "") || null;
}

// Excluding a site also excludes its subdomains.
export function isExcluded(site: string, excluded: readonly string[]): boolean {
  return excluded.some((e) => site === e || site.endsWith(`.${e}`));
}
