import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LazyMap } from "@/components/LazyMap";
import { type Trip, deleteTrip, fmtDate, fmtDur, fmtKm, fmtTime, haptic, loadTrips, updateTrip } from "@/lib/trips";
import type { LngLat } from "@/lib/geo";

export const Route = createFileRoute("/ritten/$id")({
  head: () => ({
    meta: [
      { title: "Ritdetails — Rit" },
      { name: "description", content: "Gereden route, adressen, tijden en omschrijving van je rit." },
      { property: "og:title", content: "Ritdetails — Rit" },
      { property: "og:description", content: "Details van een geregistreerde rit." },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    const t = loadTrips().find((x) => x.id === id) ?? null;
    setTrip(t);
    setNote(t?.note ?? "");
  }, [id]);

  const track = useMemo(() => (trip?.segments ?? []).map((s) => s.map((p) => [p.lng, p.lat] as LngLat)), [trip]);

  if (trip === undefined) return null;
  if (trip === null)
    return (
      <main className="p-8 text-center">
        <p>Rit niet gevonden.</p>
        <Link to="/ritten" className="text-primary">Terug naar ritten</Link>
      </main>
    );

  return (
    <main className="mx-auto min-h-screen max-w-xl pb-32">
      <div className="relative">
        <LazyMap className="h-[42vh] w-full" track={track} fit />
        <Link to="/ritten" className="glass press absolute left-4 top-[max(env(safe-area-inset-top),16px)] flex min-h-11 items-center gap-1 rounded-full pl-2 pr-4 font-medium text-primary">
          <ChevronLeft className="size-5" /> Ritten
        </Link>
      </div>
      <div className="px-4">
        <div className="-mt-6 relative rounded-2xl bg-card p-5">
          <p className="text-sm text-muted-foreground first-letter:uppercase">{fmtDate(trip.start)}</p>
          <div className="text-5xl font-bold tabular-nums">{fmtKm(trip.km)}<span className="ml-1 text-xl text-muted-foreground">km</span></div>
          {trip.gaps > 0 && <p className="mt-1 text-xs text-warning">{trip.gaps} meetgat(en) zonder GPS-signaal — daar is geen afstand geteld.</p>}
        </div>
        <dl className="mt-4 overflow-hidden rounded-2xl bg-card">
          <Item k="Vertrek" v={trip.from} />
          <Item k="Aankomst" v={trip.to} />
          <Item k="Begintijd" v={fmtTime(trip.start)} />
          <Item k="Eindtijd" v={fmtTime(trip.end)} />
          <Item k="Duur" v={fmtDur(trip.end - trip.start)} />
        </dl>
        <label className="mt-4 block rounded-2xl bg-card p-4 text-sm text-muted-foreground">
          Omschrijving
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { if (note !== trip.note) { updateTrip(trip.id, { note }); setTrip({ ...trip, note }); haptic(); toast.success("Omschrijving opgeslagen"); } }}
            placeholder="Voeg een zakelijke omschrijving toe"
            className="mt-1 min-h-11 w-full bg-transparent text-[17px] text-foreground outline-none"
          />
        </label>
        <button onClick={() => setConfirmDel(true)} className="press mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-card font-semibold text-destructive">
          <Trash2 className="size-5" /> Rit verwijderen
        </button>
      </div>

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-3 pb-[max(env(safe-area-inset-bottom),12px)]" role="alertdialog" aria-modal="true">
          <div className="sheet-in w-full max-w-md space-y-2">
            <div className="rounded-2xl bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">Deze rit wordt definitief verwijderd.</p>
              <button onClick={() => { deleteTrip(trip.id); haptic(20); toast("Rit verwijderd"); nav({ to: "/ritten" }); }} className="press mt-3 min-h-12 w-full text-lg font-semibold text-destructive">Verwijder rit</button>
            </div>
            <button onClick={() => setConfirmDel(false)} className="press min-h-14 w-full rounded-2xl bg-card text-lg font-semibold text-primary">Annuleer</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
