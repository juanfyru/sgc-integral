import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <Skeleton className="mt-8 h-24 w-full rounded-lg" />
      <div className="mt-8 space-y-4">
        {[0, 1, 2, 3].map((banda) => (
          <div key={banda} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
