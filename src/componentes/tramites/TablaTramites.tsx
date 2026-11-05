import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { ResumenTramite } from "@/db/consultas/tramites";
import { estadoPlazo } from "@/lib/tramites/plazos";
import {
  ETIQUETA_ETAPA,
  ETIQUETA_TIPO_SOLICITUD,
  esEtapaDeTrabajo,
  type Etapa,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "solicitud", etiqueta: "Solicitud" },
  { clave: "documento", etiqueta: "Documento" },
  { clave: "pide", etiqueta: "Pide" },
  { clave: "etapa", etiqueta: "Etapa" },
  { clave: "responsable", etiqueta: "Responsable" },
  { clave: "vence", etiqueta: "Vence" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

export function etiquetaEtapa(etapa: Etapa, ronda: number): string {
  return ronda > 1 ? `${ETIQUETA_ETAPA[etapa]}, ronda ${ronda}` : ETIQUETA_ETAPA[etapa];
}

/** Qué versión toca el trámite; null si aún no se sabe. */
export function textoVersion(tipo: TipoSolicitud, etapa: Etapa, numero: number | null): string | null {
  if (numero === null) return tipo === "crear" ? "Documento nuevo" : null;
  if (!esEtapaDeTrabajo(etapa)) return `Versión ${numero}`;
  return tipo === "eliminar" ? `Versión ${numero} por eliminar` : `Versión ${numero} en trámite`;
}

/** El estado del plazo siempre va en texto: la insignia solo lo refuerza con color. */
export function InsigniaPlazo({ vence, ahora }: { vence: Date | null; ahora: Date }) {
  const { estado, dias } = estadoPlazo(vence, ahora, zonaHoraria());
  const unidad = dias === 1 ? "día" : "días";
  if (estado === "sin_plazo") return <span className="text-xs text-muted-foreground">Sin plazo</span>;
  if (estado === "vence_hoy") return <Insignia variante="atencion">Hoy</Insignia>;
  if (estado === "a_tiempo") return <Insignia variante="bien">{`En ${dias} ${unidad}`}</Insignia>;
  return <Insignia variante="critico">{`Vencido hace ${dias} ${unidad}`}</Insignia>;
}

function textoResponsables(nombres: string[]): string {
  if (nombres.length === 0) return "—";
  return nombres.length === 1 ? nombres[0] : `${nombres[0]} y ${nombres.length - 1} más`;
}

function Numero({ tramite }: { tramite: ResumenTramite }) {
  return (
    <Link href={`/tramites/${tramite.id}`} className={`rounded font-mono text-xs font-medium hover:underline ${FOCO}`}>
      {tramite.numero}
    </Link>
  );
}

function Documento({ tramite: t }: { tramite: ResumenTramite }) {
  const detalle = [textoVersion(t.tipo, t.etapa, t.versionNumero), t.procesoNombre].filter(Boolean).join(" · ");
  return (
    <>
      <div>
        {t.codigo ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{t.codigo}</span> : null}
        {t.titulo}
      </div>
      <div className="text-xs text-muted-foreground">{detalle}</div>
    </>
  );
}

/** Tabla desde 768 px; por debajo, una tarjeta por trámite. */
export function TablaTramites({ tramites, ahora }: { tramites: ResumenTramite[]; ahora: Date }) {
  return (
    <>
      <div className="hidden md:block">
        <TablaDatos titulo="Trámites" columnas={COLUMNAS} filas={tramites.length} vacio="Sin trámites">
          {tramites.map((t) => (
            <tr key={t.id}>
              <td className={`${celda} whitespace-nowrap`}><Numero tramite={t} /></td>
              <td className={celda}><Documento tramite={t} /></td>
              <td className={celda}>{ETIQUETA_TIPO_SOLICITUD[t.tipo]}</td>
              <td className={celda}>{etiquetaEtapa(t.etapa, t.ronda)}</td>
              <td className={celda}>{textoResponsables(t.responsables)}</td>
              <td className={`${celda} whitespace-nowrap`}><InsigniaPlazo vence={t.venceEn} ahora={ahora} /></td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {tramites.map((t) => (
          <li key={t.id} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Numero tramite={t} />
              <InsigniaPlazo vence={t.venceEn} ahora={ahora} />
            </div>
            <div className="mt-2"><Documento tramite={t} /></div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Pide</dt>
              <dd>{ETIQUETA_TIPO_SOLICITUD[t.tipo]}</dd>
              <dt className="text-muted-foreground">Etapa</dt>
              <dd>{etiquetaEtapa(t.etapa, t.ronda)}</dd>
              <dt className="text-muted-foreground">Responsable</dt>
              <dd>{textoResponsables(t.responsables)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
