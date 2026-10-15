import { lazy, Suspense, type ComponentProps } from "react";
import { ClientOnly } from "@tanstack/react-router";

const MapView = lazy(() => import("./MapView"));

export function LazyMap(props: ComponentProps<typeof MapView>) {
  const fb = <div className={`${props.className ?? ""} bg-muted`} />;
  return (
    <ClientOnly fallback={fb}>
      <Suspense fallback={fb}>
        <MapView {...props} />
      </Suspense>
    </ClientOnly>
  );
}
