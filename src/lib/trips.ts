export type Pt = { lat: number; lng: number; t: number; acc?: number };
export type Trip = {
  id: string;
  start: number;
  end: number;
  km: number;
  segments: Pt[][]; // gaps between segments = measurement gaps
  gaps: number;
  from: string;
  to: string;
  note: string;
};
export type ActiveTrip = {
  start: number;
  km: number;
  segments: Pt[][];
  gaps: number;
  last?: Pt;
};

const TRIPS = "rit.trips.v1";
const ACTIVE = "rit.active.v1";
const RECENT = "rit.recent.v1";

export function loadTrips(): Trip[] {
  try {
    return JSON.parse(localStorage.getItem(TRIPS) || "[]");
  } catch {
    return [];
  }
}
export function saveTrips(t: Trip[]) {
  localStorage.setItem(TRIPS, JSON.stringify(t));
}
export function addTrip(t: Trip) {
  saveTrips([t, ...loadTrips()]);
}
export function updateTrip(id: string, patch: Partial<Trip>) {
  saveTrips(loadTrips().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}
export function deleteTrip(id: string) {
  saveTrips(loadTrips().filter((t) => t.id !== id));
}
export function loadActive(): ActiveTrip | null {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE) || "null");
  } catch {
    return null;
  }
}
export function saveActive(a: ActiveTrip | null) {
  if (a) localStorage.setItem(ACTIVE, JSON.stringify(a));
  else localStorage.removeItem(ACTIVE);
}

export type Place = { name: string; address: string; lat: number; lng: number };
export function loadRecent(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}
export function pushRecent(p: Place) {
  const r = [p, ...loadRecent().filter((x) => x.address !== p.address)].slice(0, 5);
  localStorage.setItem(RECENT, JSON.stringify(r));
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Feed a GPS fix into the active trip, filtering noise and jumps. Returns updated trip. */
export function ingest(a: ActiveTrip, p: Pt): { trip: ActiveTrip; accepted: boolean; weak: boolean } {
  const weak = (p.acc ?? 0) > 40;
  if ((p.acc ?? 0) > 60) return { trip: a, accepted: false, weak: true };
  const last = a.last;
  if (!last) {
    const segs = [...a.segments, [p]];
    return { trip: { ...a, segments: segs, last: p }, accepted: true, weak };
  }
  const dt = (p.t - last.t) / 1000;
  const d = haversine(last, p);
  // gap: no fix for > 60s -> new segment, distance not invented
  if (dt > 60) {
    return {
      trip: { ...a, segments: [...a.segments, [p]], gaps: a.gaps + 1, last: p },
      accepted: true,
      weak,
    };
  }
  const minMove = Math.max(10, (p.acc ?? 10) * 0.8, (last.acc ?? 10) * 0.5);
  if (d < minMove) return { trip: a, accepted: false, weak }; // stationary jitter
  if (dt > 0 && d / dt > 70) return { trip: a, accepted: false, weak }; // > 250 km/h jump
  const segs = a.segments.slice();
  segs[segs.length - 1] = [...(segs[segs.length - 1] ?? []), p];
  return { trip: { ...a, segments: segs, km: a.km + d / 1000, last: p }, accepted: true, weak };
}

const nlNum = new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtKm = (km: number) => nlNum.format(km);
export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", hour12: false });
export const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtDateShort = (t: number) => new Date(t).toLocaleDateString("nl-NL");
export function fmtDur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}
export function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${fmtKm(m / 1000)} km`;
}

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}

export function toCsv(trips: Trip[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Datum", "Starttijd", "Eindtijd", "Vertrek", "Aankomst", "Kilometers", "Omschrijving", "Meetgaten"].join(";")];
  for (const t of [...trips].reverse())
    rows.push(
      [fmtDateShort(t.start), fmtTime(t.start), fmtTime(t.end), esc(t.from), esc(t.to), fmtKm(t.km), esc(t.note), t.gaps].join(";"),
    );
  return "\uFEFF" + rows.join("\n");
}
