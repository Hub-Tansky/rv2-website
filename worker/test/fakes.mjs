// In-memory stand-ins for the Worker's bindings: D1 on node:sqlite with the real migrations, R2 on a Map.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migrations = new URL('../migrations/', import.meta.url);

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrations).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => db.prepare(sql).run(...params),
    exec: () => db.prepare(sql).run(...params),
  });
  return {
    sqlite: db,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const s of statements) s.exec();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export function fakeR2() {
  const objects = new Map();
  const object = (bytes, httpMetadata) => ({
    httpMetadata,
    body: new Blob([bytes]).stream(),
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer,
  });
  return {
    objects,
    async put(key, value, options = {}) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      objects.set(key, { bytes, httpMetadata: options.httpMetadata });
    },
    async get(key) {
      const o = objects.get(key);
      return o ? object(o.bytes, o.httpMetadata) : null;
    },
    async head(key) {
      return objects.has(key) ? { key } : null;
    },
    async list({ prefix = '' } = {}) {
      return { objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false };
    },
    locked: () => false,
    async delete(keys) {
      for (const key of [keys].flat()) {
        if (this.locked(key)) throw new Error(`${key} is locked`);
        objects.delete(key);
      }
    },
  };
}
