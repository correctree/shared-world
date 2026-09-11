import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  // Relative asset paths allow the same build to work at
  // https://USER.github.io/REPOSITORY/ without hard-coding REPOSITORY.
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
