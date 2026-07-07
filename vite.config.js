import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths so the Electron overlay can load dist/ via file://.
  base: "./",
  server: {
    host: true,
    port: 5176,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5176,
    strictPort: true,
  },
  plugins: [react()],
});
