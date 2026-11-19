import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actorFromHref,
  didFromDnsJson,
  didFromWellKnown,
  handleCandidate,
} from "../src/lib/detect.ts";

test("handleCandidate takes the https hostname without www", () => {
  assert.equal(handleCandidate("https://www.Example.com/blog?x=1"), "example.com");
  assert.equal(handleCandidate("https://blog.alice.dev/"), "blog.alice.dev");
});

test("handleCandidate rejects http, IPs, localhost and junk", () => {
  assert.equal(handleCandidate("http://example.com/"), null);
  assert.equal(handleCandidate("https://127.0.0.1/"), null);
  assert.equal(handleCandidate("https://[::1]/"), null);
  assert.equal(handleCandidate("https://localhost:3000/"), null);
  assert.equal(handleCandidate("not a url"), null);
});

test("actorFromHref reads bsky.app profile links", () => {
  assert.equal(actorFromHref("https://bsky.app/profile/Alice.com"), "alice.com");
  assert.equal(actorFromHref("https://bsky.app/profile/alice.com/post/3k"), "alice.com");
  assert.equal(actorFromHref("https://bsky.app/profile/did:plc:abc123"), "did:plc:abc123");
  assert.equal(actorFromHref("https://bsky.app/profile/%40alice.com"), "alice.com");
});

test("actorFromHref reads at:// links", () => {
  assert.equal(actorFromHref("at://did:plc:abc123"), "did:plc:abc123");
  assert.equal(actorFromHref("at://alice.com/app.bsky.feed.post/3k"), "alice.com");
});

test("actorFromHref ignores other links", () => {
  assert.equal(actorFromHref("https://mastodon.social/@alice"), null);
  assert.equal(actorFromHref("https://bsky.app/search?q=alice"), null);
  assert.equal(actorFromHref("https://evil.example/profile/bsky.app"), null);
  assert.equal(actorFromHref("https://bsky.app/profile/not a handle"), null);
});

test("didFromWellKnown accepts a bare DID only", () => {
  assert.equal(didFromWellKnown("did:plc:abc123\n"), "did:plc:abc123");
  assert.equal(didFromWellKnown("did:web:alice.com"), "did:web:alice.com");
  assert.equal(didFromWellKnown("<!doctype html><title>404</title>"), null);
  assert.equal(didFromWellKnown("did:plc:abc\ndid:plc:def"), null);
  assert.equal(didFromWellKnown("did:key:z6Mk"), null);
});

test("didFromDnsJson reads the TXT record", () => {
  const json = { Status: 0, Answer: [{ type: 16, data: '"did=did:plc:abc123"' }] };
  assert.equal(didFromDnsJson(json), "did:plc:abc123");
});

test("didFromDnsJson joins split TXT strings", () => {
  const json = { Answer: [{ type: 16, data: '"did=did:plc:" "abc123"' }] };
  assert.equal(didFromDnsJson(json), "did:plc:abc123");
});

test("didFromDnsJson rejects conflicting or missing records", () => {
  assert.equal(
    didFromDnsJson({
      Answer: [
        { type: 16, data: '"did=did:plc:aaa"' },
        { type: 16, data: '"did=did:plc:bbb"' },
      ],
    }),
    null,
  );
  assert.equal(didFromDnsJson({ Status: 3 }), null);
  assert.equal(didFromDnsJson(null), null);
  assert.equal(didFromDnsJson({ Answer: [{ type: 5, data: "cname.example." }] }), null);
});
