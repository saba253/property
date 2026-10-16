import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Where processed photos are kept. The rest of the app only knows this small interface and opaque
 * keys, so a later S3 / Cloudflare R2 adapter (put/get/delete of the same keys in a private
 * bucket) can replace the local one without touching the upload UI, the routes or the database.
 *
 * Keys are generated here (128 random bits, hex) and validated on every call: a key can never
 * contain a path separator, "..", a drive letter or anything from the browser.
 */
export interface PhotoStorage {
  put(key: string, data: Uint8Array): Promise<void>;
  /** The stored bytes, or null when the key does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Removes the object; removing a missing key is not an error. */
  delete(key: string): Promise<void>;
}

const KEY = /^[0-9a-f]{32}\.webp$/;

export function newStorageKey(): string {
  return `${randomBytes(16).toString("hex")}.webp`;
}

export function isStorageKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

function assertKey(key: string) {
  if (!isStorageKey(key)) throw new Error("Invalid storage key");
}

/**
 * Local disk storage under `root` (for development: <project>/.data/uploads, git-ignored, outside
 * the public folder, so Next.js never serves it). Files go to <root>/<first 2 key chars>/<key>.
 * Writes are atomic: a temporary file in the same folder is renamed into place, so a crash or an
 * error never leaves a half-written photo under its final name.
 */
export function createLocalPhotoStorage(root: string): PhotoStorage {
  const base = path.resolve(root);
  const fileFor = (key: string) => {
    assertKey(key);
    const file = path.resolve(base, key.slice(0, 2), key);
    // Defence in depth: the resolved file must stay inside the root.
    if (!file.startsWith(base + path.sep)) throw new Error("Invalid storage key");
    return file;
  };
  return {
    async put(key, data) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        // "wx": never overwrite an existing file.
        await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
        await rename(temporary, file);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
    async get(key) {
      try {
        return await readFile(fileFor(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(fileFor(key), { force: true });
    },
  };
}

/**
 * The storage folder: PHOTO_STORAGE_DIR, or <cwd>/.data/uploads. A folder inside public/ is
 * refused, because Next.js would serve its files to everyone.
 */
export function resolvePhotoStorageRoot(
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): string {
  const root = path.resolve(cwd, env.PHOTO_STORAGE_DIR?.trim() || path.join(".data", "uploads"));
  const publicDir = path.resolve(cwd, "public");
  if (root === publicDir || root.startsWith(publicDir + path.sep)) {
    throw new Error("PHOTO_STORAGE_DIR must not be inside the public folder");
  }
  return root;
}
