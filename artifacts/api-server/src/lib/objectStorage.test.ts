import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { ObjectStorageService, ObjectNotFoundError, ObjectTooLargeError, MAX_UPLOAD_BYTES } from "./objectStorage.ts";

const store = async () => new ObjectStorageService(await mkdtemp(path.join(tmpdir(), "kostr-store-")));

test("save then open round-trips content and type", async () => {
  const s = await store();
  const p = s.newObjectPath("org_a");
  await s.save(p, Readable.from([Buffer.from("hello")]), "text/plain");
  const obj = await s.open(p);
  assert.equal(obj.contentType, "text/plain");
  assert.equal(obj.size, 5);
  assert.equal(await text(obj.stream), "hello");
});

test("paths are tied to one org", async () => {
  const s = await store();
  const p = s.newObjectPath("org_a");
  assert.ok(s.belongsTo(p, "org_a"));
  assert.ok(!s.belongsTo(p, "org_b"));
  assert.equal(s.uploadUrl(p), `/api/storage${p}`);
});

test("rejects malformed and traversal paths", async () => {
  const s = await store();
  for (const bad of ["/objects/uploads/org_a/../../etc/passwd", "/objects/uploads/org_a/not-a-uuid", "/etc/passwd", "/objects/uploads/../x/00000000-0000-0000-0000-000000000000"]) {
    assert.ok(!s.belongsTo(bad, "org_a"));
    await assert.rejects(s.open(bad), ObjectNotFoundError);
    await assert.rejects(s.save(bad, Readable.from(["x"]), "text/plain"), ObjectNotFoundError);
  }
});

test("refuses to overwrite an existing object", async () => {
  const s = await store();
  const p = s.newObjectPath("org_a");
  await s.save(p, Readable.from(["first"]), "text/plain");
  await assert.rejects(s.save(p, Readable.from(["second"]), "text/plain"));
  assert.equal(await text((await s.open(p)).stream), "first");
});

test("rejects oversize uploads and leaves no partial file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "kostr-store-"));
  const s = new ObjectStorageService(root);
  const p = s.newObjectPath("org_a");
  await assert.rejects(s.save(p, Readable.from([Buffer.alloc(MAX_UPLOAD_BYTES + 1)]), "application/pdf"), ObjectTooLargeError);
  await assert.rejects(s.open(p), ObjectNotFoundError);
  assert.deepEqual(await readdir(path.join(root, "org_a")), []);
});

test("missing object is not found", async () => {
  const s = await store();
  await assert.rejects(s.open(s.newObjectPath("org_a")), ObjectNotFoundError);
});
