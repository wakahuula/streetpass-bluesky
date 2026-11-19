import { ext } from "../lib/ext.ts";
import { isExcluded, siteOf } from "../lib/detect.ts";
import { groupPeople, profileUrl, type People, type Person } from "../lib/people.ts";
import {
  getPeople,
  getSettings,
  getTabPeople,
  setSettings,
  type Message,
  type Settings,
  type TabPeople,
} from "../lib/store.ts";

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;

const groupsEl = $<HTMLElement>("#groups");
const empty = $<HTMLParagraphElement>("#empty");
const noMatch = $<HTMLParagraphElement>("#no-match");
const count = $<HTMLSpanElement>("#count");
const clear = $<HTMLButtonElement>("#clear");
const searchField = $<HTMLDivElement>("#search-field");
const search = $<HTMLInputElement>("#search");
const groupTemplate = $<HTMLTemplateElement>("#group-template");
const personTemplate = $<HTMLTemplateElement>("#person-template");
const active = $<HTMLInputElement>("#active");
const siteRow = $<HTMLDivElement>("#site-row");
const siteLabel = $<HTMLSpanElement>("#site-label");
const siteSwitch = $<HTMLInputElement>("#site");
const dnsLookup = $<HTMLInputElement>("#dns-lookup");
const access = $<HTMLElement>("#access");
const grant = $<HTMLButtonElement>("#grant");

const ALL_SITES = { origins: ["<all_urls>"] };

const state: {
  people: People;
  tabs: TabPeople;
  settings: Settings;
  tabId: number | undefined;
  site: string | null;
} = {
  people: {},
  tabs: {},
  settings: { dnsLookup: false, paused: false, excluded: [] },
  tabId: undefined,
  site: null,
};

function send(message: Message): void {
  ext.runtime.sendMessage(message).catch((error: unknown) => console.error(error));
}

function renderPerson(person: Person): HTMLLIElement {
  const item = personTemplate.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
  const name = person.displayName ?? person.handle;

  item.querySelector<HTMLAnchorElement>(".person-link")!.href = profileUrl(person);
  item.querySelector(".name")!.textContent = name;
  item.querySelector(".handle")!.textContent = `@${person.handle}`;

  const avatar = item.querySelector<HTMLSpanElement>(".avatar")!;
  if (person.avatar) {
    avatar.querySelector("img")!.src = person.avatar;
  } else {
    avatar.append(name.trim().charAt(0).toUpperCase());
  }

  // Verified people need no source line: their handle is the site.
  if (!person.verified) {
    item.querySelector(".source")!.textContent =
      `Unverified link on ${siteOf(person.foundOn) ?? person.foundOn}`;
  }

  const remove = item.querySelector<HTMLButtonElement>(".icon-button")!;
  remove.setAttribute("aria-label", `Remove ${name}`);
  remove.addEventListener("click", () => send({ type: "remove", did: person.did }));

  return item;
}

function renderPeople(): void {
  const total = Object.keys(state.people).length;
  const onPage = state.tabId === undefined ? [] : (state.tabs[state.tabId]?.dids ?? []);
  const groups = groupPeople(state.people, onPage, search.value, Date.now());

  groupsEl.replaceChildren(
    ...groups.map((group) => {
      const section = groupTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
      section.querySelector("h2")!.textContent = group.title;
      section.querySelector("ul")!.append(...group.people.map(renderPerson));
      return section;
    }),
  );

  empty.hidden = total > 0;
  noMatch.hidden = total === 0 || groups.length > 0;
  searchField.hidden = total === 0;
  count.hidden = total === 0;
  count.textContent = String(total);
  clear.hidden = total === 0;
  if (total === 0) resetClear();
}

function renderSettings(): void {
  const { settings, site } = state;
  active.checked = !settings.paused;
  dnsLookup.checked = settings.dnsLookup;

  siteRow.hidden = site === null;
  if (site !== null) {
    siteLabel.textContent = `Look on ${site}`;
    siteSwitch.checked = !isExcluded(site, settings.excluded);
    siteSwitch.disabled = settings.paused;
  }
}

// Clear all asks once inline instead of opening a dialog.
let clearTimer: ReturnType<typeof setTimeout> | undefined;

function resetClear(): void {
  clearTimeout(clearTimer);
  clear.classList.remove("confirm");
  clear.textContent = "Clear all";
}

clear.addEventListener("click", () => {
  if (clear.classList.contains("confirm")) {
    resetClear();
    send({ type: "clear" });
    return;
  }
  const total = Object.keys(state.people).length;
  clear.classList.add("confirm");
  clear.textContent = `Clear ${total} ${total === 1 ? "person" : "people"}?`;
  clearTimer = setTimeout(resetClear, 4000);
});
clear.addEventListener("blur", resetClear);

search.addEventListener("input", renderPeople);

active.addEventListener("change", () => {
  setSettings({ paused: !active.checked }).catch(console.error);
});

siteSwitch.addEventListener("change", () => {
  const site = state.site;
  if (site === null) return;
  // Turning a site back on also lifts a parent domain's exclusion, so the
  // switch always matches what the background does.
  const excluded = siteSwitch.checked
    ? state.settings.excluded.filter((e) => !isExcluded(site, [e]))
    : [...state.settings.excluded, site];
  setSettings({ excluded }).catch(console.error);
});

dnsLookup.addEventListener("change", async () => {
  await setSettings({ dnsLookup: dnsLookup.checked });
  // Hosts checked while DNS lookup was off get checked again on the next visit.
  if (dnsLookup.checked) await ext.storage.session.remove("checked");
});

grant.addEventListener("click", () => {
  // Firefox only shows the prompt when request() runs directly in the click handler.
  ext.permissions.request(ALL_SITES).then(renderAccess, console.error);
});

async function renderAccess(): Promise<void> {
  access.hidden = await ext.permissions.contains(ALL_SITES);
}

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.people) {
    state.people = (changes.people.newValue as People | undefined) ?? {};
    renderPeople();
  }
  if (area === "session" && changes.tabs) {
    state.tabs = (changes.tabs.newValue as TabPeople | undefined) ?? {};
    renderPeople();
  }
  if (area === "local" && (changes.dnsLookup || changes.paused || changes.excluded)) {
    getSettings().then((settings) => {
      state.settings = settings;
      renderSettings();
    }, console.error);
  }
});

async function init(): Promise<void> {
  // The extension has host access to all sites, so the active tab's URL is
  // readable without the "tabs" permission.
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  state.tabId = tab?.id;
  state.site = tab?.url ? siteOf(tab.url) : null;

  [state.people, state.tabs, state.settings] = await Promise.all([
    getPeople(),
    getTabPeople(),
    getSettings(),
  ]);
  renderPeople();
  renderSettings();
  send({ type: "opened" });
  await renderAccess();
}

init().catch(console.error);
