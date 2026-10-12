import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Uploaded files. The browser asks for an upload URL, PUTs the file there, then
// saves the returned objectPath on a record. Today the URL is this API and files
// live on local disk (UPLOAD_DIR). shortcut: single-server only; when running
// more than one API instance, add an S3/R2 driver whose uploadUrl() is a
// presigned PUT URL. Object paths and the frontend stay the same.

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);

// /objects/uploads/<orgId>/<uuid>: the org segment ties a file to one company.
const OBJECT_PATH = /^\/objects\/uploads\/([A-Za-z0-9_-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super(`Upload exceeds ${MAX_UPLOAD_BYTES} bytes`);
    this.name = "ObjectTooLargeError";
  }
}

export interface StoredObject {
  stream: Readable;
  contentType: string;
  size: number;
}

export class ObjectStorageService {
  private readonly root: string;

  constructor(root = path.resolve(process.env.UPLOAD_DIR ?? "uploads")) {
    this.root = root;
  }

  newObjectPath(orgId: string): string {
    return `/objects/uploads/${orgId}/${randomUUID()}`;
  }

  uploadUrl(objectPath: string): string {
    return `/api/storage${objectPath}`;
  }

  belongsTo(objectPath: string, orgId: string): boolean {
    return OBJECT_PATH.exec(objectPath)?.[1] === orgId;
  }

  private fileFor(objectPath: string): string {
    const m = OBJECT_PATH.exec(objectPath);
    if (!m) throw new ObjectNotFoundError();
    return path.join(this.root, m[1], m[2]);
  }

  // Refuses to overwrite: an upload URL is good for one file.
  async save(objectPath: string, body: Readable, contentType: string): Promise<void> {
    const file = this.fileFor(objectPath);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.part`;
    let size = 0;
    const limit = new Transform({
      transform(chunk, _enc, cb) {
        size += chunk.length;
        cb(size > MAX_UPLOAD_BYTES ? new ObjectTooLargeError() : null, chunk);
      },
    });
    try {
      await pipeline(body, limit, createWriteStream(tmp, { flags: "wx" }));
      await writeFile(`${file}.json`, JSON.stringify({ contentType, size }), { flag: "wx" });
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async open(objectPath: string): Promise<StoredObject> {
    const file = this.fileFor(objectPath);
    try {
      const meta = JSON.parse(await readFile(`${file}.json`, "utf8"));
      const { size } = await stat(file);
      return { stream: createReadStream(file), contentType: meta.contentType, size };
    } catch (err: any) {
      if (err?.code === "ENOENT") throw new ObjectNotFoundError();
      throw err;
    }
  }
}
