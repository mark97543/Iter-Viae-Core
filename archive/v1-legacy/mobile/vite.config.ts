import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 3000,
    host: true
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: true
  }
});
