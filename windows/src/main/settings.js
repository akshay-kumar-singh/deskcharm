import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";
import { paths } from "./paths.js";

// The choices made in the tray menu, kept in settings.json in the app's data folder.

const DEFAULTS = { charm: null, charmHeight: 200, ropeLength: 240, sounds: true, position: 1 };

export class Settings {
  constructor() {
    this.file = path.join(paths.userData, "settings.json");
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch (e) {
      if (e.code !== "ENOENT") log("settings unreadable, using defaults:", e.message);
    }
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    this.values[key] = value;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    } catch (e) {
      log("couldn't save settings:", e);
    }
  }

  get all() { return { ...this.values }; }
}
