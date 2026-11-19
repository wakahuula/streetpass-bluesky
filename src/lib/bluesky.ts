// Network calls. All requests omit cookies, so sites and APIs never see a
// logged-in session from the extension.

import { didFromDnsJson, didFromWellKnown } from "./detect.ts";
import type { Profile } from "./people.ts";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const DOH = "https://cloudflare-dns.com/dns-query";
const TIMEOUT_MS = 5000;

async function get(url: string, headers?: Record<string, string>): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      credentials: "omit",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

type ApiProfile = { did: string; handle: string; displayName?: string; avatar?: string };

function toProfile(p: ApiProfile): Profile {
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || undefined,
    avatar: p.avatar || undefined,
  };
}

export async function getProfile(actor: string): Promise<Profile | null> {
  const response = await get(
    `${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
  );
  if (!response) return null;
  return toProfile((await response.json()) as ApiProfile);
}

export async function getProfiles(dids: string[]): Promise<Profile[]> {
  const profiles: Profile[] = [];
  // The API takes at most 25 actors per call.
  for (let i = 0; i < dids.length; i += 25) {
    const query = dids
      .slice(i, i + 25)
      .map((did) => `actors=${encodeURIComponent(did)}`)
      .join("&");
    const response = await get(`${APPVIEW}/app.bsky.actor.getProfiles?${query}`);
    if (!response) continue;
    const body = (await response.json()) as { profiles?: ApiProfile[] };
    profiles.push(...(body.profiles ?? []).map(toProfile));
  }
  return profiles;
}

// Asks the site itself. The user is already on this site, so nothing new leaks.
export async function resolveViaWellKnown(host: string): Promise<string | null> {
  const response = await get(`https://${host}/.well-known/atproto-did`);
  if (!response) return null;
  // A redirect to another host doesn't count as that host's answer.
  if (new URL(response.url).hostname !== host) return null;
  const body = await response.text();
  if (body.length > 2048) return null;
  return didFromWellKnown(body);
}

// Opt-in: sends the hostname to Cloudflare's resolver.
export async function resolveViaDns(host: string): Promise<string | null> {
  const response = await get(
    `${DOH}?name=${encodeURIComponent(`_atproto.${host}`)}&type=TXT`,
    { accept: "application/dns-json" },
  );
  if (!response) return null;
  return didFromDnsJson(await response.json());
}
