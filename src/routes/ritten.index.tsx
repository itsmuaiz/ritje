import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Car } from "lucide-react";
import { type Trip, fmtKm, fmtTime, fmtDate, loadTrips, toCsv, updateTrip } from "@/lib/trips";
import { isCoordLabel, reverseGeocode } from "@/lib/geo";

export const Route = createFileRoute("/ritten/")({
  head: () => ({
    meta: [
      { title: "Ritten — Rit" },
      { name: "description", content: "Al je geregistreerde zakelijke ritten, per datum, met totaal en CSV-export." },
      { property: "og:title", content: "Ritten — Rit" },
      { property: "og:description", content: "Overzicht van je zakelijke kilometers." },
    ],
  }),
  component: Trips,
});

type Period = "week" | "month" | "custom";
const iso = (d: Date) => d.toLocaleDateString("sv-SE");

function Trips() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(() => iso(new Date()));

  useEffect(() => {
    const t = loadTrips();
    setTrips(t);
    // fetch addresses that were stored as coordinates while offline
    t.filter((x) => isCoordLabel(x.from) || isCoordLabel(x.to)).slice(0, 5).forEach(async (x) => {
      const pts = x.segments.flat();
      if (!pts.length) return;
      const f = isCoordLabel(x.from) ? await reverseGeocode(pts[0]!.lat, pts[0]!.lng) : x.from;
      const e = isCoordLabel(x.to) ? await reverseGeocode(pts[pts.length - 1]!.lat, pts[pts.length - 1]!.lng) : x.to;
      updateTrip(x.id, { from: f, to: e });
      setTrips(loadTrips());
    });
  }, []);

  const [startMs, endMs] = useMemo(() => {
    const n = new Date();
    if (period === "week") {
      const d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return [d.getTime(), Infinity];
    }
    if (period === "month") return [new Date(n.getFullYear(), n.getMonth(), 1).getTime(), Infinity];
    return [new Date(from + "T00:00").getTime(), new Date(to + "T23:59:59").getTime()];
  }, [period, from, to]);

  const list = useMemo(() => (trips ?? []).filter((t) => t.start >= startMs && t.start <= endMs).sort((a, b) => b.start - a.start), [trips, startMs, endMs]);
  const total = list.reduce((s, t) => s + t.km, 0);
  const groups = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of list) {
      const k = fmtDate(t.start);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [list]);

  function exportCsv() {
    const blob = new Blob([toCsv(list)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ritten-${period === "custom" ? `${from}_${to}` : iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const seg = "press min-h-9 flex-1 rounded-lg text-sm font-medium data-[on=true]:bg-card data-[on=true]:shadow-sm";

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="flex items-center justify-between pt-6">
        <h1 className="text-[34px] font-bold tracking-tight">Ritten</h1>
        <button onClick={exportCsv} disabled={!list.length} className="press flex min-h-11 items-center gap-1.5 rounded-full px-3 font-medium text-primary disabled:opacity-40">
          <Download className="size-5" /> CSV
        </button>
      </div>

      <div className="mt-3 flex rounded-xl bg-muted p-0.5" role="tablist" aria-label="Periode">
        <button role="tab" aria-selected={period === "week"} data-on={period === "week"} onClick={() => setPeriod("week")} className={seg}>Deze week</button>
        <button role="tab" aria-selected={period === "month"} data-on={period === "month"} onClick={() => setPeriod("month")} className={seg}>Deze maand</button>
        <button role="tab" aria-selected={period === "custom"} data-on={period === "custom"} onClick={() => setPeriod("custom")} className={seg}>Eigen periode</button>
      </div>
      {period === "custom" && (
        <div className="mt-3 flex gap-2">
          <label className="flex-1 text-xs text-muted-foreground">Van<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-card px-3 text-[15px] text-foreground" /></label>
          <label className="flex-1 text-xs text-muted-foreground">Tot en met<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-card px-3 text-[15px] text-foreground" /></label>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-card p-5">
        <div className="text-sm text-muted-foreground">Zakelijke kilometers</div>
        <div className="text-5xl font-bold tabular-nums tracking-tight">{fmtKm(total)}<span className="ml-1 text-xl text-muted-foreground">km</span></div>
        <div className="mt-1 text-sm text-muted-foreground">{list.length} {list.length === 1 ? "rit" : "ritten"}</div>
      </div>

      {trips && trips.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center text-muted-foreground">
          <Car className="size-12" aria-hidden />
          <p className="mt-3 max-w-60">Nog geen ritten. Start je eerste rit via Rijden.</p>
          <Link to="/" className="press mt-4 min-h-11 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">Naar Rijden</Link>
        </div>
      ) : list.length === 0 && trips ? (
        <p className="mt-10 text-center text-muted-foreground">Geen ritten in deze periode.</p>
      ) : (
        groups.map(([day, ts]) => (
          <section key={day} className="mt-6">
            <h2 className="mb-2 px-4 text-[13px] font-medium uppercase text-muted-foreground">{day}</h2>
            <ul className="overflow-hidden rounded-2xl bg-card">
              {ts.map((t) => (
                <li key={t.id} className="border-b border-border last:border-0">
                  <Link to="/ritten/$id" params={{ id: t.id }} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-secondary">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.from} → {t.to}</div>
                      <div className="truncate text-sm text-muted-foreground">{fmtTime(t.start)}{t.note ? ` · ${t.note}` : ""}</div>
                    </div>
                    <div className="font-semibold tabular-nums">{fmtKm(t.km)} km</div>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
