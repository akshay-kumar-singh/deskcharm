import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative URLs, so the built site works from any folder on any static host.
  base: "./",
  plugins: [react()],
});
