/**
 * local-db.ts
 * All scan data lives on-device in IndexedDB (idb).
 * Zero server costs — iOS Documents / Android Downloads accessible via Web Share API.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ScannerSettings } from '@/lib/scanner-types';

export interface LocalScan {
  id: string;
  name: string;
  createdAt: string;        // ISO 8601
  scanType: 'document' | 'photo';
  colorMode: 'color' | 'greyscale';
  paperSize: string;
  format: 'pdf' | 'jpeg';
  pageCount: number;
  thumbnail: string;        // base64 data-URL of first page (for gallery preview)
  pages: string[];          // base64 data-URLs of every page
}

/** In-progress work, kept separate from saved scans and the gallery. */
export interface ActiveScanDraft {
  id: 'active';
  updatedAt: string;
  settings: ScannerSettings;
  pages: string[];
  /** A captured image that is still waiting for crop/filter confirmation. */
  pendingPage: string | null;
}

interface DocScanDB extends DBSchema {
  scans: {
    key: string;
    value: LocalScan;
    indexes: { by_date: string };
  };
  drafts: {
    key: string;
    value: ActiveScanDraft;
  };
}

const DB_NAME    = 'docscan-v1';
const DB_VERSION = 2;

let _db: IDBPDatabase<DocScanDB> | null = null;

async function getDB(): Promise<IDBPDatabase<DocScanDB>> {
  if (_db) return _db;
  _db = await openDB<DocScanDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('scans')) {
        const store = db.createObjectStore('scans', { keyPath: 'id' });
        store.createIndex('by_date', 'createdAt');
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }
    },
  });
  return _db;
}

/** Generate a simple UUID-style ID */
function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listScans(): Promise<LocalScan[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('scans', 'by_date');
  return all.reverse(); // newest first
}

export async function getScan(id: string): Promise<LocalScan | undefined> {
  const db = await getDB();
  return db.get('scans', id);
}

export async function saveScan(
  data: Omit<LocalScan, 'id' | 'createdAt'>
): Promise<LocalScan> {
  const db = await getDB();
  const scan: LocalScan = {
    ...data,
    id: uid(),
    createdAt: new Date().toISOString(),
  };
  await db.put('scans', scan);
  return scan;
}

export async function deleteScan(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('scans', id);
}

export async function updateScan(
  id: string,
  data: Partial<Omit<LocalScan, 'id' | 'createdAt'>>,
): Promise<LocalScan | undefined> {
  const db = await getDB();
  const existing = await db.get('scans', id);
  if (!existing) return undefined;
  const updated: LocalScan = { ...existing, ...data };
  await db.put('scans', updated);
  return updated;
}

export async function clearAllScans(): Promise<void> {
  const db = await getDB();
  await db.clear('scans');
}

// ── Active draft ─────────────────────────────────────────────────────────────

export async function getActiveDraft(): Promise<ActiveScanDraft | undefined> {
  const db = await getDB();
  return db.get('drafts', 'active');
}

export async function saveActiveDraft(
  data: Omit<ActiveScanDraft, 'id' | 'updatedAt'>,
): Promise<ActiveScanDraft> {
  const db = await getDB();
  const draft: ActiveScanDraft = {
    ...data,
    id: 'active',
    updatedAt: new Date().toISOString(),
  };
  await db.put('drafts', draft);
  return draft;
}

export async function clearActiveDraft(): Promise<void> {
  const db = await getDB();
  await db.delete('drafts', 'active');
}

// ── Storage estimate ──────────────────────────────────────────────────────────

export async function getStorageInfo(): Promise<{ usedMB: number; quotaMB: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return {
    usedMB:  Math.round(usage  / 1024 / 1024 * 10) / 10,
    quotaMB: Math.round(quota  / 1024 / 1024),
  };
}
