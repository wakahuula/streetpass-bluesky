import { ext } from "../lib/ext.ts";
import { profileUrl, sortedPeople, type People, type Person } from "../lib/people.ts";
import { getPeople, getSettings, setSettings, type Message } from "../lib/store.ts";

const list = document.querySelector<HTMLUListElement>("#people")!;
const empty = document.querySelector<HTMLParagraphElement>("#empty")!;
const count = document.querySelector<HTMLSpanElement>("#count")!;
const template = document.querySelector<HTMLTemplateElement>("#person-template")!;
const dnsLookup = document.querySelector<HTMLInputElement>("#dns-lookup")!;
const access = document.querySelector<HTMLElement>("#access")!;
const grant = document.querySelector<HTMLButtonElement>("#grant")!;

const ALL_SITES = { origins: ["<all_urls>"] };

async function renderAccess(): Promise<void> {
  access.hidden = await ext.permissions.contains(ALL_SITES);
}

grant.addEventListener("click", () => {
  // Firefox only shows the prompt when request() runs directly in the click handler.
  ext.permissions.request(ALL_SITES).then(renderAccess, console.error);
});

function send(message: Message): void {
  ext.runtime.sendMessage(message).catch((error: unknown) => console.error(error));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function renderPerson(person: Person): HTMLLIElement {
  const item = template.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
  const name = person.displayName ?? person.handle;

  item.querySelector<HTMLAnchorElement>(".person-link")!.href = profileUrl(person);
  item.querySelector(".name")!.textContent = name;
  item.querySelector(".handle")!.textContent = `@${person.handle}`;

  const avatar = item.querySelector<HTMLSpanElement>(".avatar")!;
  const img = avatar.querySelector("img")!;
  if (person.avatar) {
    img.src = person.avatar;
  } else {
    avatar.append(name.trim().charAt(0).toUpperCase());
  }

  // Verified people need no source line: their handle is the site.
  if (!person.verified) {
    item.querySelector(".source")!.textContent = `Unverified link on ${hostOf(person.foundOn)}`;
  }

  const remove = item.querySelector<HTMLButtonElement>(".icon-button")!;
  remove.setAttribute("aria-label", `Remove ${name}`);
  remove.addEventListener("click", () => send({ type: "remove", did: person.did }));

  return item;
}

function render(people: People): void {
  const sorted = sortedPeople(people);
  list.replaceChildren(...sorted.map(renderPerson));
  list.hidden = sorted.length === 0;
  empty.hidden = sorted.length > 0;
  count.hidden = sorted.length === 0;
  count.textContent = String(sorted.length);
}

dnsLookup.addEventListener("change", async () => {
  await setSettings({ dnsLookup: dnsLookup.checked });
  // Hosts checked while DNS lookup was off get checked again on the next visit.
  if (dnsLookup.checked) await ext.storage.session.remove("checked");
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.people) render((changes.people.newValue as People) ?? {});
});

Promise.all([getPeople(), getSettings()]).then(([people, settings]) => {
  render(people);
  dnsLookup.checked = settings.dnsLookup;
  send({ type: "opened" });
}, console.error);

renderAccess().catch(console.error);
