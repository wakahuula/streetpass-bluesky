// The list of people found so far, and the pure rules for changing it.

import { siteOf } from "./detect.ts";

export type Profile = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type Person = Profile & {
  // Domain of the site the person was found on, without path or query.
  foundOn: string;
  foundAt: number;
  // True when the page's domain is the person's handle. A rel="me" link on
  // its own proves nothing, because any page can link to any profile.
  verified: boolean;
  refreshedAt: number;
};

export type People = Record<string, Person>;

export function addPerson(
  people: People,
  profile: Profile,
  foundOn: string,
  verified: boolean,
  now: number,
): { people: People; isNew: boolean } {
  const existing = people[profile.did];
  if (!existing) {
    const person: Person = { ...profile, foundOn, foundAt: now, verified, refreshedAt: now };
    return { people: { ...people, [profile.did]: person }, isNew: true };
  }

  // Found again: take the fresh profile data, and let a verified sighting
  // replace an unverified one.
  const upgrade = verified && !existing.verified;
  const person: Person = {
    ...existing,
    ...profile,
    foundOn: upgrade ? foundOn : existing.foundOn,
    verified: existing.verified || verified,
    refreshedAt: now,
  };
  return { people: { ...people, [profile.did]: person }, isNew: false };
}

// Apply refreshed profiles. A changed handle drops verification, because the
// domain it was verified against is no longer the person's handle.
export function refreshPeople(people: People, profiles: Profile[], now: number): People {
  const next = { ...people };
  for (const profile of profiles) {
    const existing = next[profile.did];
    if (!existing) continue;
    next[profile.did] = {
      ...existing,
      ...profile,
      verified: existing.verified && existing.handle === profile.handle,
      refreshedAt: now,
    };
  }
  return next;
}

export function sortedPeople(people: People): Person[] {
  return Object.values(people).sort((a, b) => b.foundAt - a.foundAt);
}

export function profileUrl(person: Pick<Person, "did" | "handle">): string {
  const actor = person.handle === "handle.invalid" ? person.did : person.handle;
  return `https://bsky.app/profile/${actor}`;
}

// Groups shown in the popup, in this order. People on the current page are
// listed there only, not again under the day they were first found.
export type Group = { title: string; people: Person[] };

export function matchesQuery(person: Person, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [person.displayName ?? "", person.handle, person.foundOn].some((v) =>
    v.toLowerCase().includes(q),
  );
}

export function groupPeople(
  people: People,
  onPage: readonly string[],
  query: string,
  now: number,
): Group[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
  const here = new Set(onPage);

  const groups: Group[] = [
    { title: "On this page", people: [] },
    { title: "Today", people: [] },
    { title: "This week", people: [] },
    { title: "Earlier", people: [] },
  ];
  for (const person of sortedPeople(people)) {
    if (!matchesQuery(person, query)) continue;
    const index = here.has(person.did)
      ? 0
      : person.foundAt >= startOfToday
        ? 1
        : person.foundAt >= weekAgo
          ? 2
          : 3;
    groups[index]!.people.push(person);
  }
  return groups.filter((g) => g.people.length > 0);
}

// Version 0.2.0 stored the full page URL in foundOn. Keeps only the domain.
export function withDomainsOnly(people: People): People {
  const next: People = {};
  for (const [did, person] of Object.entries(people)) {
    next[did] = { ...person, foundOn: siteOf(person.foundOn) ?? person.foundOn };
  }
  return next;
}
