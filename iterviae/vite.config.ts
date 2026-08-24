import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    host: true
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: true
  }
});
