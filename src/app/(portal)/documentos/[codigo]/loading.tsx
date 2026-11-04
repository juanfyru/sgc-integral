import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-3 h-9 w-80 max-w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
