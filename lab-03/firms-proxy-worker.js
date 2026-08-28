const FIRMS_ORIGIN = "https://firms.modaps.eosdis.nasa.gov";
const ALLOWED_SOURCES = new Set([
  "VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT",
]);

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const cors = { "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Método no permitido", { status: 405, headers: cors });

    const match = requestUrl.pathname.match(/^\/([^/]+)\/([^/]+)\/(-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+)\/([1-5])$/);
    if (!match || !ALLOWED_SOURCES.has(match[2]) || match[1].length > 64) return new Response("Consulta FIRMS inválida", { status: 400, headers: cors });

    const nasaUrl = `${FIRMS_ORIGIN}/api/area/csv/${match.slice(1).join("/")}`;
    const response = await fetch(nasaUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
    const headers = new Headers(response.headers);
    Object.entries(cors).forEach(([name, value]) => headers.set(name, value));
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(response.body, { status: response.status, headers });
  },
};
