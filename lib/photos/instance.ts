import "server-only";
import { draftDeps } from "@/lib/drafts/instance";
import type { PhotoDeps } from "@/lib/photos/photo-service";
import {
  type PhotoStorage,
  createLocalPhotoStorage,
  resolvePhotoStorageRoot,
} from "@/lib/photos/storage";

/*
 * Server wiring for draft photos: the same verified session and database pool as drafts, plus
 * the storage adapter. Today that is local disk (PHOTO_STORAGE_DIR or <project>/.data/uploads);
 * an S3/R2 adapter would be chosen here.
 */

const holder = globalThis as typeof globalThis & { __propertyPhotoStorage?: PhotoStorage };

function storage(): PhotoStorage {
  holder.__propertyPhotoStorage ??= createLocalPhotoStorage(
    // turbopackIgnore: the storage folder is a runtime location, not a source dependency; the
    // bundler should not trace or watch the project folder through it.
    resolvePhotoStorageRoot(process.env, /* turbopackIgnore: true */ process.cwd()),
  );
  return holder.__propertyPhotoStorage;
}

export const photoDeps: PhotoDeps = {
  currentUserId: draftDeps.currentUserId,
  withConnection: draftDeps.withConnection,
  get storage() {
    return storage();
  },
};
