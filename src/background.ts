import { ext } from "./lib/ext.ts";
import { getProfile, getProfiles, resolveViaDns, resolveViaWellKnown } from "./lib/bluesky.ts";
import { handleCandidate, isDid, isHandle } from "./lib/detect.ts";
import { addPerson, refreshPeople, type People, type Profile } from "./lib/people.ts";
import { getPeople, getSettings, getUnseen, type Message } from "./lib/store.ts";

const RECHECK_MS = 24 * 60 * 60 * 1000;
const REFRESH_MS = 60 * 60 * 1000;
const MAX_ACTORS_PER_PAGE = 10;
const BADGE_COLOR = "#005db7";

// Every read-modify-write of storage.local goes through this queue, so two
// pages finishing at once can't overwrite each other's additions.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

// Hosts and actors looked up recently. Kept in session storage, which Chrome
// clears on restart, so the extension never writes browsing history to disk.
async function shouldCheck(key: string, now: number): Promise<boolean> {
  return serialized(async () => {
    const { checked = {} } = (await ext.storage.session.get("checked")) as {
      checked?: Record<string, number>;
    };
    const last = checked[key];
    if (last !== undefined && now - last < RECHECK_MS) return false;

    for (const [k, at] of Object.entries(checked)) {
      if (now - at >= RECHECK_MS) delete checked[k];
    }
    checked[key] = now;
    await ext.storage.session.set({ checked });
    return true;
  });
}

async function updateBadge(unseen: number): Promise<void> {
  await ext.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await ext.action.setBadgeText({ text: unseen > 0 ? String(unseen) : "" });
}

async function save(profile: Profile, foundOn: string, verified: boolean): Promise<void> {
  await serialized(async () => {
    const result = addPerson(await getPeople(), profile, foundOn, verified, Date.now());
    const unseen = (await getUnseen()) + (result.isNew ? 1 : 0);
    await ext.storage.local.set({ people: result.people, unseen });
    await updateBadge(unseen);
  });
}

// Method 2 (and 3 when enabled): is this page's domain someone's handle?
async function checkHost(host: string, pageUrl: string): Promise<void> {
  if (!(await shouldCheck(`host:${host}`, Date.now()))) return;

  let did = await resolveViaWellKnown(host);
  if (!did && (await getSettings()).dnsLookup) did = await resolveViaDns(host);
  if (!did) return;

  // The AppView only reports a handle after checking that the DID claims it
  // back, so a match here is a two-way verification.
  const profile = await getProfile(did);
  if (profile?.handle === host) await save(profile, pageUrl, true);
}

// Method 1: a rel="me" link to a Bluesky profile.
async function checkActor(actor: string, host: string | null, pageUrl: string): Promise<void> {
  if (!(await shouldCheck(`actor:${actor}`, Date.now()))) return;

  const profile = await getProfile(actor);
  if (!profile || profile.handle === "handle.invalid") return;
  await save(profile, pageUrl, profile.handle === host);
}

async function onPage(pageUrl: string, actors: string[]): Promise<void> {
  const host = handleCandidate(pageUrl);
  const tasks: Promise<void>[] = [];
  if (host) tasks.push(checkHost(host, pageUrl));

  const valid = actors.filter((a) => isDid(a) || isHandle(a));
  for (const actor of [...new Set(valid)].slice(0, MAX_ACTORS_PER_PAGE)) {
    tasks.push(checkActor(actor, host, pageUrl));
  }
  await Promise.all(tasks);
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

ext.runtime.onMessage.addListener((message: Message, sender) => {
  // Only accept messages from this extension's own pages and content scripts.
  if (sender.id !== ext.runtime.id) return;

  // Content scripts report web pages; only the popup may change the list.
  const fromPopup = sender.url?.startsWith(ext.runtime.getURL("")) ?? false;

  let task: Promise<void> | undefined;
  if (message.type === "page" && !fromPopup && sender.url) {
    task = onPage(sender.url, Array.isArray(message.actors) ? message.actors : []);
  } else if (message.type === "opened" && fromPopup) {
    task = onOpened();
  } else if (message.type === "remove" && fromPopup && typeof message.did === "string") {
    task = onRemove(message.did);
  }
  task?.catch((error: unknown) => console.error(error));
});

ext.runtime.onStartup.addListener(() => {
  getUnseen().then(updateBadge, console.error);
});
