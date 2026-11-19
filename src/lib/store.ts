import { ext } from "./ext.ts";
import type { People } from "./people.ts";

// Kept in storage.local, not storage.sync: the excluded sites are often the
// sensitive ones, and sync would copy them to the browser vendor's servers.
export type Settings = {
  dnsLookup: boolean;
  paused: boolean;
  // Sites (and their subdomains) the extension never checks.
  excluded: string[];
};

// People the page in each tab shows, keyed by tab id. Session storage only.
export type TabPeople = Record<string, { url: string; dids: string[] }>;

export type Message =
  // Sent by the content script. The page URL comes from the sender, not the message.
  | { type: "page"; actors: string[] }
  | { type: "remove"; did: string }
  | { type: "clear" }
  | { type: "opened" };

export async function getPeople(): Promise<People> {
  const { people } = await ext.storage.local.get("people");
  return (people as People | undefined) ?? {};
}

export async function getUnseen(): Promise<number> {
  const { unseen } = await ext.storage.local.get("unseen");
  return typeof unseen === "number" ? unseen : 0;
}

export async function getSettings(): Promise<Settings> {
  const s = await ext.storage.local.get(["dnsLookup", "paused", "excluded"]);
  return {
    dnsLookup: s.dnsLookup === true,
    paused: s.paused === true,
    excluded: Array.isArray(s.excluded) ? (s.excluded as string[]) : [],
  };
}

export async function setSettings(settings: Partial<Settings>): Promise<void> {
  await ext.storage.local.set(settings);
}

export async function getTabPeople(): Promise<TabPeople> {
  const { tabs } = await ext.storage.session.get("tabs");
  return (tabs as TabPeople | undefined) ?? {};
}
