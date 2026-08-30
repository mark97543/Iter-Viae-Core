import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/valhalla-proxy": {
        target: "http://46.202.179.124:8002",
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
        target: "http://46.202.179.124:8002",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/valhalla-proxy/, "")
      }
    }
  }
});
