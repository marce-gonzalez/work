const FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
// Dirección opcional del Worker incluido en firms-proxy-worker.js (sin barra final).
const FIRMS_PROXY = "";
const REFRESH_SECONDS = 15 * 60;
const KEY_STORAGE = "lab03_firms_map_key";
const COLORS = { high: "#ff3154", nominal: "#ff8a38", low: "#57ce78" };
let fires = [], seconds = REFRESH_SECONDS, automatic = true, moveTimer;
const $ = (selector) => document.querySelector(selector);

// Elimina cualquier captura perteneciente a la versión anterior del ejercicio.
localStorage.removeItem("lab03_patagonia_fires");
localStorage.removeItem("dmc_usuario");
localStorage.removeItem("dmc_token");

const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([-32.6949, -64.4842], 5);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors · Data NASA FIRMS",
  className: "line-map-tiles",
}).addTo(map);
const fireLayer = L.layerGroup().addTo(map);
$("#map-key").value = localStorage.getItem(KEY_STORAGE) || "";

function queryUrl() {
  const key = $("#map-key").value.trim();
  const source = $("#source").value;
  const days = $("#days").value;
  const bounds = map.getBounds();
  const area = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((n) => n.toFixed(5)).join(",");
  const base = FIRMS_PROXY || FIRMS_API;
  return `${base}/${encodeURIComponent(key)}/${source}/${area}/${days}`;
}

async function loadFires() {
  const key = $("#map-key").value.trim();
  if (!key) {
    fires = []; render(); setStatus("idle", "esperando clave");
    $("#data-notice").textContent = "Ingresa tu MAP_KEY para consultar datos NRT."; return;
  }
  localStorage.setItem(KEY_STORAGE, key);
  setStatus("loading", "consultando…");
  try {
    const response = await fetch(queryUrl(), { cache: "no-store" });
    const csv = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (/invalid map key|error|exceeded/i.test(csv.slice(0, 300))) throw new Error(csv.trim().slice(0, 140));
    fires = parseCsv(csv).map(normalizeFire).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));
    setStatus("live", "datos NRT");
    $("#updated-label").textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date());
    $("#data-notice").textContent = `${fires.length.toLocaleString("es-CL")} detecciones recibidas en el área visible.`;
  } catch (error) {
    fires = []; setStatus("error", "error de consulta");
    $("#data-notice").textContent = `${error.message}. Si el navegador indica CORS, configura FIRMS_PROXY en main.js.`;
  }
  render(); seconds = REFRESH_SECONDS;
}

function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift()?.map((h) => h.trim()) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? ""])));
}

function normalizeConfidence(value) {
  const clean = String(value).trim().toLowerCase();
  if (clean === "h" || clean === "high") return "high";
  if (clean === "n" || clean === "nominal") return "nominal";
  if (clean === "l" || clean === "low") return "low";
  const number = Number(clean);
  return number >= 80 ? "high" : number >= 30 ? "nominal" : "low";
}
function normalizeFire(row) {
  return { ...row, lat: Number(row.latitude), lon: Number(row.longitude), frp: Number(row.frp), confidenceLevel: normalizeConfidence(row.confidence), isNight: row.daynight === "N" };
}
function activeConfidence() { return new Set([...document.querySelectorAll('.check input[type="checkbox"][value]:checked')].map((input) => input.value)); }
function filteredFires() { const active = activeConfidence(), night = $("#night-only").checked; return fires.filter((f) => active.has(f.confidenceLevel) && (!night || f.isNight)); }

function render() {
  fireLayer.clearLayers();
  const visible = filteredFires(), counts = { high: 0, nominal: 0, low: 0 };
  fires.forEach((f) => counts[f.confidenceLevel]++);
  Object.entries(counts).forEach(([level, count]) => $(`#count-${level}`).textContent = count.toLocaleString("es-CL"));
  const rendered = [...visible].sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, 650);
  rendered.forEach((fire, index) => {
    const confidenceScale = { high: 1.38, nominal: 1, low: .72 }[fire.confidenceLevel] || 1;
    const baseSize = Math.max(34, Math.min(92, 34 + Math.sqrt(Math.max(0, fire.frp || 0)) * 2.2));
    const size = Math.round(baseSize * confidenceScale);
    const delay = -Number(((index * .37) % 7).toFixed(2));
    const rotation = (index * 47) % 360;
    const icon = L.divIcon({
      className: "smoke-marker-wrap",
      iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size * .28],
      html: `<div class="smoke-marker ${fire.confidenceLevel} ${fire.isNight ? "is-night" : ""}" style="--size:${size}px;--delay:${delay}s;--rotation:${rotation}deg"><span class="ember-core"></span><img class="smoke-core" src="./assets/images/smoke-oil.png?v=20260828-4" alt=""><img class="smoke-puff puff-a" src="./assets/images/smoke-oil.png?v=20260828-4" alt=""><img class="smoke-puff puff-b" src="./assets/images/smoke-oil.png?v=20260828-4" alt=""></div>`,
    });
    L.marker([fire.lat, fire.lon], { icon, riseOnHover: true }).bindPopup(popup(fire)).addTo(fireLayer);
  });
  $("#visible-total").textContent = visible.length.toLocaleString("es-CL");
  $("#night-total").textContent = visible.filter((f) => f.isNight).length.toLocaleString("es-CL");
  const maxFrp = Math.max(...visible.map((f) => Number.isFinite(f.frp) ? f.frp : 0));
  $("#max-frp").textContent = visible.length ? `${maxFrp.toFixed(1)} MW` : "—";
  if (visible.length > rendered.length) $("#data-notice").textContent = `${visible.length.toLocaleString("es-CL")} detecciones; se animan las ${rendered.length} con mayor FRP para mantener el mapa fluido.`;
}
function popup(f) {
  const time = String(f.acq_time || "0").padStart(4, "0");
  const confidence = f.confidenceLevel === "high" ? "Alta" : f.confidenceLevel === "nominal" ? "Nominal" : "Baja";
  return `<article class="popup"><span class="badge ${f.confidenceLevel === "high" ? "critical" : f.confidenceLevel === "nominal" ? "high" : "low"}">${confidence.toUpperCase()}</span><h3>Detección FIRMS</h3><dl><dt>FRP</dt><dd>${Number.isFinite(f.frp) ? f.frp.toFixed(1) + " MW" : "—"}</dd><dt>Confianza</dt><dd>${f.confidence || confidence}</dd><dt>Adquisición</dt><dd>${f.acq_date || "—"} · ${time.slice(0, 2)}:${time.slice(2)} UTC</dd><dt>Satélite</dt><dd>${f.satellite || "—"}</dd><dt>Instrumento</dt><dd>${f.instrument || "—"}</dd><dt>Ciclo</dt><dd>${f.isNight ? "Nocturno" : "Diurno"}</dd><dt>Coordenadas</dt><dd>${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}</dd></dl></article>`;
}
function setStatus(type, text) { $("#status-label").innerHTML = `<i class="status-dot ${type}"></i>${text}`; }

document.querySelectorAll(".check input").forEach((input) => input.addEventListener("change", render));
[$("#source"), $("#days")].forEach((input) => input.addEventListener("change", loadFires));
$("#refresh").addEventListener("click", loadFires);
$("#map-key").addEventListener("keydown", (event) => { if (event.key === "Enter") loadFires(); });
$("#pause").addEventListener("click", (event) => { automatic = !automatic; event.currentTarget.textContent = automatic ? "Pausar auto" : "Reanudar auto"; });
map.on("moveend", () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => { if ($("#map-key").value.trim()) loadFires(); }, 700); });
setInterval(() => { if (!automatic) return $("#countdown-label").textContent = "pausada"; seconds--; $("#countdown-label").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; if (seconds <= 0) loadFires(); }, 1000);
if ($("#map-key").value) loadFires(); else render();
