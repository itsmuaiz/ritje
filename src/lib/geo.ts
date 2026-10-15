import type { Place } from "./trips";

export type LngLat = [number, number];

export async function searchPlaces(q: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "6", "accept-language": "nl" });
  if (near) {
    const d = 1.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!r.ok) throw new Error("Zoeken mislukt");
  const j: Array<{ lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> }> = await r.json();
  return j.map((x) => ({
    name: x.name || x.display_name.split(",")[0] || x.display_name,
    address: shortAddr(x.address) || x.display_name.split(",").slice(0, 3).join(","),
    lat: +x.lat,
    lng: +x.lon,
  }));
}

function shortAddr(a?: Record<string, string>) {
  if (!a) return "";
  const street = [a["road"], a["house_number"]].filter(Boolean).join(" ");
  const city = a["city"] || a["town"] || a["village"] || a["municipality"] || "";
  return [street, city].filter(Boolean).join(", ");
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&accept-language=nl`,
    );
    const j = await r.json();
    return shortAddr(j.address) || j.display_name || coordLabel(lat, lng);
  } catch {
    return coordLabel(lat, lng);
  }
}
export const coordLabel = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
export const isCoordLabel = (s: string) => /^-?\d+\.\d+, -?\d+\.\d+$/.test(s);

export type Step = { text: string; distance: number; loc: LngLat; type: string; modifier?: string };
export type Route = { geometry: LngLat[]; distance: number; duration: number; steps: Step[] };

export async function getRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Route> {
  const r = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`,
  );
  if (!r.ok) throw new Error("Route berekenen mislukt");
  const j = await r.json();
  const route = j.routes?.[0];
  if (!route) throw new Error("Geen route gevonden");
  const steps: Step[] = route.legs[0].steps.map((s: any) => ({
    text: stepText(s),
    distance: s.distance,
    loc: s.maneuver.location,
    type: s.maneuver.type,
    modifier: s.maneuver.modifier,
  }));
  return { geometry: route.geometry.coordinates, distance: route.distance, duration: route.duration, steps };
}

const MOD: Record<string, string> = {
  left: "linksaf",
  right: "rechtsaf",
  "slight left": "flauw linksaf",
  "slight right": "flauw rechtsaf",
  "sharp left": "scherp linksaf",
  "sharp right": "scherp rechtsaf",
  straight: "rechtdoor",
  uturn: "keer om",
};
function stepText(s: any) {
  const m = s.maneuver;
  const road = s.name ? ` naar ${s.name}` : "";
  const mod = MOD[m.modifier] || "";
  switch (m.type) {
    case "depart":
      return `Vertrek${s.name ? ` via ${s.name}` : ""}`;
    case "arrive":
      return "Je bent op je bestemming";
    case "roundabout":
    case "rotary":
      return `Neem op de rotonde afslag ${m.exit ?? ""}${road}`.replace("  ", " ");
    case "merge":
      return `Voeg in${road}`;
    case "on ramp":
      return `Neem de oprit${road}`;
    case "off ramp":
      return `Neem de afrit${road}`;
    case "fork":
      return `Houd ${m.modifier?.includes("left") ? "links" : "rechts"} aan${road}`;
    default:
      return `${mod ? mod.charAt(0).toUpperCase() + mod.slice(1) : "Ga verder"}${road}`;
  }
}

/** distance in meters from point to polyline (approx, equirectangular) */
export function distToLine(p: { lat: number; lng: number }, line: LngLat[]) {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111320;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const A = line[i]!, B = line[i + 1]!;
    const ax = (A[0] - p.lng) * k, ay = (A[1] - p.lat) * 110540;
    const bx = (B[0] - p.lng) * k, by = (B[1] - p.lat) * 110540;
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    let t = L ? -(ax * dx + ay * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    best = Math.min(best, Math.hypot(x, y));
  }
  return best;
}
