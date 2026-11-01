import { app, screen } from "electron";
import path from "node:path";
import { log } from "./log.js";

// The window a double-click power goes for, found and handled for the
// renderer. On Windows that's the real front window, through Win32. Anywhere
// else (this is a Windows port, run on a Mac only to test it) there's no
// window to take, unless DESKCHARM_DEMO is set, when a pretend one stands in
// the middle of the screen so every power can be tried end to end.

/** Loads the Windows calls, or explains in the log why they can't be used. */
async function win32() {
  if (process.platform !== "win32") return null;
  try {
    return await import("./win32.js");
  } catch (e) {
    log("Win32 calls unavailable; powers will miss:", e);
    return null;
  }
}

export async function createTargets() {
  const native = await win32();
  const demo = !native && !!process.env.DESKCHARM_DEMO;

  return {
    /**
     * The window in front on `display`, with its frame in the overlay's
     * points (the display's own coordinates in DIPs), or null.
     */
    find(display) {
      if (demo) {
        const w = Math.min(900, display.bounds.width * 0.55), h = Math.min(580, display.bounds.height * 0.55);
        return { id: "demo", title: "Untitled — Notepad",
          frame: { x: (display.bounds.width - w) / 2, y: (display.bounds.height - h) / 2 + 40, width: w, height: h } };
      }
      if (!native) return null;
      try {
        const onDisplay = r => {
          const dip = screen.screenToDipRect(null, { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
          const b = display.bounds;
          return dip.x < b.x + b.width && b.x < dip.x + dip.width && dip.y < b.y + b.height && b.y < dip.y + dip.height;
        };
        const found = native.frontWindow(process.pid, onDisplay);
        if (!found) return null;
        const r = found.rect;
        const dip = screen.screenToDipRect(null, { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
        return {
          id: found.id, title: found.title, pid: found.pid,
          frame: { x: dip.x - display.bounds.x, y: dip.y - display.bounds.y, width: dip.width, height: dip.height },
        };
      } catch (e) {
        log("couldn't find the front window:", e);
        return null;
      }
    },

    /**
     * Something to stand in for the window while it's thrown about: a snapshot
     * of it ({width, height, pixels}), or what a card needs ({card: {name,
     * title, icon}}) when there's no snapshot to be had.
     */
    async standIn(target) {
      if (native) {
        try {
          const shot = native.snapshot(target.id);
          if (shot) return shot;
        } catch (e) {
          log("snapshot failed, using a card:", e);
        }
      }
      let name = "", icon = null;
      try {
        const exe = native && target.pid ? native.exePath(target.pid) : null;
        if (exe) {
          name = path.basename(exe, path.extname(exe));
          icon = (await app.getFileIcon(exe, { size: "large" })).toDataURL();
        }
      } catch (e) {
        log("no icon for the card:", e.message);
      }
      return { card: { name: name || (demo ? "Notepad" : ""), title: target.title ?? "", icon } };
    },

    /** Minimises the window; true once it has gone. */
    async hide(target) {
      if (demo) return true;
      if (!native) return false;
      try {
        if (native.minimise(target.id)) return true;
        // Some windows take a moment to answer.
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 40));
          if (native.gone(target.id)) return true;
        }
        return false;
      } catch (e) {
        log("couldn't minimise the window:", e);
        return false;
      }
    },
  };
}
