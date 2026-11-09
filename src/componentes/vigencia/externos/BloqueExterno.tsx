import Link from "next/link";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { fichaDeExterno } from "@/db/consultas/vigencia/externos";
import { cuenta } from "@/lib/plural";
import { textoFecha } from "@/lib/vigencia/plazo";
import { ETIQUETA_RESULTADO } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { Dato, ENCABEZADOS, type NivelTitulo } from "../BloqueVigencia";
import { ChipVigencia } from "../ChipVigencia";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * El bloque «Documento externo» de la ficha (portal y panel, spec 13C §14.4), en lugar del bloque «Vigencia»: el
 * emisor, la edición, quién la adoptó, la fuente, la norma, el responsable técnico y su verificación. Lo ve quien ve
 * el documento; «Gestionar en Vigencia → Externos», quien llega a su página de control. Un externo no tiene trámite:
 * no ofrece «Solicitar cambio»; las copias controladas siguen la regla del principal PDF de su propio bloque.
 */
export async function BloqueExterno({
  documentoId,
  sesion,
  nivel = 2,
}: {
  documentoId: number;
  sesion: SesionFlujo;
  /** El nivel del título del bloque: 2 en la ficha del portal y en el panel. */
  nivel?: NivelTitulo;
}) {
  const f = await fichaDeExterno(documentoId, sesion);
  if (!f) return null;
  const zona = zonaHoraria();
  const [Titulo] = ENCABEZADOS[nivel];

  return (
    <section aria-labelledby="titulo-externo" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <Titulo id="titulo-externo" className="mb-3 text-sm font-semibold text-foreground">
        Documento externo
      </Titulo>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm">
        <Dato etiqueta="Entidad emisora">{f.emisor}</Dato>
        {f.tituloOriginal ? <Dato etiqueta="Título original">{f.tituloOriginal}</Dato> : null}
        <Dato etiqueta="Edición">
          {f.vigente
            ? `${f.vigente.edicion}${f.vigente.fechaEdicion ? ` · emitida el ${textoFecha(f.vigente.fechaEdicion, zona)}` : ""}`
            : "Sin edición adoptada"}
        </Dato>
        {f.vigente ? <Dato etiqueta="Adoptó">{`${f.vigente.adoptoPor} el ${textoFecha(f.vigente.adoptadaEn, zona)}`}</Dato> : null}
        <Dato etiqueta="Fuente oficial">
          {/* Texto, no un enlace (F13C-DC19). */}
          <span className="break-all">{f.fuenteOficial ?? "Sin registrar"}</span>
        </Dato>
        {f.norma ? <Dato etiqueta="Norma enlazada">{f.norma}</Dato> : null}
        <Dato etiqueta="Responsable técnico">{f.responsable}</Dato>
        <Dato etiqueta="Verificación">
          <ChipVigencia vigencia={{ estado: f.vigencia.estado, texto: f.vigencia.texto }} />
          <span className="mt-1 block text-xs text-muted-foreground">
            {f.ultimaVerificacion
              ? `Verificado el ${textoFecha(f.ultimaVerificacion.fecha, zona)} por ${f.ultimaVerificacion.nombre} · ${ETIQUETA_RESULTADO[f.ultimaVerificacion.resultado]}`
              : "Sin verificaciones desde su adopción"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {f.vigencia.proxima
              ? `Próxima verificación el ${textoFecha(f.vigencia.proxima, zona)} · cada ${cuenta(f.verificacionMeses, "mes", "meses")}`
              : `Cada ${cuenta(f.verificacionMeses, "mes", "meses")}`}
          </span>
        </Dato>
      </dl>
      {f.gestionable ? (
        <div className="mt-4 print:hidden">
          <Link href={`/vigencia/externos/${f.documentoId}`} className={`rounded text-sm font-medium underline underline-offset-2 ${FOCO}`}>
            Gestionar en Vigencia → Externos
          </Link>
        </div>
      ) : null}
    </section>
  );
}
