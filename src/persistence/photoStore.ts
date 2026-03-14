/**
 * IndexedDB photo store (Phase 2)
 *
 * Replaces base64 dataUrl blobs in localStorage with binary Blob storage
 * in IndexedDB. localStorage is limited to ~5-10MB per origin; a handful
 * of photos blows that budget. IndexedDB has no practical per-item size
 * limit and does not block the main thread for large writes.
 *
 * PatientEntry.photos (base64 dataUrl) is replaced with PatientEntry.photoIds
 * (string[]) referencing entries in this store.
 *
 * Migration: on boot, any patient with the old .photos field is migrated
 * automatically. The old field is removed after migration.
 */

import Dexie, { type Table } from "dexie";

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface StoredPhoto {
  /** Stable ID referenced by PatientEntry.photoIds */
  id: string;
  /** Patient this photo belongs to */
  patientId: string;
  /** Binary blob — avoids base64 encoding overhead and localStorage limits */
  blob: Blob;
  /** MIME type (e.g. "image/jpeg") */
  mimeType: string;
  /** Optional caption */
  caption?: string;
  /** ISO timestamp */
  createdAt: string;
}

// ─── Database ─────────────────────────────────────────────────────────────────

class ToranotPhotoDB extends Dexie {
  photos!: Table<StoredPhoto, string>;

  constructor() {
    super("toranot_photos");
    this.version(1).stores({
      // Primary key: id; indexed: patientId (for getPhotos), createdAt (for order)
      photos: "id,patientId,createdAt",
    });
  }
}

// Singleton — safe to import from multiple modules
export const photoDB = new ToranotPhotoDB();

// ─── API ─────────────────────────────────────────────────────────────────────

/** Persist a photo blob. Overwrites if id already exists. */
export async function savePhoto(photo: StoredPhoto): Promise<void> {
  await photoDB.photos.put(photo);
}

/** Retrieve all photos for a patient, ordered by createdAt ascending. */
export async function getPhotosForPatient(patientId: string): Promise<StoredPhoto[]> {
  return photoDB.photos
    .where("patientId")
    .equals(patientId)
    .sortBy("createdAt");
}

/** Delete a single photo by id. */
export async function deletePhoto(id: string): Promise<void> {
  await photoDB.photos.delete(id);
}

/** Delete all photos for a patient (call on patient removal). */
export async function deletePhotosForPatient(patientId: string): Promise<void> {
  await photoDB.photos.where("patientId").equals(patientId).delete();
}

/** Get a single photo by id, or null if not found. */
export async function getPhoto(id: string): Promise<StoredPhoto | null> {
  return (await photoDB.photos.get(id)) ?? null;
}

// ─── Migration helper ─────────────────────────────────────────────────────────

/** Convert a base64 dataUrl to a Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * One-time migration: reads the legacy PatientPhoto[] from a patient record,
 * moves the blobs to IndexedDB, and returns the new photoIds string[].
 *
 * Call on boot for any patient that still has the old .photos field.
 * Returns the array of new photo IDs to store in PatientEntry.photoIds.
 */
export async function migratePatientPhotos(
  patientId: string,
  legacyPhotos: Array<{ id: string; dataUrl: string; caption?: string; time: string }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const lp of legacyPhotos) {
    try {
      const blob = dataUrlToBlob(lp.dataUrl);
      const stored: StoredPhoto = {
        id: lp.id,
        patientId,
        blob,
        mimeType: blob.type || "image/jpeg",
        caption: lp.caption,
        createdAt: lp.time,
      };
      await savePhoto(stored);
      ids.push(lp.id);
    } catch (err) {
      // Don't crash the boot sequence if one photo is corrupted
      console.warn(`[photoStore] Failed to migrate photo ${lp.id}:`, err);
    }
  }
  return ids;
}

/** Create an object URL for a stored photo (caller must revoke when done). */
export function createPhotoObjectUrl(photo: StoredPhoto): string {
  return URL.createObjectURL(photo.blob);
}
