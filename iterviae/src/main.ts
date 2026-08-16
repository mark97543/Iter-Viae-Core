import "./styles.css";

console.log("Iter Viae Web App initialized.");

const launchBtn = document.getElementById("launch-app-btn");
const serverStatusBtn = document.getElementById("server-status-btn");

if (launchBtn) {
  launchBtn.addEventListener("click", () => {
    alert("Launching Iter Viae Tactical Map Surface...\n\nMap Server: https://tiles.wade-usa.com\nValhalla Engine: https://valhalla.wade-usa.com\nDirectus Cloud API: https://api.wade-usa.com");
  });
}

if (serverStatusBtn) {
  serverStatusBtn.addEventListener("click", () => {
    alert("Active API Infrastructure Nodes:\n\n1. Vector Tile Server: ONLINE (https://tiles.wade-usa.com)\n2. Valhalla Routing Engine: ONLINE (https://valhalla.wade-usa.com)\n3. Directus Cloud Backend: READY (https://api.wade-usa.com)");
  });
}
