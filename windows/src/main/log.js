import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.js";

// A log in the app's data folder (%APPDATA%\DeskCharm\deskcharm.log on
// Windows), so a problem on someone's machine can be sent back and read.

const MAX = 512 * 1024;
let file = null;

export function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.map(p => (p instanceof Error ? p.stack : typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`;
  process.stdout.write?.(line);
  try {
    file ??= path.join(paths.userData, "deskcharm.log");
    if (fs.existsSync(file) && fs.statSync(file).size > MAX) fs.renameSync(file, `${file}.old`);
    fs.appendFileSync(file, line);
  } catch {
    // Logging must never be what breaks the app.
  }
}
