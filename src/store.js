// src/store.js — durable storage adapter for the Inbox.
//
// The Managed Inbox SKU (freemium → $9/mo) needs messages + verifications to
// survive process restarts and serverless cold starts. This module exposes a
// minimal Store interface with two backends:
//   - FileStore   : local JSON file (self-host / dev / single-node Node server)
//   - connectStore: pluggable external store (Vercel KV / Redis / Postgres)
//
// Inbox only depends on the interface: { get, set, delete }.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const MemoryStore = (() => {
  const mem = new Map();
  return {
    async get(k) { const v = mem.get(k); return v === undefined ? null : v; },
    async set(k, v) { mem.set(k, v); return v; },
    async delete(k) { mem.delete(k); return null; },
  };
})();

export class FileStore {
  constructor(path) {
    this.path = path;
    this.cache = new Map();
    this.loaded = false;
  }
  async _load() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.path, "utf8");
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj || {})) this.cache.set(k, v);
    } catch (e) {
      if (e.code !== "ENOENT") throw e; // first run: no file yet
    }
    this.loaded = true;
  }
  async _flush() {
    const obj = Object.fromEntries(this.cache.entries());
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(obj), "utf8");
  }
  async get(k) { await this._load(); return this.cache.has(k) ? this.cache.get(k) : null; }
  async set(k, v) { await this._load(); this.cache.set(k, v); await this._flush(); return v; }
  async delete(k) { await this._load(); this.cache.delete(k); await this._flush(); return null; }
}

// Pluggable adapter for a hosted store (Vercel KV / Redis / SQL): implement
// { get(k):Promise<any|null>, set(k,v):Promise<any>, delete(k):Promise<any> }
// and pass the instance here. Keeps the Inbox storage agnostic.
export function connectStore(adapter) {
  if (!adapter || typeof adapter.get !== "function" || typeof adapter.set !== "function") {
    throw new Error("connectStore requires an adapter with async get/set.");
  }
  return adapter;
}