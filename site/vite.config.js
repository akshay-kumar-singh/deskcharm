import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The .dmg is made at the repo root by package.sh and copied next to the
// built page by deploy.sh, not kept in public/. Serve it from the root so
// Download works under `npm run dev` and `npm run preview` too.
const DMG = fileURLToPath(new URL("../DeskCharm.dmg", import.meta.url));

function serveDmg() {
  const handler = (req, res, next) => {
    if (req.url?.split("?")[0] !== "/DeskCharm.dmg" || !existsSync(DMG)) return next();
    res.setHeader("Content-Type", "application/x-apple-diskimage");
    res.setHeader("Content-Length", statSync(DMG).size);
    createReadStream(DMG).pipe(res);
  };
  return {
    name: "serve-dmg",
    configureServer: server => { server.middlewares.use(handler); },
    configurePreviewServer: server => { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  // Relative URLs, so the built site works from any folder on any static host.
  base: "./",
  plugins: [react(), serveDmg()],
});
