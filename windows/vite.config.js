import { resolve } from "node:path";
import { defineConfig } from "vite";

// Builds the three pages the app shows — the charm, the effects overlay and the
// custom charm maker — into dist/renderer, served by the app as app://deskcharm/.
export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    target: "esnext",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        charm: resolve("src/renderer/charm.html"),
        overlay: resolve("src/renderer/overlay.html"),
        maker: resolve("src/renderer/maker.html"),
      },
    },
  },
});
