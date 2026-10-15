import { Link } from "@tanstack/react-router";
import { Car, ListChecks } from "lucide-react";

export function TabBar() {
  const item =
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-6 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors active:scale-95 data-[status=active]:bg-accent data-[status=active]:text-primary";
  return (
    <nav aria-label="Hoofdmenu" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="glass pointer-events-auto flex w-[min(320px,85vw)] gap-1 rounded-full p-1.5">
        <Link to="/" activeOptions={{ exact: true }} className={item}>
          <Car className="size-6" aria-hidden />
          Rijden
        </Link>
        <Link to="/ritten" className={item}>
          <ListChecks className="size-6" aria-hidden />
          Ritten
        </Link>
      </div>
    </nav>
  );
}
