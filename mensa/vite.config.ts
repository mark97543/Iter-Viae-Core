import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

const removeCrossoriginPlugin = () => ({
  name: 'remove-crossorigin',
  transformIndexHtml(html: string) {
    return html.replace(/ crossorigin/g, '');
  }
});

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [removeCrossoriginPlugin()],
  build: {
    modulePreload: false,
  },
  optimizeDeps: {
    exclude: ["maplibre-gl"]
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
