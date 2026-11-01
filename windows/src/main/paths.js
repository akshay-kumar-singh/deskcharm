import { app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Where everything is: the built pages, the charm and effect art (from the
// repo's own Charms/hd and Effects folders when run from source, bundled
// beside the app once packaged), and the user's own charms.

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, "..", "..");

export const paths = {
  renderer: path.join(appRoot, "dist", "renderer"),
  preload: path.join(appRoot, "src", "preload"),
  assets: path.join(appRoot, "assets"),
  charms: app.isPackaged ? path.join(process.resourcesPath, "Charms") : path.join(appRoot, "..", "Charms", "hd"),
  effects: app.isPackaged ? path.join(process.resourcesPath, "Effects") : path.join(appRoot, "..", "Effects"),
  get userData() { return app.getPath("userData"); },
  get custom() { return path.join(app.getPath("userData"), "Charms"); },
};
