// Makes the Windows icons from the Mac app's icon set (Tools/AppIcon.iconset,
// drawn by Tools/AppIcon.swift): .ico files of PNG images at the sizes Windows
// asks for, resized with macOS's sips. Run on a Mac: node scripts/make-icons.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const iconset = path.join(root, "..", "Tools", "AppIcon.iconset");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "deskcharm-icons-"));

/** The icon at `size` pixels, resized from the largest picture in the set. */
function png(size) {
  const out = path.join(work, `${size}.png`);
  execFileSync("sips", ["-z", String(size), String(size), path.join(iconset, "icon_512x512@2x.png"), "--out", out], { stdio: "ignore" });
  return fs.readFileSync(out);
}

/** An .ico holding PNG images, as Windows Vista and later read them. */
function ico(sizes) {
  const images = sizes.map(png);
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((data, i) => {
    const e = 6 + 16 * i, size = sizes[i];
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images]);
}

fs.mkdirSync(path.join(root, "assets"), { recursive: true });

// The tray at every scale Windows draws it at (100% to 300%).
fs.writeFileSync(path.join(root, "assets", "tray.ico"), ico([16, 20, 24, 32, 40, 48]));
fs.writeFileSync(path.join(root, "assets", "tray.png"), png(16));
fs.writeFileSync(path.join(root, "assets", "tray@2x.png"), png(32));
// The app: its windows, Start menu and installer.
const app = ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256]);
fs.writeFileSync(path.join(root, "assets", "icon.ico"), app);
fs.writeFileSync(path.join(root, "assets", "icon.png"), png(256));

fs.rmSync(work, { recursive: true, force: true });
console.log("icons written to assets/");
