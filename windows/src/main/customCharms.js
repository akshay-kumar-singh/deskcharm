import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";
import { paths } from "./paths.js";

// The user's own charms, as in the Mac app's CustomCharms.swift: a sticker
// PNG apiece and a list of them, charms.json, in the app's data folder's
// Charms folder. A custom charm's key is "custom-<id>", kept apart from the
// built-ins' file names.

export class CustomCharms {
  constructor() {
    this.all = [];
    try {
      this.all = JSON.parse(fs.readFileSync(this.list, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") log("custom charms unreadable:", e.message);
    }
  }

  get list() { return path.join(paths.custom, "charms.json"); }
  key(c) { return `custom-${c.id}`; }
  charm(key) { return this.all.find(c => this.key(c) === key) ?? null; }
  imagePath(c) { return path.join(paths.custom, `${c.id}.png`); }

  /** Saves a sticker (PNG bytes) as a new charm and returns it. */
  add({ png, name, attach, doubleClick, shake }) {
    fs.mkdirSync(paths.custom, { recursive: true });
    const c = { id: crypto.randomUUID(), name, doubleClick, shake, attachX: attach.x, attachY: attach.y };
    fs.writeFileSync(this.imagePath(c), Buffer.from(png));
    this.all.push(c);
    this.save();
    return c;
  }

  update(key, change) {
    const c = this.charm(key);
    if (!c) return;
    change(c);
    this.save();
  }

  remove(key) {
    const c = this.charm(key);
    if (!c) return;
    fs.rmSync(this.imagePath(c), { force: true });
    this.all = this.all.filter(x => x !== c);
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(paths.custom, { recursive: true });
      fs.writeFileSync(this.list, JSON.stringify(this.all, null, 2));
    } catch (e) {
      log("couldn't save custom charms:", e);
    }
  }
}
