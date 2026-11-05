import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, net, protocol, screen } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CHAINS, DOUBLE_CLICK_TITLES, POSITIONS, POWERS, SHAKE_TITLES, SIZES, hasPowers, powersOf, titleOf,
} from "../shared/charms.js";
import { CustomCharms } from "./customCharms.js";
import { log } from "./log.js";
import { paths } from "./paths.js";
import { Settings } from "./settings.js";
import { createTargets } from "./targets.js";

// DeskCharm for Windows: a charm hanging from the top of the screen on a gold
// chain, in a small see-through window that only takes clicks over the charm,
// with its menu in the system tray. The powers' effects are drawn in a
// full-screen see-through window the charm's page opens itself, so it can draw
// into it directly, frame by frame (see renderer/charm/overlay.js).

const WIN_W = 560, WIN_H = 820;
const ORIGIN = "app://deskcharm";
const windows = process.platform === "win32";

// Pages, art and the user's charms are all served from app://deskcharm/, one
// origin, so the overlay the charm page opens is its own to draw into, and
// three.js can fetch the Hulk.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let settings, customs, targets, tray, charmWin, overlayWin, makerWin;

// A smoke test (see smoke.js) keeps its data in a scratch folder, never the user's.
const smoke = process.env.DESKCHARM_SMOKE;
if (smoke) app.setPath("userData", smoke);
// Run on a Mac (only ever to test it), it's a menu bar app like the real one: no Dock icon.
if (process.platform === "darwin") app.dock?.hide();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => tray?.popUpContextMenu());
  app.whenReady().then(start).catch(e => { log("couldn't start:", e); app.quit(); });
}

// The charm window stays open until Quit; other windows closing mustn't quit.
app.on("window-all-closed", () => {});

process.on("uncaughtException", e => log("uncaught:", e));
process.on("unhandledRejection", e => log("unhandled:", e));

async function start() {
  if (windows) app.setAppUserModelId("local.deskcharm");
  settings = new Settings();
  customs = new CustomCharms();
  targets = await createTargets();
  serveFiles();
  if (!charmKeys().includes(settings.get("charm"))) settings.set("charm", fallbackCharm());
  createCharmWindow();
  createTray();
  listen();
  screen.on("display-metrics-changed", place);
  screen.on("display-removed", place);
  screen.on("display-added", place);
  log(`DeskCharm ${app.getVersion()} started on ${process.platform} ${process.getSystemVersion?.() ?? ""}`);
  if (smoke) (await import("./smoke.js")).run(() => ({ charmWin, overlayWin, tray }));
}

// Files.

function serveFiles() {
  const roots = { charms: paths.charms, effects: paths.effects, custom: paths.custom };
  protocol.handle("app", request => {
    const url = new URL(request.url);
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const root = roots[parts[0]] ?? paths.renderer;
    const rest = roots[parts[0]] ? parts.slice(1) : parts;
    const file = path.resolve(root, ...rest);
    if (!file.startsWith(path.resolve(root) + path.sep)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// Charms.

/** The built-in charms, each key with its art's file name. */
function builtInCharms() {
  try {
    const files = fs.readdirSync(paths.charms).filter(f => /\.(webp|png)$/i.test(f)).sort();
    return new Map(files.map(f => [f.replace(/\.(webp|png)$/i, ""), f]));
  } catch (e) {
    log("no charm art found at", paths.charms, e.message);
    return new Map();
  }
}

function charmKeys() {
  return [...builtInCharms().keys(), ...customs.all.map(c => customs.key(c))];
}

function fallbackCharm() {
  const all = charmKeys();
  return all.find(k => k.includes("Iron")) ?? all[0] ?? null;
}

/** The current charm as the page needs it: its art, and its own powers and hang if it's the user's. */
function currentCharm() {
  const key = settings.get("charm");
  const custom = customs.charm(key);
  if (custom) {
    const stamp = fs.existsSync(customs.imagePath(custom)) ? fs.statSync(customs.imagePath(custom)).mtimeMs : 0;
    return { key, title: custom.name, url: `${ORIGIN}/custom/${custom.id}.png?v=${stamp}`, custom };
  }
  const file = builtInCharms().get(key) ?? `${key}.webp`;
  return { key, title: titleOf(key ?? ""), url: `${ORIGIN}/charms/${encodeURIComponent(file)}`, custom: null };
}

function state() {
  return { settings: settings.all, charm: currentCharm(), charmBounds: charmWin?.getBounds() ?? null, platform: process.platform };
}

function sendState() {
  charmWin?.webContents.send("state", state());
  buildMenu();
}

// The charm's window.

function charmPlace() {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea;
  const x = wa.x + 40 + Math.max(0, wa.width - WIN_W - 80) * settings.get("position");
  return { x: Math.round(x), y: wa.y, width: WIN_W, height: WIN_H };
}

function place() {
  if (!charmWin) return;
  charmWin.setBounds(charmPlace());
  charmWin.webContents.send("state", state());
}

function createCharmWindow() {
  charmWin = new BrowserWindow({
    ...charmPlace(),
    frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false,
    ...(windows ? { type: "toolbar" } : {}),
    webPreferences: {
      preload: path.join(paths.preload, "charm.cjs"),
      backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required", spellcheck: false,
    },
  });
  charmWin.setAlwaysOnTop(true, "screen-saver");
  charmWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // It covers a good deal of screen but is see-through, so it lets clicks
  // through except over the charm itself; the page says when that is, from
  // where watchCursor says the pointer is.
  charmWin.setIgnoreMouseEvents(true);
  if (smoke) charmWin.setOpacity(0);

  charmWin.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName !== "deskcharm-overlay" || !url.startsWith(`${ORIGIN}/overlay.html`)) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false, show: false,
        resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, focusable: false, alwaysOnTop: true, enableLargerThanScreen: true,
        ...(windows ? { type: "toolbar" } : {}),
        webPreferences: { backgroundThrottling: false },
      },
    };
  });
  charmWin.webContents.on("did-create-window", win => {
    overlayWin = win;
    if (smoke) win.setOpacity(0);
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on("closed", () => { overlayWin = null; });
  });
  charmWin.webContents.on("render-process-gone", (_, details) => log("charm page gone:", details));
  charmWin.once("ready-to-show", () => charmWin.showInactive());
  charmWin.loadURL(`${ORIGIN}/charm.html`);
  watchCursor();
}

/**
 * Tells the charm's page where the pointer is while it's over the window,
 * and once when it leaves, so the page can let clicks through everywhere but
 * the charm. Electron could forward mouse moves to the window instead, but on
 * Windows it does that by hooking every mouse move on the computer through
 * this app, which makes the whole mouse stutter whenever the app is busy.
 * Asking where the cursor is, 30 times a second, costs next to nothing.
 */
function watchCursor() {
  let last = null;
  const timer = setInterval(() => {
    if (!charmWin || charmWin.isDestroyed()) return clearInterval(timer);
    const c = screen.getCursorScreenPoint(), b = charmWin.getBounds();
    const over = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
    const at = over ? { x: c.x - b.x, y: c.y - b.y } : null;
    if (at?.x === last?.x && at?.y === last?.y) return;
    last = at;
    charmWin.webContents.send("cursor", at);
  }, 33);
}

function charmDisplay() {
  return screen.getDisplayMatching(charmWin.getBounds());
}

// Messages from the pages.

function listen() {
  ipcMain.handle("state", () => state());
  ipcMain.on("ignore-mouse", (_, ignore) => charmWin?.setIgnoreMouseEvents(ignore || !!smoke));
  ipcMain.on("log", (_, ...parts) => log("[page]", ...parts));

  ipcMain.handle("overlay:show", () => {
    const display = charmDisplay();
    if (!overlayWin) return null;
    overlayWin.setBounds(display.bounds);
    if (!overlayWin.isVisible()) overlayWin.showInactive();
    // Effects are drawn beneath the charm: lines leave from behind it.
    charmWin.moveTop();
    return { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor };
  });
  ipcMain.on("overlay:hide", () => overlayWin?.hide());

  ipcMain.handle("target:find", () => targets.find(charmDisplay()));
  ipcMain.handle("target:stand-in", (_, target) => targets.standIn(target));
  ipcMain.handle("target:hide", (_, target) => targets.hide(target));

  ipcMain.handle("maker:add", (_, made) => {
    try {
      const c = customs.add(made);
      settings.set("charm", customs.key(c));
      sendState();
      makerWin?.close();
      return { ok: true };
    } catch (e) {
      log("couldn't save a custom charm:", e);
      return { ok: false, error: `Couldn't save the charm: ${e.message}` };
    }
  });
  ipcMain.on("maker:cancel", () => makerWin?.close());
}

// The tray and its menu.

function createTray() {
  const icon = nativeImage.createFromPath(path.join(paths.assets, windows ? "tray.ico" : "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("DeskCharm");
  // A left click opens the menu too: there's nothing else to show.
  tray.on("click", () => tray.popUpContextMenu());
  buildMenu();
}

function radio(label, checked, click) {
  return { label, type: "radio", checked, click };
}

function powerMenu(label, chosen, titles, pick) {
  return {
    label,
    submenu: [null, ...POWERS].map(p => radio(p ? titles[p] : "Nothing", p === (chosen ?? null), () => pick(p))),
  };
}

function buildMenu() {
  if (!tray) return;
  const current = settings.get("charm");
  const custom = customs.charm(current);
  const builtIns = [...builtInCharms().keys()];
  const charmItems = builtIns.map(k => radio(titleOf(k), k === current, () => pickCharm(k)));
  if (customs.all.length) {
    charmItems.push({ type: "separator" });
    for (const c of customs.all) charmItems.push(radio(c.name, customs.key(c) === current, () => pickCharm(customs.key(c))));
  }
  charmItems.push({ type: "separator" }, { label: "New Custom Charm…", click: openMaker });

  const template = [{ label: "Charm", submenu: charmItems }];
  if (custom) {
    template.push(
      powerMenu("On Double-Click", custom.doubleClick, DOUBLE_CLICK_TITLES, p => updateCustom(current, c => { c.doubleClick = p; })),
      powerMenu("On Shake", custom.shake, SHAKE_TITLES, p => updateCustom(current, c => { c.shake = p; })),
      { label: `Remove “${custom.name}”…`, click: () => removeCustom(current) },
    );
  }
  template.push(
    { label: "Size", submenu: SIZES.map(([label, v]) => radio(label, Math.abs(settings.get("charmHeight") - v) < 1, () => choose("charmHeight", v))) },
    { label: "Chain length", submenu: CHAINS.map(([label, v]) => radio(label, Math.abs(settings.get("ropeLength") - v) < 1, () => choose("ropeLength", v))) },
    { label: "Position", submenu: POSITIONS.map(([label, v]) => radio(label, settings.get("position") === v, () => { choose("position", v); place(); })) },
  );
  if (hasPowers(powersOf(currentCharm()))) {
    template.push({ label: "Sound Effects", type: "checkbox", checked: settings.get("sounds"), click: item => choose("sounds", item.checked) });
  }
  template.push(
    { label: windows ? "Start with Windows" : "Open at Login", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: "separator" },
    { label: "Quit DeskCharm", click: () => app.quit() },
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function choose(key, value) {
  settings.set(key, value);
  sendState();
}

function pickCharm(key) {
  choose("charm", key);
}

function updateCustom(key, change) {
  customs.update(key, change);
  sendState();
}

async function removeCustom(key) {
  const c = customs.charm(key);
  if (!c) return;
  const { response } = await dialog.showMessageBox({
    type: "warning", buttons: ["Remove", "Cancel"], defaultId: 1, cancelId: 1,
    message: `Remove “${c.name}”?`, detail: "Its sticker will be deleted. This can't be undone.",
  });
  if (response !== 0) return;
  customs.remove(key);
  settings.set("charm", fallbackCharm());
  sendState();
}

// Making a custom charm.

function openMaker() {
  if (makerWin) { makerWin.show(); makerWin.focus(); return; }
  makerWin = new BrowserWindow({
    width: 480, height: 700, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    title: "New Custom Charm", autoHideMenuBar: true, show: false, backgroundColor: "#fbf8f1",
    icon: path.join(paths.assets, windows ? "icon.ico" : "icon.png"),
    webPreferences: { preload: path.join(paths.preload, "maker.cjs"), spellcheck: false },
  });
  makerWin.setMenu(null);
  makerWin.once("ready-to-show", () => makerWin.show());
  makerWin.on("closed", () => { makerWin = null; });
  makerWin.loadURL(`${ORIGIN}/maker.html`);
}
