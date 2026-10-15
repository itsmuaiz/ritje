import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Clock, MapPin, Navigation, Search, Square, X, AlertTriangle, ChevronRight, CornerUpLeft, CornerUpRight, ArrowUp, RotateCw, Flag, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { LazyMap } from "@/components/LazyMap";
import {
  type ActiveTrip, type Place, type Pt,
  addTrip, fmtDist, fmtDur, fmtKm, fmtTime, fmtDate, haptic, haversine, ingest, loadActive, loadRecent, pushRecent, saveActive,
} from "@/lib/trips";
import { type Route as NavRoute, type LngLat, distToLine, getRoute, reverseGeocode, searchPlaces } from "@/lib/geo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rijden — Rit" },
      { name: "description", content: "Start een rit, registreer je gereden kilometers met GPS en navigeer naar je bestemming." },
      { property: "og:title", content: "Rijden — Rit" },
      { property: "og:description", content: "Start een rit en registreer je zakelijke kilometers met GPS." },
    ],
  }),
  component: Drive,
});

type Summary = { trip: ActiveTrip; end: number; from: string; to: string };

function Drive() {
  const [pos, setPos] = useState<Pt | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [weak, setWeak] = useState(false);
  const [active, setActive] = useState<ActiveTrip | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dest, setDest] = useState<Place | null>(null);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [navOn, setNavOn] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [note, setNote] = useState("");
  const [recent, setRecent] = useState<Place[]>([]);
  const [showPerm, setShowPerm] = useState(false);
  const activeRef = useRef<ActiveTrip | null>(null);
  const watchId = useRef<number | null>(null);
  const lastReroute = useRef(0);
  const wake = useRef<any>(null);
  const spokenStep = useRef(-1);

  // restore an interrupted trip + passive location
  useEffect(() => {
    setRecent(loadRecent());
    const a = loadActive();
    if (a) {
      activeRef.current = a;
      setActive(a);
      startWatch();
      toast("Actieve rit hersteld", { description: "De registratie loopt door. De tijd zonder signaal is als meetgat gemarkeerd." });
    } else if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((p) => {
        if (p.state === "granted") startWatch();
      });
    }
    return () => stopWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [active]);

  // re-acquire wake lock when returning
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && activeRef.current) requestWake(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function requestWake() {
    try { wake.current = await (navigator as any).wakeLock?.request("screen"); } catch { /* not supported */ }
  }

  function startWatch() {
    if (watchId.current != null || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(null);
        const pt: Pt = { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp || Date.now(), acc: p.coords.accuracy };
        setPos(pt);
        const a = activeRef.current;
        if (a) {
          const r = ingest(a, pt);
          setWeak(r.weak);
          if (r.trip !== a) {
            activeRef.current = r.trip;
            setActive(r.trip);
            saveActive(r.trip);
          }
        } else setWeak(false);
      },
      (e) => {
        setGeoError(
          e.code === e.PERMISSION_DENIED
            ? "Geen toegang tot je locatie. Sta locatie toe in de instellingen van je browser om ritten te registreren."
            : "Geen GPS-signaal. De rit loopt door; ontbrekende stukken worden als meetgat gemarkeerd.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  function stopWatch() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }

  // search (debounced)
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return; }
    const id = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchPlaces(query, pos ?? undefined)); } catch { toast.error("Zoeken mislukt. Controleer je internetverbinding."); }
      setSearching(false);
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function pickDest(p: Place) {
    setDest(p); setFocus(false); setQuery(p.name); setResults([]);
    pushRecent(p); setRecent(loadRecent());
    if (!pos) { toast("Locatie nodig voor een routevoorstel"); return; }
    try { setRoute(await getRoute(pos, p)); } catch (e: any) { toast.error(e.message); }
  }
  function clearDest() { setDest(null); setRoute(null); setNavOn(false); setQuery(""); }

  // navigation: reroute when off-route, speak instructions
  const navInfo = useMemo(() => {
    if (!navOn || !route || !pos) return null;
    let idx = route.steps.findIndex((s, i) => i > 0 && haversine(pos, { lat: s.loc[1], lng: s.loc[0] }) > 25 && remainingFrom(route, i, pos) >= 0);
    // choose the next maneuver ahead: nearest step after the closest one passed
    let best = 1, bestD = Infinity;
    route.steps.forEach((s, i) => {
      const d = haversine(pos, { lat: s.loc[1], lng: s.loc[0] });
      if (d < bestD) { bestD = d; best = i; }
    });
    idx = bestD < 30 ? Math.min(best + 1, route.steps.length - 1) : Math.max(1, best);
    const step = route.steps[idx];
    const toStep = haversine(pos, { lat: step.loc[1], lng: step.loc[0] });
    const rest = route.steps.slice(idx).reduce((s, x) => s + x.distance, 0) + toStep - step.distance;
    const remaining = Math.max(toStep, rest);
    const speed = route.distance / route.duration;
    return { idx, step, toStep, remaining, eta: Date.now() + (remaining / speed) * 1000 };
  }, [navOn, route, pos]);

  useEffect(() => {
    if (!navOn || !route || !pos || !dest) return;
    if (haversine(pos, dest) < 40) { toast.success("Je bent aangekomen"); setNavOn(false); return; }
    const off = distToLine(pos, route.geometry);
    if (off > 60 && Date.now() - lastReroute.current > 15000) {
      lastReroute.current = Date.now();
      getRoute(pos, dest).then((r) => { setRoute(r); toast("Route opnieuw berekend"); }).catch(() => {});
    }
  }, [pos, navOn, route, dest]);

  useEffect(() => {
    if (!navInfo || navInfo.idx === spokenStep.current) return;
    if (navInfo.toStep < 300) {
      spokenStep.current = navInfo.idx;
      try {
        const u = new SpeechSynthesisUtterance(`Over ${fmtDist(navInfo.toStep)}, ${navInfo.step.text}`);
        u.lang = "nl-NL";
        speechSynthesis.speak(u);
      } catch { /* noop */ }
    }
  }, [navInfo]);

  function beginTrip(withNav: boolean) {
    if (activeRef.current) return; // never two at once
    if (!localStorage.getItem("rit.permExplained")) { setShowPerm(true); return; }
    haptic(20);
    const a: ActiveTrip = { start: Date.now(), km: 0, segments: [], gaps: 0 };
    if (pos && (pos.acc ?? 0) <= 60 && Date.now() - pos.t < 15000) {
      a.segments = [[pos]]; a.last = pos;
    }
    activeRef.current = a; setActive(a); saveActive(a);
    setNow(Date.now());
    startWatch(); requestWake();
    if (withNav && route) { setNavOn(true); spokenStep.current = -1; }
  }

  async function endTrip() {
    const a = activeRef.current;
    if (!a) return;
    haptic(30);
    activeRef.current = null; setActive(null); saveActive(null);
    setNavOn(false);
    try { await wake.current?.release(); } catch { /* noop */ }
    const pts = a.segments.flat();
    const first = pts[0], last = pts[pts.length - 1];
    const s: Summary = { trip: a, end: Date.now(), from: "Adres ophalen…", to: "Adres ophalen…" };
    if (!first) { s.from = "Onbekend (geen GPS-signaal)"; s.to = "Onbekend (geen GPS-signaal)"; }
    setSummary(s); setNote("");
    if (first) {
      const [from, to] = await Promise.all([reverseGeocode(first.lat, first.lng), reverseGeocode(last.lat, last.lng)]);
      setSummary((cur) => (cur ? { ...cur, from, to } : cur));
    }
  }

  function saveSummary() {
    if (!summary) return;
    const { trip: a } = summary;
    addTrip({
      id: crypto.randomUUID(), start: a.start, end: summary.end, km: a.km, segments: a.segments, gaps: a.gaps,
      from: summary.from, to: summary.to, note: note.trim(),
    });
    haptic(15);
    setSummary(null); clearDest();
    toast.success("Rit opgeslagen");
  }

  const track: LngLat[][] = useMemo(() => (active?.segments ?? []).map((s) => s.map((p) => [p.lng, p.lat] as LngLat)), [active]);
  const elapsed = active ? now - active.start : 0;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <LazyMap className="absolute inset-0" user={pos} track={track} route={route?.geometry ?? null} dest={dest} follow={!!active} />

      {/* top: search or nav instruction */}
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-[max(env(safe-area-inset-top),16px)]">
        {navInfo ? (
          <div className="glass sheet-in flex items-center gap-4 rounded-3xl p-4" role="status" aria-live="polite">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <ManeuverIcon type={navInfo.step.type} modifier={navInfo.step.modifier} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-3xl font-bold tabular-nums leading-none">{fmtDist(navInfo.toStep)}</div>
              <div className="mt-1 truncate text-base font-medium">{navInfo.step.text}</div>
            </div>
            <button onClick={() => setNavOn(false)} className="press flex size-11 items-center justify-center rounded-full bg-secondary" aria-label="Navigatie stoppen">
              <X className="size-5" />
            </button>
          </div>
        ) : !active ? (
          <div className="glass rounded-3xl">
            <label className="flex min-h-14 items-center gap-3 px-4">
              <Search className="size-5 text-muted-foreground" aria-hidden />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setDest(null); setRoute(null); }}
                onFocus={() => setFocus(true)}
                placeholder="Waar wil je naartoe?"
                aria-label="Waar wil je naartoe?"
                className="h-14 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={clearDest} className="press flex size-11 items-center justify-center" aria-label="Wissen">
                  <X className="size-5 text-muted-foreground" />
                </button>
              )}
            </label>
            {focus && (results.length > 0 || searching) && (
              <ul className="max-h-[50vh] overflow-auto border-t border-border px-2 pb-2">
                {searching && results.length === 0 && <li className="p-4 text-sm text-muted-foreground">Zoeken…</li>}
                {results.map((r, i) => (
                  <li key={i}>
                    <PlaceRow p={r} onClick={() => pickDest(r)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {(geoError || (active && weak)) && (
          <div className="glass mt-3 flex items-start gap-3 rounded-2xl p-3 text-sm" role="alert">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <span>{geoError ?? "Zwak GPS-signaal. Onnauwkeurige metingen worden genegeerd."}</span>
          </div>
        )}
      </div>

      {!active && pos && (
        <button
          onClick={() => setPos({ ...pos })}
          className="glass press absolute right-4 top-[calc(max(env(safe-area-inset-top),16px)+76px)] z-10 flex size-11 items-center justify-center rounded-full"
          aria-label="Centreer op mijn locatie"
        >
          <LocateFixed className="size-5 text-primary" />
        </button>
      )}

      {/* bottom panel */}
      <section className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(max(env(safe-area-inset-bottom),12px)+76px)]">
        {active ? (
          <div className="glass sheet-in rounded-[28px] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-destructive" /></span>
              Rit wordt opgenomen
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-6xl font-bold tabular-nums tracking-tight" aria-label={`${fmtKm(active.km)} kilometer gereden`}>
                  {fmtKm(active.km)}<span className="ml-1 text-2xl font-semibold text-muted-foreground">km</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-2xl font-semibold tabular-nums"><Clock className="size-5 text-muted-foreground" aria-hidden />{fmtDur(elapsed)}</div>
                {navInfo && <div className="mt-1 text-sm text-muted-foreground">Nog {fmtDist(navInfo.remaining)} · aankomst {fmtTime(navInfo.eta)}</div>}
              </div>
            </div>
            {active.gaps > 0 && <p className="mt-2 text-xs text-warning">{active.gaps} meetgat{active.gaps > 1 ? "en" : ""} — afstand daar niet meegeteld</p>}
            {!navOn && route && dest && (
              <button onClick={() => { setNavOn(true); spokenStep.current = -1; }} className="press mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-semibold">
                <Navigation className="size-5" /> Navigatie naar {dest.name}
              </button>
            )}
            <button onClick={endTrip} className="press mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-lg font-semibold text-destructive-foreground">
              <Square className="size-5 fill-current" /> Stop rit
            </button>
          </div>
        ) : dest && route ? (
          <div className="glass sheet-in rounded-[28px] p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold">{dest.name}</h2>
                <p className="truncate text-sm text-muted-foreground">{dest.address}</p>
              </div>
              <button onClick={clearDest} className="press flex size-11 items-center justify-center rounded-full bg-secondary" aria-label="Sluiten"><X className="size-5" /></button>
            </div>
            <div className="mt-3 flex gap-6">
              <div><div className="text-2xl font-bold tabular-nums">{Math.round(route.duration / 60)} min</div><div className="text-xs text-muted-foreground">verwachte reistijd</div></div>
              <div><div className="text-2xl font-bold tabular-nums">{fmtKm(route.distance / 1000)} km</div><div className="text-xs text-muted-foreground">geplande route</div></div>
            </div>
            <button onClick={() => beginTrip(true)} className="press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
              <Navigation className="size-5" /> Start rit en navigatie
            </button>
            <button onClick={() => beginTrip(false)} className="press mt-2 flex min-h-12 w-full items-center justify-center rounded-2xl font-semibold text-primary">
              Alleen rit starten
            </button>
          </div>
        ) : (
          <div className="glass rounded-[28px] p-5">
            {recent.length > 0 && (
              <>
                <h2 className="mb-1 text-xl font-semibold">Recente bestemmingen</h2>
                <ul className="-mx-2 mb-3">
                  {recent.slice(0, 3).map((r, i) => <li key={i}><PlaceRow p={r} onClick={() => pickDest(r)} /></li>)}
                </ul>
              </>
            )}
            <button onClick={() => beginTrip(false)} className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              <Car className="size-6" /> Start rit
            </button>
          </div>
        )}
      </section>

      {showPerm && (
        <Modal>
          <MapPin className="size-10 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Locatie voor je ritten</h2>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Rit gebruikt je GPS-locatie om de daadwerkelijk gereden route en kilometers te meten. Houd de app tijdens het rijden open: in een browser kan de opname pauzeren als het scherm vergrendelt of je een andere app opent. Die stukken worden als meetgat gemarkeerd, er wordt geen afstand verzonnen.
          </p>
          <button
            onClick={() => { localStorage.setItem("rit.permExplained", "1"); setShowPerm(false); beginTrip(!!route); }}
            className="press mt-5 min-h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground"
          >Doorgaan</button>
          <button onClick={() => setShowPerm(false)} className="press mt-2 min-h-11 w-full font-medium text-primary">Niet nu</button>
        </Modal>
      )}

      {summary && (
        <Modal>
          <h2 className="text-xl font-semibold">Rit afgerond</h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{fmtDate(summary.trip.start)}</p>
          <div className="mt-4 text-5xl font-bold tabular-nums">{fmtKm(summary.trip.km)}<span className="ml-1 text-xl text-muted-foreground">km</span></div>
          <dl className="mt-4 space-y-3 text-left text-[15px]">
            <Row label="Vertrek" value={summary.from} sub={fmtTime(summary.trip.start)} />
            <Row label="Aankomst" value={summary.to} sub={fmtTime(summary.end)} />
          </dl>
          {summary.trip.gaps > 0 && <p className="mt-3 text-left text-xs text-warning">Deze rit bevat {summary.trip.gaps} meetgat(en) zonder GPS-signaal.</p>}
          <label className="mt-4 block text-left text-sm font-medium">
            Zakelijke omschrijving
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bijv. klantbezoek De Vries" className="mt-1 min-h-12 w-full rounded-xl bg-secondary px-3 text-[17px] outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <button onClick={saveSummary} className="press mt-5 min-h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground">Rit opslaan</button>
          <button onClick={() => { if (confirm("Deze rit niet opslaan?")) setSummary(null); }} className="press mt-2 min-h-11 w-full font-medium text-destructive">Verwijderen</button>
        </Modal>
      )}
      {!active && !summary && !dest && <Link to="/ritten" className="sr-only">Naar ritten</Link>}
    </main>
  );
}

function remainingFrom(_r: NavRoute, _i: number, _p: Pt) { return 0; }

function PlaceRow({ p, onClick }: { p: Place; onClick: () => void }) {
  return (
    <button onClick={onClick} className="press flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-secondary">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary"><MapPin className="size-5 text-muted-foreground" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{p.address}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </button>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>
      <span className="tabular-nums text-muted-foreground">{sub}</span>
    </div>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:items-center" role="dialog" aria-modal="true">
      <div className="sheet-in w-full max-w-md rounded-[28px] bg-card p-6 text-center">{children}</div>
    </div>
  );
}

function ManeuverIcon({ type, modifier }: { type: string; modifier?: string }) {
  const c = "size-8";
  if (type === "arrive") return <Flag className={c} />;
  if (type === "roundabout" || type === "rotary") return <RotateCw className={c} />;
  if (modifier?.includes("left")) return <CornerUpLeft className={c} />;
  if (modifier?.includes("right")) return <CornerUpRight className={c} />;
  return <ArrowUp className={c} />;
}
