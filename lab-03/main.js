const FIRMS_API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const WIND_API = "https://api.open-meteo.com/v1/gfs";
// Dirección opcional del Worker incluido en firms-proxy-worker.js (sin barra final).
const FIRMS_PROXY = "";
const REFRESH_SECONDS = 15 * 60;
const MAX_WIND_SOURCES = 180;
const MAX_PARTICLES = 1400;
const KEY_STORAGE = "lab03_firms_map_key";
let fires = [], fireSources = [], windSources = [], particles = [], seconds = REFRESH_SECONDS, automatic = true, moveTimer;
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
const ashCanvas = $("#ash-canvas");
const ashContext = ashCanvas.getContext("2d");
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
    await loadSurfaceWind(fires);
    setStatus("live", "datos NRT");
    $("#updated-label").textContent = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date());
    $("#data-notice").textContent = `${fires.length.toLocaleString("es-CL")} detecciones recibidas en el área visible.`;
  } catch (error) {
    fires = []; setStatus("error", "error de consulta");
    $("#data-notice").textContent = `${error.message}. Si el navegador indica CORS, configura FIRMS_PROXY en main.js.`;
  }
  render(); seconds = REFRESH_SECONDS;
}

async function loadSurfaceWind(list) {
  const targets = ["high", "nominal", "low"].flatMap((level) =>
    list.filter((fire) => fire.confidenceLevel === level).sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, MAX_WIND_SOURCES / 3)
  );
  const batches = [];
  for (let i = 0; i < targets.length; i += 60) batches.push(targets.slice(i, i + 60));
  try {
    await Promise.all(batches.map(async (batch) => {
      const params = new URLSearchParams({
        latitude: batch.map((f) => f.lat.toFixed(4)).join(","),
        longitude: batch.map((f) => f.lon.toFixed(4)).join(","),
        current: "wind_speed_10m,wind_direction_10m", wind_speed_unit: "ms", models: "gfs_global",
      });
      const response = await fetch(`${WIND_API}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const results = Array.isArray(payload) ? payload : [payload];
      batch.forEach((fire, index) => {
        fire.windSpeed = Number(results[index]?.current?.wind_speed_10m);
        fire.windDirection = Number(results[index]?.current?.wind_direction_10m);
      });
    }));
    const available = targets.filter((f) => Number.isFinite(f.windSpeed) && Number.isFinite(f.windDirection)).length;
    $("#wind-label").textContent = `NOAA GFS · ${available} vectores`;
  } catch (error) {
    console.warn("Consulta de viento fallida", error);
    $("#wind-label").textContent = "NOAA GFS · no disponible";
  }
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
  particles = [];
  const visible = filteredFires(), counts = { high: 0, nominal: 0, low: 0 };
  fires.forEach((f) => counts[f.confidenceLevel]++);
  Object.entries(counts).forEach(([level, count]) => $(`#count-${level}`).textContent = count.toLocaleString("es-CL"));
  fireSources = [...visible].sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, MAX_WIND_SOURCES);
  fireSources.forEach((fire) => { fire.cluster = buildFireCluster(fire); });
  windSources = fireSources.filter((f) => Number.isFinite(f.windSpeed) && Number.isFinite(f.windDirection));
  $("#visible-total").textContent = visible.length.toLocaleString("es-CL");
  $("#night-total").textContent = visible.filter((f) => f.isNight).length.toLocaleString("es-CL");
  const maxFrp = Math.max(...visible.map((f) => Number.isFinite(f.frp) ? f.frp : 0));
  $("#max-frp").textContent = visible.length ? `${maxFrp.toFixed(1)} MW` : "—";
  if (visible.length) $("#data-notice").textContent = `${visible.length.toLocaleString("es-CL")} detecciones · ${windSources.length} orígenes de partículas cruzados con viento.`;
}
function setStatus(type, text) { $("#status-label").innerHTML = `<i class="status-dot ${type}"></i>${text}`; }

const PARTICLE_COLORS = {
  high: ["#ff2d1a", "#e7471d", "#ff6b24", "#b72b20"],
  nominal: ["#ff6b24", "#e88938", "#c7562c", "#9f4a35"],
  low: ["#b7ada7", "#8e8884", "#686563", "#c4b9b0"],
};
function seededRandom(seed) {
  let value = Math.abs(Math.sin(seed) * 10000) % 1;
  return () => { value = (value * 9301 + 49297) % 233280; return value / 233280; };
}
function buildFireCluster(fire) {
  const settings = { high: { radius: 22, count: 54 }, nominal: { radius: 15, count: 34 }, low: { radius: 9, count: 18 } }[fire.confidenceLevel];
  const random = seededRandom(fire.lat * 1000 + fire.lon * 10000);
  const colors = PARTICLE_COLORS[fire.confidenceLevel];
  return Array.from({ length: settings.count }, () => {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 1.65) * settings.radius;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, size: .8 + random() * 2.2, alpha: .38 + random() * .58, color: colors[Math.floor(random() * colors.length)] };
  });
}
function drawFireClusters() {
  fireSources.forEach((fire) => {
    const center = map.latLngToContainerPoint([fire.lat, fire.lon]);
    fire.cluster.forEach((dot) => {
      ashContext.globalAlpha = dot.alpha; ashContext.fillStyle = dot.color;
      ashContext.beginPath(); ashContext.arc(center.x + dot.x, center.y + dot.y, dot.size, 0, Math.PI * 2); ashContext.fill();
    });
  });
  ashContext.globalAlpha = 1;
}
function resizeAshCanvas() {
  const width = map.getContainer().clientWidth, height = map.getContainer().clientHeight;
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  ashCanvas.width = Math.round(width * ratio); ashCanvas.height = Math.round(height * ratio);
  ashCanvas.style.width = `${width}px`; ashCanvas.style.height = `${height}px`;
  ashContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function emitParticle() {
  if (!windSources.length || particles.length >= MAX_PARTICLES) return;
  const source = windSources[Math.floor(Math.random() * windSources.length)];
  const point = map.latLngToContainerPoint([source.lat, source.lon]);
  const spread = source.confidenceLevel === "high" ? 10 : source.confidenceLevel === "nominal" ? 7 : 4;
  const direction = (source.windDirection + 180) * Math.PI / 180;
  const colors = PARTICLE_COLORS[source.confidenceLevel] || PARTICLE_COLORS.nominal;
  const life = 100 + Math.random() * 150;
  particles.push({
    x: point.x + (Math.random() - .5) * spread, y: point.y + (Math.random() - .5) * spread,
    vx: Math.sin(direction) * (.18 + source.windSpeed * .095),
    vy: -Math.cos(direction) * (.18 + source.windSpeed * .095),
    life, maxLife: life, size: .7 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)], turbulence: Math.random() * Math.PI * 2,
  });
}
let previousFrame = performance.now();
function animateAsh(now) {
  requestAnimationFrame(animateAsh);
  const dt = Math.min(2, (now - previousFrame) / 16.67); previousFrame = now;
  const width = map.getContainer().clientWidth, height = map.getContainer().clientHeight;
  ashContext.clearRect(0, 0, width, height);
  drawFireClusters();
  if (automatic) for (let i = 0; i < Math.min(6, windSources.length); i++) emitParticle();
  ashContext.globalCompositeOperation = "lighter";
  particles = particles.filter((particle) => {
    particle.life -= dt;
    if (particle.life <= 0 || particle.x < -30 || particle.x > width + 30 || particle.y < -30 || particle.y > height + 30) return false;
    const previousX = particle.x, previousY = particle.y;
    particle.turbulence += .045 * dt;
    particle.x += (particle.vx + Math.sin(particle.turbulence) * .12) * dt;
    particle.y += (particle.vy + Math.cos(particle.turbulence * .8) * .08) * dt;
    const alpha = Math.min(1, particle.life / 35) * Math.min(1, (particle.maxLife - particle.life) / 20);
    ashContext.globalAlpha = alpha * .78;
    ashContext.strokeStyle = particle.color; ashContext.lineWidth = particle.size; ashContext.lineCap = "round";
    ashContext.beginPath(); ashContext.moveTo(previousX, previousY); ashContext.lineTo(particle.x, particle.y); ashContext.stroke();
    return true;
  });
  ashContext.globalAlpha = 1; ashContext.globalCompositeOperation = "source-over";
}

document.querySelectorAll(".check input").forEach((input) => input.addEventListener("change", render));
[$("#source"), $("#days")].forEach((input) => input.addEventListener("change", loadFires));
$("#refresh").addEventListener("click", loadFires);
$("#map-key").addEventListener("keydown", (event) => { if (event.key === "Enter") loadFires(); });
$("#pause").addEventListener("click", (event) => { automatic = !automatic; event.currentTarget.textContent = automatic ? "Pausar auto" : "Reanudar auto"; });
map.on("movestart zoomstart", () => { particles = []; });
map.on("moveend", () => { resizeAshCanvas(); clearTimeout(moveTimer); moveTimer = setTimeout(() => { if ($("#map-key").value.trim()) loadFires(); }, 700); });
window.addEventListener("resize", resizeAshCanvas);
setInterval(() => { if (!automatic) return $("#countdown-label").textContent = "pausada"; seconds--; $("#countdown-label").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; if (seconds <= 0) loadFires(); }, 1000);
resizeAshCanvas(); requestAnimationFrame(animateAsh);
if ($("#map-key").value) loadFires(); else render();
