// Runs on every page. Reports rel="me" links to Bluesky profiles, and tells
// the background which page it is on, so it can check the domain as a handle.

import { actorFromHref } from "./lib/detect.ts";
import type { Message } from "./lib/store.ts";

let reportedUrl = "";
const reportedActors = new Set<string>();

function report(): void {
  const actors: string[] = [];
  for (const el of document.querySelectorAll<HTMLAnchorElement | HTMLLinkElement>(
    'a[rel~="me" i][href], link[rel~="me" i][href]',
  )) {
    // .href is absolute; at:// links keep their raw form.
    const href = el.getAttribute("href")?.startsWith("at://") ? el.getAttribute("href")! : el.href;
    const actor = actorFromHref(href);
    if (actor && !reportedActors.has(actor)) actors.push(actor);
  }

  const urlChanged = location.href !== reportedUrl;
  if (!urlChanged && actors.length === 0) return;

  reportedUrl = location.href;
  for (const actor of actors) reportedActors.add(actor);

  const message: Message = { type: "page", actors };
  chrome.runtime.sendMessage(message).catch(() => {
    // The extension was reloaded or updated while this page stayed open.
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(report, 500);
}).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributeFilter: ["rel", "href"],
});

report();
