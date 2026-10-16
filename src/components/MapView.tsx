import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLat } from "@/lib/geo";

type Props = {
  user?: { lat: number; lng: number; acc?: number } | null;
  track?: LngLat[][];
  route?: LngLat[] | null;
  dest?: { lat: number; lng: number } | null;
  follow?: boolean;
  fit?: boolean;
  interactive?: boolean;
  className?: string;
};

const DEFAULT: LngLat = [5.1214, 52.0907];

function css(v: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#0a84ff";
}

export default function MapView({ user, track, route, dest, follow, fit, interactive = true, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const destMarker = useRef<maplibregl.Marker | null>(null);
  const centered = useRef(false);
  const latest = useRef({ track, route });
  latest.current = { track, route };

  useEffect(() => {
    if (!el.current) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const m = new maplibregl.Map({
      container: el.current,
      style: `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`,
      center: user ? [user.lng, user.lat] : DEFAULT,
      zoom: 14,
      attributionControl: { compact: true },
      interactive,
    });
    map.current = m;
    m.on("load", () => {
      m.addSource("route", { type: "geojson", data: emptyFc() });
      m.addSource("track", { type: "geojson", data: emptyFc() });
      m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      m.addLayer({ id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": css("--map-route"), "line-width": 5, "line-opacity": 0.55 } });
      m.addLayer({ id: "track", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": css("--map-track"), "line-width": 6 } });
      ready.current = true;
      sync();
    });
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { track, route } = latest.current;
    (m.getSource("track") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (track || []).filter((s) => s.length > 1).map((s) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: s } })),
    });
    (m.getSource("route") as maplibregl.GeoJSONSource).setData(
      route && route.length > 1
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } }] }
        : emptyFc(),
    );
    if (fit) {
      const all = [...(track || []).flat(), ...(route || [])];
      if (all.length > 1) {
        const b = all.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(all[0], all[0]));
        m.fitBounds(b, { padding: 50, duration: 0 });
      } else if (all.length === 1) m.jumpTo({ center: all[0]!, zoom: 15 });
    }
  }

  useEffect(sync, [track, route, fit]);

  useEffect(() => {
    const m = map.current;
    if (!m || !user) return;
    if (!userMarker.current) {
      const d = document.createElement("div");
      d.className = "user-dot";
      userMarker.current = new maplibregl.Marker({ element: d }).setLngLat([user.lng, user.lat]).addTo(m);
    } else userMarker.current.setLngLat([user.lng, user.lat]);
    if (!fit && (follow || !centered.current)) {
      centered.current = true;
      m.easeTo({ center: [user.lng, user.lat], zoom: follow ? Math.max(m.getZoom(), 16) : m.getZoom(), duration: 600 });
    }
  }, [user, follow, fit]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    destMarker.current?.remove();
    destMarker.current = null;
    if (dest) {
      destMarker.current = new maplibregl.Marker({ color: css("--destructive") }).setLngLat([dest.lng, dest.lat]).addTo(m);
      if (route && route.length > 1 && !follow) {
        const b = route.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(route[0], route[0]));
        m.fitBounds(b, { padding: { top: 140, bottom: 340, left: 40, right: 40 }, duration: 700 });
      }
    }
  }, [dest, route, follow]);

  return <div ref={el} className={className} />;
}

function emptyFc(): any {
  return { type: "FeatureCollection", features: [] };
}
