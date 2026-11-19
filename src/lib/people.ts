// The list of people found so far, and the pure rules for changing it.

export type Profile = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

export type Person = Profile & {
  // Page the person was found on.
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
