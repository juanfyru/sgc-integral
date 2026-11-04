import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <main>
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-2 h-7 w-80 max-w-full" />
      <Skeleton className="mt-6 h-64 w-full rounded-lg" />
    </main>
  );
}
