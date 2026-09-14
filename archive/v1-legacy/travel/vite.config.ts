import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 3001,
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
});
