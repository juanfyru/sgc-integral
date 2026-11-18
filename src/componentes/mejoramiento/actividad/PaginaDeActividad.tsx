import Link from "next/link";
import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DetalleDeActividad } from "@/db/consultas/mejoramiento/actividades";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { ETIQUETA_TIPO_ACCION } from "@/lib/mejoramiento/textos";
import { estaAbierta } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import type { AccionDelPaso } from "../pasos/Partes";
import { DialogoReasignar } from "./DialogoReasignar";
import { FormularioSeguimiento, TerminarActividad } from "./FormularioSeguimiento";
import { ListaDeSeguimientos } from "./ListaDeSeguimientos";
import { BarraDeAvance, EstadoDeLaActividad } from "./MisActividades";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CAJA = "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4";

/** Lo que le falta a la actividad para terminarse (spec §10.4), en frases que completan «Para terminar hace falta…». */
function loQueFalta(a: DetalleDeActividad): string[] {
  return [
    a.avance !== 100 ? "el avance en 100 %" : null,
    a.archivos.length === 0 ? "al menos un archivo de evidencia" : null,
  ].filter((x): x is string => x !== null);
}

/**
 * La actividad (spec 15 §16.2, maqueta 6), pensada para el teléfono: el estado y el fin, el responsable, el avance, de qué
 * acción y de qué hallazgo es («Ver el hallazgo»), la nota de una devolución, el formulario de seguimiento con su evidencia y
 * «Terminar» para su responsable, «Reasignar» para quien puede y los seguimientos. Lo que cada uno puede hacer lo dice la
 * lectura (`puedeSeguir`, `puedeReasignar`); el servidor lo vuelve a comprobar en cada acto.
 */
export function PaginaDeActividad({
  actividad: a,
  hoy,
  usuarios,
  subida,
  quitables,
  acciones,
}: {
  actividad: DetalleDeActividad;
  hoy: string;
  /** Los usuarios activos, para reasignar (vacío si quien mira no puede). */
  usuarios: ReadonlyArray<{ id: number; nombre: string }>;
  /** La dirección de la zona de carga de la evidencia, o nula si quien mira no sube. */
  subida: string | null;
  quitables: number[];
  acciones: { seguimiento: AccionDelPaso; terminar: AccionDelPaso; reasignar: AccionDelPaso };
}) {
  const zona = zonaHoraria();
  const ultimo = a.seguimientos[0] ?? null;
  const devuelta = a.verificacion === "devuelta";
  const conEvidencia = a.puedeSeguir || a.archivos.length > 0;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-label="Estado de la actividad" className={CAJA}>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <EstadoDeLaActividad estado={a.estado} vencida={a.vencida} devuelta={devuelta} fin={a.fin} hoy={hoy} />
            <span className="text-muted-foreground">{`Fin: ${fechaDeDia(a.fin)}`}</span>
            {a.finOriginal && a.finOriginal !== a.fin ? (
              <span className="text-muted-foreground">{`original: ${fechaDeDia(a.finOriginal)}`}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 break-words">
              <span className="text-muted-foreground">Responsable: </span>
              {a.responsable}
            </span>
            {/* Solo en una pendiente: una terminada o cancelada ya no necesita a su responsable (como en el plan). */}
            {!a.responsableActivo && estaAbierta(a.estado) ? <Insignia variante="atencion">Responsable inactivo</Insignia> : null}
            {a.puedeReasignar ? (
              <DialogoReasignar
                key={`reasignar-${a.id}-${a.responsableId}`}
                actividadId={a.id}
                etiqueta={a.etiqueta}
                responsableId={a.responsableId}
                responsable={a.responsable}
                usuarios={usuarios}
                accion={acciones.reasignar}
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <BarraDeAvance avance={a.avance} etiqueta={`Avance de la actividad ${a.etiqueta}`} />
            <p className="text-xs text-muted-foreground">
              {ultimo ? `último seguimiento: ${fechaDeDia(ultimo.fecha)}` : "sin seguimientos todavía"}
            </p>
          </div>
          {a.terminadaEn ? (
            <p className="text-sm">{`Terminada el ${fechaDeDia(fechaEnZona(a.terminadaEn, zona))}${a.terminadaPor ? ` por ${a.terminadaPor}` : ""}`}</p>
          ) : null}
        </section>

        {devuelta ? (
          <section
            aria-labelledby={`devuelta-${a.id}`}
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-estado-atencion bg-estado-atencion-fondo p-4 text-sm text-estado-atencion-texto"
          >
            <h2 id={`devuelta-${a.id}`} className="font-semibold">
              Devuelta en la verificación
            </h2>
            {a.verificacionNota ? <p className="whitespace-pre-line break-words">{a.verificacionNota}</p> : null}
            {a.corregirAntesDe ? <p>{`Corríjala antes del ${fechaDeDia(a.corregirAntesDe)}.`}</p> : null}
          </section>
        ) : null}

        <section aria-label="De qué acción y hallazgo es" className={CAJA}>
          <p className="text-xs font-medium text-muted-foreground">
            {`Acción ${a.accion.etiqueta} · ${ETIQUETA_TIPO_ACCION[a.accion.tipo] ?? a.accion.tipo}`}
          </p>
          <p className="break-words text-sm">{a.accion.descripcion}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span className="font-mono">{a.hallazgo.codigo}</span>
            <span aria-hidden="true">·</span>
            <span>{a.hallazgo.proceso}</span>
            <span aria-hidden="true">·</span>
            <Link href={rutaDeHallazgo(a.hallazgo.id)} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
              Ver el hallazgo
            </Link>
          </p>
        </section>

        {a.ajustePendiente ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            {`Hay un ajuste por decidir desde el ${fechaDeDia(fechaEnZona(a.ajustePendiente.pedidoEn, zona))}. Mientras se decide, la actividad sigue como está.`}
          </p>
        ) : null}

        {a.puedeSeguir ? (
          <section aria-labelledby={`seguimiento-${a.id}`} className={CAJA}>
            <h2 id={`seguimiento-${a.id}`} className="font-display text-base font-semibold">
              Registrar seguimiento
            </h2>
            <FormularioSeguimiento
              key={`seguimiento-${a.id}-${a.seguimientos.length}`}
              actividadId={a.id}
              hoy={hoy}
              avanceActual={a.avance}
              avanceMinimo={a.avanceMinimo}
              accion={acciones.seguimiento}
            />
          </section>
        ) : null}

        {conEvidencia ? (
          <section aria-labelledby={`evidencia-${a.id}`} className={CAJA}>
            <h2 id={`evidencia-${a.id}`} className="font-display text-base font-semibold">
              Evidencia
            </h2>
            <ArchivosDe
              archivos={a.archivos}
              quitables={quitables}
              direccionDeSubida={subida}
              nombre="Zona de carga de la evidencia de la actividad"
              vacio="Sin archivos de evidencia."
            />
          </section>
        ) : null}

        {a.puedeSeguir ? (
          <TerminarActividad key={`terminar-${a.id}-${a.avance}-${a.archivos.length}`} actividadId={a.id} faltan={loQueFalta(a)} accion={acciones.terminar} />
        ) : null}
      </div>

      <section aria-labelledby={`seguimientos-${a.id}`} className={`${CAJA} self-start`}>
        <h2 id={`seguimientos-${a.id}`} className="font-display text-base font-semibold">
          Seguimientos
        </h2>
        <ListaDeSeguimientos seguimientos={a.seguimientos} />
      </section>
    </div>
  );
}
