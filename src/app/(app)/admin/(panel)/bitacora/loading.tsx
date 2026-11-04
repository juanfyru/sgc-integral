import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-4 h-10 w-full rounded-lg" />
      <Skeleton className="mt-4 h-64 w-full rounded-lg" />
    </div>
  );
}
