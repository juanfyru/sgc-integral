import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <main className="space-y-8">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </main>
  );
}
