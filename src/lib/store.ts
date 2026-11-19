import type { People } from "./people.ts";

export type Settings = { dnsLookup: boolean };

export type Message =
  // Sent by the content script. The page URL comes from the sender, not the message.
  | { type: "page"; actors: string[] }
  | { type: "remove"; did: string }
  | { type: "opened" };

export async function getPeople(): Promise<People> {
  const { people } = await chrome.storage.local.get("people");
  return (people as People | undefined) ?? {};
}

export async function getUnseen(): Promise<number> {
  const { unseen } = await chrome.storage.local.get("unseen");
  return typeof unseen === "number" ? unseen : 0;
}

export async function getSettings(): Promise<Settings> {
  const { dnsLookup } = await chrome.storage.sync.get("dnsLookup");
  return { dnsLookup: dnsLookup === true };
}

export async function setSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set(settings);
}
