import * as maplibregl from "maplibre-gl";

function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Mensa Tactical Base",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#0b0f19"
          }
        }
      ]
    },
    center: [-98.5795, 39.8283],
    zoom: 4,
    pitch: 0,
    bearing: 0
  });

  // Add zoom and orientation navigation controls
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return map;
}

window.addEventListener("DOMContentLoaded", () => {
  initMap();
});
