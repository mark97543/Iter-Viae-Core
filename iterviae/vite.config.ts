import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/valhalla-proxy": {
        target: "https://valhalla.wade-usa.com",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/valhalla-proxy/, "")
      }
    }
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      "/valhalla-proxy": {
        target: "https://valhalla.wade-usa.com",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/valhalla-proxy/, "")
      }
    }
  }
});
