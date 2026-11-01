import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Builds the Windows installer, release/DeskCharm-Setup.exe, on a Mac as well
// as on Windows. koffi's Windows binary comes in a package of its own, which
// npm only installs on Windows, so it's fetched first; then the pages are
// built and electron-builder packs the app with the charm and effect art.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

const { version } = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "koffi", "package.json"), "utf8"));
run("npm", "install", "--no-save", "--force", "--ignore-scripts", `@koromix/koffi-win32-x64@${version}`);
run("npx", "vite", "build");
run("npx", "electron-builder", "--win", "--x64", "--publish", "never");

const setup = path.join(root, "release", "DeskCharm-Setup.exe");
console.log(`\n${setup}  (${(fs.statSync(setup).size / 1e6).toFixed(1)} MB)`);
