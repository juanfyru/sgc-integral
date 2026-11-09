import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Evidencia } from "@/db/consultas/distribucion/evidencias";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { HallazgoDeVerificacion } from "@/db/consultas/distribucion/verificaciones";
import { zonaHoraria } from "@/lib/zona-horaria";
import { AccionesHallazgo } from "./AccionesHallazgo";
import { urlDeFoto, urlDeFotoDeHallazgo } from "./enlaces";

const claseEnlace =
  "break-words rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** El estado siempre con texto: «Abierto», «Por validar» o «Cerrado». */
export function InsigniaHallazgo({ estado, vencido = false }: { estado: Hallazgo["estado"]; vencido?: boolean }) {
  if (estado === "cerrado") return <Insignia variante="bien">Cerrado</Insignia>;
  if (estado === "por_validar") return <Insignia variante="atencion">Por validar</Insignia>;
  return vencido ? <Insignia variante="critico">Abierto y vencido</Insignia> : <Insignia variante="atencion">Abierto</Insignia>;
}

function Fotos({ fotos, url, etiqueta }: { fotos: Evidencia[]; url: (f: Evidencia) => string; etiqueta: string }) {
  if (fotos.length === 0) return null;
  return (
    <ul className="mt-2 flex list-none flex-col gap-1" aria-label={etiqueta}>
      {fotos.map((f) => (
        <li key={f.id} className="text-sm">
          <a href={url(f)} className={claseEnlace}>
            {f.nombreOriginal}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** «Validado por el Administrador del SGC» o «por la siguiente verificación del punto», con su enlace. */
function Validacion({ h }: { h: Hallazgo }) {
  if (h.validacion === "verificacion" && h.validacionVerificacionId !== null) {
    return (
      <>
        {" · "}
        <Link href={`/distribucion/verificaciones/${h.validacionVerificacionId}`} className={claseEnlace}>
          Validado por la siguiente verificación del punto
        </Link>
      </>
    );
  }
  return h.validacion === "admin" ? " · Validado por el Administrador del SGC" : null;
}

/**
 * Los hallazgos que abrió una verificación, con su corrección y su cierre (spec 13C §12.5): quien responde por el punto
 * marca «Corregido»; quien realiza verificaciones lo valida o lo reabre.
 */
export function ListaHallazgos({ hallazgos, verificacionId }: { hallazgos: HallazgoDeVerificacion[]; verificacionId: number }) {
  const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: zonaHoraria() });
  if (hallazgos.length === 0) return null;
  return (
    <section aria-labelledby="titulo-hallazgos" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-hallazgos" className="mb-3 text-sm font-semibold">{`Hallazgos (${hallazgos.length})`}</h2>
      <ul className="flex list-none flex-col gap-4">
        {hallazgos.map((h) => (
          <li key={h.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-medium">{h.descripcion}</p>
              <InsigniaHallazgo estado={h.estado} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {`Responsable: ${h.responsable.nombre}`}
              {h.estado === "abierto" ? ` · Vence el ${fecha.format(h.venceEn)}` : ""}
              {h.retiradoEnElActo ? " · Retirado en el acto" : ""}
              {h.reaperturas > 0 ? ` · Se reabrió ${h.reaperturas} ${h.reaperturas === 1 ? "vez" : "veces"}` : ""}
            </p>
            <Fotos fotos={h.fotos} url={(f) => urlDeFoto(verificacionId, f.id, f.nombreOriginal)} etiqueta="Fotos del hallazgo" />
            {h.correccion ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                <span className="text-xs text-muted-foreground">{`Corregido por ${h.correccion.por} el ${fecha.format(h.correccion.en)}: `}</span>
                {h.correccion.nota}
              </p>
            ) : null}
            <Fotos
              fotos={h.fotosCorreccion}
              url={(f) => urlDeFotoDeHallazgo(h.id, f.id, f.nombreOriginal)}
              etiqueta="Fotos de la corrección"
            />
            {h.cierre ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                <span className="text-xs text-muted-foreground">
                  {`Cerrado por ${h.cierre.por} el ${fecha.format(h.cierre.en)}`}
                  <Validacion h={h} />
                  {": "}
                </span>
                {h.cierre.nota}
              </p>
            ) : null}
            <AccionesHallazgo hallazgo={h} verificacionId={verificacionId} />
          </li>
        ))}
      </ul>
    </section>
  );
}
