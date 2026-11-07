import Link from "next/link";

type Punto = { puntoId: number; nombre: string; sede: string | null; vivas: number; porRecoger: number; sinRecibido: number };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

function href(estado: string | undefined, puntoId?: number) {
  const q = new URLSearchParams();
  if (estado) q.set("estado", estado);
  if (puntoId !== undefined) q.set("punto", String(puntoId));
  const texto = q.toString();
  return texto ? `/distribucion/copias?${texto}` : "/distribucion/copias";
}

/** Los puntos de uso con su cuenta de copias vivas; elegir uno filtra la tabla. */
export function ListaPuntos({ puntos, activo, estado }: { puntos: Punto[]; activo: number | null; estado?: string }) {
  const clase = (esActivo: boolean) =>
    `flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm ${FOCO} ${
      esActivo ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;
  return (
    <nav aria-label="Puntos de uso">
      <ul className="flex list-none flex-col gap-0.5">
        <li>
          <Link href={href(estado)} aria-current={activo === null ? "page" : undefined} className={clase(activo === null)}>
            Todos los puntos
          </Link>
        </li>
        {puntos.map((p) => (
          <li key={p.puntoId}>
            <Link
              href={href(estado, p.puntoId)}
              aria-current={activo === p.puntoId ? "page" : undefined}
              className={clase(activo === p.puntoId)}
            >
              <span className="min-w-0 break-words">
                {p.nombre}
                {p.sede ? <span className="block text-xs font-normal">{p.sede}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums" aria-label={`${p.vivas} copias vivas`}>
                {p.vivas}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
