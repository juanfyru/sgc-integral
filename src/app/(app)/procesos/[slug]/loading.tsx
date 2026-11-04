import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="max-w-4xl">
      <Skeleton className="h-4 w-52" />
      <Skeleton className="mt-3 h-8 w-64" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
