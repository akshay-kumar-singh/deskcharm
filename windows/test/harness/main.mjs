// Renders the powers' effects in an off-screen window — nothing is shown on
// screen — and saves a picture of each at chosen moments, to look over.
// Run with: npx electron test/harness/main.mjs <out-dir> [effect:t ...]
import { app, BrowserWindow, net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const repo = path.join(root, "..");
const out = process.argv[2] ?? path.join(root, "harness-out");
const cases = process.argv.slice(3).map(c => c.split(":"));

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
if (process.platform === "darwin") app.dock?.hide();

app.whenReady().then(async () => {
  const roots = { charms: path.join(repo, "Charms", "hd"), effects: path.join(repo, "Effects") };
  protocol.handle("app", request => {
    const parts = decodeURIComponent(new URL(request.url).pathname).split("/").filter(Boolean);
    const file = roots[parts[0]] ? path.join(roots[parts[0]], ...parts.slice(1)) : path.join(root, ...parts);
    return net.fetch(pathToFileURL(file).toString());
  });
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1512, height: 982, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  const errors = [];
  win.webContents.on("console-message", e => { if (e.level === "error" || e.level === "warning") errors.push(e.message); });
  for (const [effect, t] of cases) {
    errors.length = 0;
    await win.loadURL(`app://deskcharm/test/harness/effects.html?effect=${effect}&t=${t}`);
    let title = "";
    for (let i = 0; i < 600 && !title.startsWith("done"); i++) {
      await new Promise(r => setTimeout(r, 50));
      title = win.getTitle();
    }
    await new Promise(r => setTimeout(r, 120));
    const image = await win.webContents.capturePage();
    const file = path.join(out, `${effect}-${t}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`${effect} @ ${t}s: ${title || "TIMED OUT"}${errors.length ? `\n   errors: ${errors.join(" | ")}` : ""}`);
  }
  app.quit();
});
