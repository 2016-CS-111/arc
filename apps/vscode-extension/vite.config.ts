import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const webviewRoot = resolve(extensionRoot, "webview");

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  root: webviewRoot,
  build: {
    emptyOutDir: true,
    manifest: true,
    outDir: resolve(extensionRoot, "dist/webview"),
  },
});
