const API_ORIGIN = "https://www.patagoniafires.org";
// En una página alojada fuera de patagoniafires.org se necesita un proxy CORS.
// Contrato esperado: `${API_PROXY}?url=${encodeURIComponent(urlPatagonia)}`.
const API_PROXY = "";
const REFRESH_SECONDS = 30 * 60;
const CACHE_KEY = "lab03_patagonia_fires";
const COLORS = { critical: "#ff3154", high: "#ff7a33", moderate: "#ffc145", low: "#4ecb71" };
let fires = [], seconds = REFRESH_SECONDS, automatic = true, moveTimer;
const $ = (selector) => document.querySelector(selector);

const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([-32.6949, -64.4842], 5);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
const layer = L.layerGroup().addTo(map);

const isoDate = (date) => date.toISOString().slice(0, 10);
function setInitialDates() {
  const to = new Date(), from = new Date(to); from.setUTCDate(from.getUTCDate() - 7);
  $("#date-from").value = isoDate(from); $("#date-to").value = isoDate(to);
}
function endpoint() {
  const b = map.getBounds();
  const params = new URLSearchParams({ date_from: $("#date-from").value, date_to: $("#date-to").value, min_confidence: "nominal", zoom: map.getZoom().toFixed(1), min_lat: b.getSouth().toFixed(5), max_lat: b.getNorth().toFixed(5), min_lng: b.getWest().toFixed(5), max_lng: b.getEast().toFixed(5) });
  return `${API_ORIGIN}/api/fires?${params}`;
}
function requestUrl() { const url = endpoint(); return API_PROXY ? `${API_PROXY}?url=${encodeURIComponent(url)}` : url; }

async function loadFires() {
  setStatus("loading", "conectando…");
  try {
    const response = await fetch(requestUrl(), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.fires)) throw new Error("respuesta sin focos");
    fires = data.fires;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fires, updatedAt: data.updated_at || new Date().toISOString() }));
    setStatus("live", "en vivo");
    $("#source-label").textContent = "Patagonia Fires · NASA FIRMS";
    $("#updated-label").textContent = formatDate(data.updated_at || new Date().toISOString());
    $("#data-notice").textContent = `${fires.length.toLocaleString("es-CL")} detecciones recibidas para el área visible.`;
  } catch (error) {
    const cached = readCache(); fires = cached?.fires || [];
    setStatus("cached", fires.length ? "caché local" : "sin conexión");
    $("#source-label").textContent = fires.length ? "Última captura local" : "Patagonia Fires";
    $("#updated-label").textContent = cached ? formatDate(cached.updatedAt) : "—";
    $("#data-notice").textContent = API_PROXY ? `No se pudo consultar el proxy: ${error.message}.` : "El origen bloquea consultas entre dominios (CORS). Configura API_PROXY en main.js; se muestra la última captura disponible.";
  }
  render(); seconds = REFRESH_SECONDS;
}
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } }
function activeSeverities() { return new Set([...document.querySelectorAll('.check input[type="checkbox"][value]:checked')].map((input) => input.value)); }
function filteredFires() { const active = activeSeverities(), night = $("#night-only").checked; return fires.filter((f) => active.has(f.severity) && (!night || f.is_night)); }
function render() {
  layer.clearLayers(); const visible = filteredFires(); const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  fires.forEach((f) => { if (counts[f.severity] != null) counts[f.severity]++; });
  Object.entries(counts).forEach(([severity, count]) => $(`#count-${severity}`).textContent = count.toLocaleString("es-CL"));
  const canvas = L.canvas();
  visible.forEach((f) => L.circleMarker([f.lat, f.lng], { renderer: canvas, radius: Math.max(4, Math.min(13, (Number(f.severity_score) || 0) / 8)), color: "#fff", weight: .6, opacity: .55, fillColor: COLORS[f.severity] || COLORS.low, fillOpacity: f.is_night ? .95 : .72 }).bindPopup(popup(f)).addTo(layer));
  $("#visible-total").textContent = visible.length.toLocaleString("es-CL");
  $("#night-total").textContent = visible.filter((f) => f.is_night).length.toLocaleString("es-CL");
  const maxFrp = Math.max(...visible.map((f) => Number(f.frp) || 0)); $("#max-frp").textContent = visible.length ? `${maxFrp.toFixed(1)} MW` : "—";
}
function popup(f) {
  const time = String(f.acq_time ?? 0).padStart(4, "0"), observed = `${f.acq_date || "—"} · ${time.slice(0, 2)}:${time.slice(2)} UTC`;
  const frp = Number.isFinite(Number(f.frp)) ? `${Number(f.frp).toFixed(1)} MW` : "—";
  return `<article class="popup"><span class="badge ${f.severity}">${f.severity.toUpperCase()}</span><h3>Foco satelital</h3><dl><dt>Severidad</dt><dd>${f.severity_score ?? "—"}/100</dd><dt>FRP</dt><dd>${frp}</dd><dt>Confianza</dt><dd>${f.confidence_pct ?? f.confidence ?? "—"}${f.confidence_pct != null ? "%" : ""}</dd><dt>Observado</dt><dd>${observed}</dd><dt>Satélite</dt><dd>${f.satellite || "—"}</dd><dt>Coordenadas</dt><dd>${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}</dd></dl></article>`;
}
function formatDate(value) { return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function setStatus(type, text) { $("#status-label").innerHTML = `<i class="status-dot ${type}"></i>${text}`; }
document.querySelectorAll(".check input").forEach((input) => input.addEventListener("change", render));
$("#refresh").addEventListener("click", loadFires);
$("#pause").addEventListener("click", (event) => { automatic = !automatic; event.currentTarget.textContent = automatic ? "Pausar auto" : "Reanudar auto"; });
[$("#date-from"), $("#date-to")].forEach((input) => input.addEventListener("change", loadFires));
map.on("moveend", () => { clearTimeout(moveTimer); moveTimer = setTimeout(loadFires, 500); });
setInterval(() => { if (!automatic) return $("#countdown-label").textContent = "pausada"; seconds--; $("#countdown-label").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; if (seconds <= 0) loadFires(); }, 1000);
setInitialDates(); loadFires();
