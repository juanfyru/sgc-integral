import Link from "next/link";
import type { DatoCompartido, IndicadorQueLoUsa } from "@/db/consultas/indicadores/datos";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { CONSOLIDACION } from "@/lib/indicadores/ficha-en-texto";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { numeroEs } from "@/lib/indicadores/semaforo";
import { ETIQUETA_PERIODICIDAD, type Consolidacion, type Periodicidad } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CONGELADO = "(no cambia mientras una ficha aprobada lo use)";

/** El periodo del dato, para decir su plazo: «terminar el mes». */
const PERIODO: Record<Periodicidad, string> = {
  mensual: "el mes",
  bimestral: "el bimestre",
  trimestral: "el trimestre",
  semestral: "el semestre",
  anual: "el año",
};

/** El periodo siguiente que contiene varios del dato, para explicar cómo se junta: «un trimestre», «sus tres meses». */
const MAYOR: Partial<Record<Periodicidad, { mayor: string; partes: string }>> = {
  mensual: { mayor: "un trimestre", partes: "sus tres meses" },
  bimestral: { mayor: "un semestre", partes: "sus tres bimestres" },
  trimestral: { mayor: "un año", partes: "sus cuatro trimestres" },
  semestral: { mayor: "un año", partes: "sus dos semestres" },
};

/** «(un trimestre es la suma de sus tres meses)» (maqueta 12); un dato anual no se junta con nada más largo. */
function comoSeJunta(periodicidad: Periodicidad, consolidacion: Consolidacion): string | null {
  const m = MAYOR[periodicidad];
  if (!m) return null;
  if (consolidacion === "suma") return `(${m.mayor} es la suma de ${m.partes})`;
  if (consolidacion === "ultimo") return `(${m.mayor} toma el valor del último de ${m.partes})`;
  return `(${m.mayor} es el promedio de ${m.partes})`;
}

/** «10 días después de terminar el mes». */
function plazo(d: DatoCompartido): string {
  return d.plazoReporteDias === 0
    ? `El mismo día en que termina ${PERIODO[d.periodicidad]}`
    : `${cuenta(d.plazoReporteDias, "día", "días")} después de terminar ${PERIODO[d.periodicidad]}`;
}

const limite = (v: string) => {
  const f = fraccion(v);
  return f ? numeroEs(f, 4, "truncar") : v;
};

/** «Entre 10 y 1000 · no admite negativos». */
function captura(d: DatoCompartido): string {
  const limites =
    d.capturaMin && d.capturaMax
      ? `Entre ${limite(d.capturaMin)} y ${limite(d.capturaMax)}`
      : d.capturaMin
        ? `Desde ${limite(d.capturaMin)}`
        : d.capturaMax
          ? `Hasta ${limite(d.capturaMax)}`
          : null;
  const negativos = d.admiteNegativos ? "admite negativos" : "no admite negativos";
  return limites ? `${limites} · ${negativos}` : negativos.charAt(0).toUpperCase() + negativos.slice(1);
}

function Fila({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{termino}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const Nota = ({ children }: { children: React.ReactNode }) => <span className="text-muted-foreground"> {children}</span>;

/**
 * La ficha de un dato compartido (anexo 14C, §4.1, maqueta 12): qué incluye, su fuente y su unidad, la periodicidad y cómo se
 * junta (de solo lectura, con su explicación, mientras una ficha aprobada lo cite: F14C-DC34), la captura, el plazo, quién
 * responde y los indicadores que lo usan y que la persona ve, sin decir si hay más.
 */
export function FichaDelDato({ dato, usan }: { dato: DatoCompartido; usan: IndicadorQueLoUsa[] }) {
  const junta = comoSeJunta(dato.periodicidad, dato.consolidacion);
  return (
    <dl className="flex min-w-0 flex-col gap-2">
      <Fila termino="Qué incluye">{dato.descripcion ?? <span className="text-muted-foreground">—</span>}</Fila>
      <Fila termino="Fuente">{dato.fuente ?? <span className="text-muted-foreground">—</span>}</Fila>
      <Fila termino="Unidad">{dato.unidad ?? <span className="text-muted-foreground">—</span>}</Fila>
      <Fila termino="Periodicidad">
        {ETIQUETA_PERIODICIDAD[dato.periodicidad]}
        {dato.citado ? <Nota>{CONGELADO}</Nota> : null}
      </Fila>
      <Fila termino="Cómo se junta">
        {CONSOLIDACION[dato.consolidacion]}
        {junta ? <Nota>{junta}</Nota> : null}
      </Fila>
      {dato.dimension ? (
        <Fila termino="Desagregación">
          {dato.dimension}
          {dato.citado ? <Nota>{CONGELADO}</Nota> : null}
        </Fila>
      ) : null}
      <Fila termino="Captura">{captura(dato)}</Fila>
      <Fila termino="Plazo">{plazo(dato)}</Fila>
      <Fila termino="Responden">
        {dato.responsables.length > 0 ? (
          dato.responsables.map((r, k) => (
            <span key={r.id}>
              {r.nombre}
              {r.activo ? null : <Nota>(inactivo)</Nota>}
              {k < dato.responsables.length - 1 ? ", " : null}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">Nadie designado: lo reportan los líderes del proceso dueño o, sin ellos, el Administrador del SGC</span>
        )}
      </Fila>
      <Fila termino="Lo usan">
        {usan.length > 0 ? (
          <ul className="flex list-none flex-col gap-1">
            {usan.map((i) => (
              <li key={i.id}>
                <Link href={rutaDeIndicador(i.codigo)} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  <span className="font-mono text-xs">{i.codigo}</span> {i.nombre}
                </Link>
                <Nota>({ETIQUETA_PERIODICIDAD[i.periodicidad].toLowerCase()})</Nota>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Fila>
    </dl>
  );
}
