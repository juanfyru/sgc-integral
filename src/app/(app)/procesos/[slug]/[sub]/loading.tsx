import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="max-w-4xl">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-3 h-8 w-72" />
      <div className="mt-8 space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
