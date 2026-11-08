import Link from "next/link";
import { fechaDeJornada } from "@/componentes/distribucion/socializaciones/TablaJornadas";
import type { SocializacionDeVersion } from "@/db/consultas/distribucion/jornadas";
import { zonaHoraria } from "@/lib/zona-horaria";

type Acuses = { confirmados: number; pendientes: number; porcentaje: number | null };
type Copias = { sinRecibir: number; recibidas: number; porRecoger: number };

/** Solo un trámite publicado con versión deja algo distribuido; una eliminación no tiene versión que repartir. */
export function hayDistribucion(t: { etapa: string; tipo: string; versionId: number | null; versionNumero: number | null }): boolean {
  return t.etapa === "publicado" && t.tipo !== "eliminar" && t.versionId !== null && t.versionNumero !== null;
}

function fechaLarga(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() }).format(d);
}

function textoDeSocializacion(s: SocializacionDeVersion): string {
  if (!s.requerida) return "socialización no requerida";
  if (s.cumplida) return `socialización registrada el ${fechaDeJornada(s.cumplida.fecha)}`;
  if (s.superada) return "socialización superada por una versión nueva";
  return `socialización requerida${s.venceEn ? `, vence el ${fechaLarga(s.venceEn)}` : ""}`;
}

function textoDeCopias(c: Copias): string | null {
  const partes = [
    c.sinRecibir > 0 ? `${c.sinRecibir} ${c.sinRecibir === 1 ? "emitida" : "emitidas"} sin recibir` : null,
    c.recibidas > 0 ? `${c.recibidas} ${c.recibidas === 1 ? "recibida" : "recibidas"}` : null,
    c.porRecoger > 0 ? `${c.porRecoger} de versiones anteriores por recoger` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? `copias: ${partes.join(", ")}` : null;
}

/** Cómo va la distribución de la versión que cerró el trámite: solo cifras de esa versión y el enlace a su ficha. */
export function ResumenDistribucion({
  version,
  enlace,
  acuses,
  socializacion,
  copias,
}: {
  version: number;
  enlace: string;
  acuses: Acuses | null;
  /** Si no se pasa, el segmento se omite (la página del trámite ya tiene su bloque de socialización). */
  socializacion?: SocializacionDeVersion;
  /** `null` si la persona no ve la distribución: la parte de copias se omite. */
  copias: Copias | null;
}) {
  const total = acuses ? acuses.confirmados + acuses.pendientes : 0;
  const textoCopias = copias ? textoDeCopias(copias) : null;
  const partes = [
    acuses && total > 0
      ? `acuses ${acuses.confirmados} de ${total}${acuses.porcentaje === null ? "" : ` (${acuses.porcentaje} %)`}`
      : "acuses: sin destinatarios",
    ...(socializacion ? [textoDeSocializacion(socializacion)] : []),
    ...(textoCopias ? [textoCopias] : []),
  ];
  return (
    <section aria-label="Distribución" className="rounded-xl border border-border bg-card p-4 text-sm shadow-xs">
      <h2 className="mb-1 text-sm font-semibold">Distribución</h2>
      <p>{`Distribución de la versión ${version}: ${partes.join(" · ")}`}</p>
      <Link
        href={enlace}
        className="mt-2 inline-block rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        Ver la ficha del documento
      </Link>
    </section>
  );
}
