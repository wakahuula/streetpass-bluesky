import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addPerson,
  groupPeople,
  profileUrl,
  refreshPeople,
  sortedPeople,
  type People,
} from "../src/lib/people.ts";

const alice = { did: "did:plc:alice", handle: "alice.com", displayName: "Alice" };

test("addPerson adds someone new", () => {
  const { people, isNew } = addPerson({}, alice, "https://alice.com/", true, 1);
  assert.equal(isNew, true);
  assert.equal(people[alice.did]?.foundAt, 1);
  assert.equal(people[alice.did]?.verified, true);
});

test("a verified sighting replaces an unverified one", () => {
  const first = addPerson({}, alice, "https://blog.example/", false, 1).people;
  const { people, isNew } = addPerson(first, alice, "https://alice.com/", true, 2);
  assert.equal(isNew, false);
  assert.equal(people[alice.did]?.verified, true);
  assert.equal(people[alice.did]?.foundOn, "https://alice.com/");
  assert.equal(people[alice.did]?.foundAt, 1);
});

test("an unverified sighting never downgrades", () => {
  const first = addPerson({}, alice, "https://alice.com/", true, 1).people;
  const { people } = addPerson(first, alice, "https://blog.example/", false, 2);
  assert.equal(people[alice.did]?.verified, true);
  assert.equal(people[alice.did]?.foundOn, "https://alice.com/");
});

test("refreshPeople drops verification when the handle changes", () => {
  const people = addPerson({}, alice, "https://alice.com/", true, 1).people;
  const same = refreshPeople(people, [{ ...alice, displayName: "Alice B." }], 2);
  assert.equal(same[alice.did]?.verified, true);
  assert.equal(same[alice.did]?.displayName, "Alice B.");

  const moved = refreshPeople(people, [{ ...alice, handle: "alice.dev" }], 2);
  assert.equal(moved[alice.did]?.verified, false);
});

test("refreshPeople ignores people that were removed", () => {
  assert.deepEqual(refreshPeople({}, [alice], 1), {});
});

test("sortedPeople puts the latest first", () => {
  let people = addPerson({}, alice, "https://alice.com/", true, 1).people;
  people = addPerson(people, { did: "did:plc:bob", handle: "bob.com" }, "https://bob.com/", true, 2).people;
  assert.deepEqual(sortedPeople(people).map((p) => p.handle), ["bob.com", "alice.com"]);
});

test("profileUrl falls back to the DID for invalid handles", () => {
  assert.equal(profileUrl(alice), "https://bsky.app/profile/alice.com");
  assert.equal(
    profileUrl({ did: "did:plc:x", handle: "handle.invalid" }),
    "https://bsky.app/profile/did:plc:x",
  );
});

test("groupPeople sorts people into page, today, week and earlier", () => {
  const now = new Date(2026, 10, 19, 12).getTime();
  const day = 24 * 60 * 60 * 1000;
  const person = (did: string, foundAt: number) => ({
    did, handle: `${did}.com`, foundOn: `https://${did}.com/`, foundAt, verified: true, refreshedAt: foundAt,
  });
  const people: People = {
    here: person("here", now - 30 * day),
    today: person("today", now - 60 * 60 * 1000),
    week: person("week", now - 3 * day),
    old: person("old", now - 30 * day),
  };
  const groups = groupPeople(people, ["here"], "", now);
  assert.deepEqual(
    groups.map((g) => [g.title, g.people.map((p) => p.did)]),
    [
      ["On this page", ["here"]],
      ["Today", ["today"]],
      ["This week", ["week"]],
      ["Earlier", ["old"]],
    ],
  );
});

test("groupPeople filters by name, handle or site and drops empty groups", () => {
  const people = addPerson({}, alice, "https://blog.example/", false, 1).people;
  assert.equal(groupPeople(people, [], "ALI", 2).length, 1);
  assert.equal(groupPeople(people, [], "blog.example", 2).length, 1);
  assert.deepEqual(groupPeople(people, [], "bob", 2), []);
});
