/// <reference types="vite/client" />

declare module "maplibre-gl/dist/maplibre-gl-worker?worker" {
  const worker: new () => Worker;
  export default worker;
}
