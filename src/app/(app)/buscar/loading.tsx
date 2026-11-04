import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="max-w-5xl">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      <div className="mt-6 space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
