import { defineConfig } from "vite";

export default defineConfig({
  // Set to `/<repository>/` after choosing the GitHub repository name.
  base: process.env.GITHUB_PAGES_BASE ?? "/",
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
});
