import { ext } from "./lib/ext.ts";
import { getProfile, getProfiles, resolveViaDns, resolveViaWellKnown } from "./lib/bluesky.ts";
import { handleCandidate, isDid, isExcluded, isHandle, siteOf } from "./lib/detect.ts";
import { addPerson, refreshPeople, withDomainsOnly, type People, type Profile } from "./lib/people.ts";
import {
  getPeople,
  getSettings,
  getTabPeople,
  getUnseen,
  type Message,
  type Settings,
} from "./lib/store.ts";

const RECHECK_MS = 24 * 60 * 60 * 1000;
const REFRESH_MS = 60 * 60 * 1000;
const MAX_ACTORS_PER_PAGE = 10;
const BADGE_COLOR = "#446ccf";

// Grey by default, brand color while the tab's page shows someone.
const ICON_ACTIVE = { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png" };
const ICON_INACTIVE = {
  16: "icons/inactive-16.png",
  32: "icons/inactive-32.png",
  48: "icons/inactive-48.png",
};

// Every read-modify-write of storage goes through this queue, so two pages
// finishing at once can't overwrite each other's changes.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

// Results of recent lookups, keyed "host:<domain>" or "actor:<handle|did>".
// `did` is the person found, or null. Kept in session storage, which the
// browser clears on restart, so the extension never writes browsing history
// to disk.
type Check = { at: number; did: string | null };

// Returns the cached result while it's fresh. Otherwise reserves the key, so
// a second tab on the same site doesn't start the same lookup, and returns null.
async function claim(key: string, now: number): Promise<Check | null> {
  return serialized(async () => {
    const { checked = {} } = (await ext.storage.session.get("checked")) as {
      checked?: Record<string, Check>;
    };
    const cached = checked[key];
    if (cached && now - cached.at < RECHECK_MS) return cached;

    for (const [k, c] of Object.entries(checked)) {
      if (now - c.at >= RECHECK_MS) delete checked[k];
    }
    checked[key] = { at: now, did: null };
    await ext.storage.session.set({ checked });
    return null;
  });
}

async function remember(key: string, did: string | null): Promise<void> {
  await serialized(async () => {
    const { checked = {} } = (await ext.storage.session.get("checked")) as {
      checked?: Record<string, Check>;
    };
    checked[key] = { at: Date.now(), did };
    await ext.storage.session.set({ checked });
  });
}

async function updateBadge(unseen: number): Promise<void> {
  await ext.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await ext.action.setBadgeText({ text: unseen > 0 ? String(unseen) : "" });
}

async function setTabIcon(tabId: number, active: boolean): Promise<void> {
  // The tab may have closed in the meantime.
  await ext.action
    .setIcon({ tabId, path: active ? ICON_ACTIVE : ICON_INACTIVE })
    .catch(() => {});
}

async function save(profile: Profile, foundOn: string, verified: boolean): Promise<void> {
  await serialized(async () => {
    const result = addPerson(await getPeople(), profile, foundOn, verified, Date.now());
    const unseen = (await getUnseen()) + (result.isNew ? 1 : 0);
    await ext.storage.local.set({ people: result.people, unseen });
    await updateBadge(unseen);
  });
}

// A new page in the tab starts with nobody on it.
async function startPage(tabId: number, url: string): Promise<void> {
  await serialized(async () => {
    const tabs = await getTabPeople();
    if (tabs[tabId]?.url === url) return;
    tabs[tabId] = { url, dids: [] };
    await ext.storage.session.set({ tabs });
    await setTabIcon(tabId, false);
  });
}

async function markOnPage(tabId: number, url: string, did: string): Promise<void> {
  await serialized(async () => {
    const tabs = await getTabPeople();
    const tab = tabs[tabId];
    // Skip if the tab moved on, or the person was removed from the list.
    if (!tab || tab.url !== url || !(await getPeople())[did]) return;
    if (!tab.dids.includes(did)) tab.dids.push(did);
    await ext.storage.session.set({ tabs });
    await setTabIcon(tabId, true);
  });
}

// Method 2 (and 3 when enabled): is this page's domain someone's handle?
async function checkHost(host: string, dnsLookup: boolean, site: string): Promise<string | null> {
  const key = `host:${host}`;
  const cached = await claim(key, Date.now());
  if (cached) return cached.did;

  let did = await resolveViaWellKnown(host);
  if (!did && dnsLookup) did = await resolveViaDns(host);

  // The AppView only reports a handle after checking that the DID claims it
  // back, so a match here is a two-way verification.
  const profile = did ? await getProfile(did) : null;
  const found = profile?.handle === host ? profile : null;
  if (found) await save(found, site, true);
  await remember(key, found?.did ?? null);
  return found?.did ?? null;
}

// Method 1: a rel="me" link to a Bluesky profile.
async function checkActor(actor: string, host: string | null, site: string): Promise<string | null> {
  const key = `actor:${actor}`;
  const cached = await claim(key, Date.now());
  if (cached) return cached.did;

  const profile = await getProfile(actor);
  const found = profile && profile.handle !== "handle.invalid" ? profile : null;
  if (found) await save(found, site, found.handle === host);
  await remember(key, found?.did ?? null);
  return found?.did ?? null;
}

function isChecked(site: string | null, settings: Settings): site is string {
  return site !== null && !settings.paused && !isExcluded(site, settings.excluded);
}

async function onPage(tabId: number, pageUrl: string, actors: string[]): Promise<void> {
  await startPage(tabId, pageUrl);
  const settings = await getSettings();
  // Only the domain is stored with a person, never the full page URL.
  const site = siteOf(pageUrl);
  if (!isChecked(site, settings)) return;

  const host = handleCandidate(pageUrl);
  const lookups: Promise<string | null>[] = [];
  if (host) lookups.push(checkHost(host, settings.dnsLookup, site));

  const valid = actors.filter((a) => isDid(a) || isHandle(a));
  for (const actor of [...new Set(valid)].slice(0, MAX_ACTORS_PER_PAGE)) {
    lookups.push(checkActor(actor, host, site));
  }

  await Promise.all(
    lookups.map(async (lookup) => {
      const did = await lookup;
      if (did) await markOnPage(tabId, pageUrl, did);
    }),
  );
}

async function onOpened(): Promise<void> {
  await serialized(async () => {
    await ext.storage.local.set({ unseen: 0 });
    await updateBadge(0);
  });

  const now = Date.now();
  const stale = Object.values(await getPeople())
    .filter((p) => now - p.refreshedAt >= REFRESH_MS)
    .map((p) => p.did);
  if (stale.length === 0) return;

  const profiles = await getProfiles(stale);
  await serialized(async () => {
    const people = refreshPeople(await getPeople(), profiles, Date.now());
    await ext.storage.local.set({ people });
  });
}

async function onRemove(did: string): Promise<void> {
  await serialized(async () => {
    const people: People = { ...(await getPeople()) };
    delete people[did];
    await ext.storage.local.set({ people });
  });
}

// Starts over: the list, the badge, which tabs show whom, and the lookup
// cache, so people turn up again on the next visit.
async function onClear(): Promise<void> {
  await serialized(async () => {
    const tabs = await getTabPeople();
    await ext.storage.local.set({ people: {}, unseen: 0 });
    await ext.storage.session.remove(["checked", "tabs"]);
    await updateBadge(0);
    await Promise.all(Object.keys(tabs).map((id) => setTabIcon(Number(id), false)));
  });
}

// Pausing or excluding a site takes effect on open tabs right away.
async function onSettingsChanged(): Promise<void> {
  const settings = await getSettings();
  await serialized(async () => {
    const tabs = await getTabPeople();
    for (const [id, tab] of Object.entries(tabs)) {
      if (isChecked(siteOf(tab.url), settings)) continue;
      tab.dids = [];
      await setTabIcon(Number(id), false);
    }
    await ext.storage.session.set({ tabs });
  });
}

ext.runtime.onMessage.addListener((message: Message, sender) => {
  // Only accept messages from this extension's own pages and content scripts.
  if (sender.id !== ext.runtime.id) return;

  // Content scripts report web pages; only the popup may change the list.
  const fromPopup = sender.url?.startsWith(ext.runtime.getURL("")) ?? false;
  const tabId = sender.tab?.id;

  let task: Promise<void> | undefined;
  if (message.type === "page" && !fromPopup && sender.url && tabId !== undefined) {
    task = onPage(tabId, sender.url, Array.isArray(message.actors) ? message.actors : []);
  } else if (message.type === "opened" && fromPopup) {
    task = onOpened();
  } else if (message.type === "remove" && fromPopup && typeof message.did === "string") {
    task = onRemove(message.did);
  } else if (message.type === "clear" && fromPopup) {
    task = onClear();
  }
  task?.catch((error: unknown) => console.error(error));
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.paused || changes.excluded)) {
    onSettingsChanged().catch(console.error);
  }
});

ext.tabs.onRemoved.addListener((tabId) => {
  serialized(async () => {
    const tabs = await getTabPeople();
    delete tabs[tabId];
    await ext.storage.session.set({ tabs });
  }).catch(console.error);
});

// Version 0.2.0 stored the full page URL in foundOn. Keep only the domain.
ext.runtime.onInstalled.addListener(() => {
  serialized(async () => {
    await ext.storage.local.set({ people: withDomainsOnly(await getPeople()) });
  }).catch(console.error);
});

ext.runtime.onStartup.addListener(() => {
  getUnseen().then(updateBadge, console.error);
});
