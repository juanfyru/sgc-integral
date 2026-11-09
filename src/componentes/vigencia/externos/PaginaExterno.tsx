import Link from "next/link";
import { Lock } from "lucide-react";
import { descartarEdicionAccion, retirarExternoAccion } from "@/app/acciones-vigencia";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { formatearTamano } from "@/componentes/documentos/IconoFormato";
import { claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia, InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import type { Externo, OpcionesDeExterno } from "@/db/consultas/vigencia/externos";
import { cuenta } from "@/lib/plural";
import { textoFecha } from "@/lib/vigencia/plazo";
import { textoVigenciaDeExterno } from "@/lib/vigencia/semaforo";
import { ETIQUETA_RESULTADO } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { Dato } from "../BloqueVigencia";
import { ChipVigencia } from "../ChipVigencia";
import { AccionConfirmada } from "./AccionConfirmada";
import { DialogoAdoptar } from "./DialogoAdoptar";
import { FormularioControl } from "./FormularioControl";
import { FormularioEdicion } from "./FormularioEdicion";
import { FormularioVerificacion } from "./FormularioVerificacion";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const SECCION = "flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs";
const RESUMEN = `cursor-pointer rounded text-sm font-medium ${FOCO}`;

const ETIQUETA_ROL: Record<string, string> = { principal: "Principal", editable: "Editable", anexo: "Anexo" };

type OpcionesControl = Pick<OpcionesDeExterno, "personas" | "normas">;

/** Los datos de control y la edición vigente, con «Editar» para quien gestiona el externo. */
function SeccionControl({ externo: e, opciones, zona }: { externo: Externo; opciones: OpcionesControl | null; zona: string }) {
  const c = e.control;
  return (
    <section aria-labelledby="externo-control" className={SECCION}>
      <h2 id="externo-control" className="text-sm font-semibold">
        Datos de control
      </h2>
      <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
        <Dato etiqueta="Entidad emisora">{c.entidadEmisora}</Dato>
        <Dato etiqueta="Título original">{c.tituloOriginal ?? "El mismo"}</Dato>
        <Dato etiqueta="Fuente oficial">
          {/* Texto, no un enlace (F13C-DC19): quien verifica la abre él mismo. */}
          <span className="break-all">{c.fuenteOficial ?? "Sin registrar"}</span>
        </Dato>
        <Dato etiqueta="Norma enlazada">{c.norma?.nombre ?? "Ninguna"}</Dato>
        <Dato etiqueta="Responsable técnico">{c.responsable.nombre}</Dato>
        <Dato etiqueta="Periodicidad de verificación">{`Cada ${cuenta(c.verificacionMeses, "mes", "meses")}`}</Dato>
        <Dato etiqueta="Edición vigente">
          {e.vigente
            ? `${e.vigente.edicion}${e.vigente.fechaEdicion ? ` · emitida el ${textoFecha(e.vigente.fechaEdicion, zona)}` : ""}`
            : "Sin edición adoptada"}
        </Dato>
        <Dato etiqueta="Adoptó">{e.vigente ? `${e.vigente.adoptoPor} el ${textoFecha(e.vigente.adoptadaEn, zona)}` : "Nadie todavía"}</Dato>
        <Dato etiqueta="Próxima verificación">{e.vigencia.proxima ? textoFecha(e.vigencia.proxima, zona) : "Sin fecha"}</Dato>
        <Dato etiqueta="Proceso propietario">{e.proceso.nombre}</Dato>
      </dl>
      {e.acciones.editar && opciones ? (
        <details className="rounded-md border border-border p-3">
          <summary className={RESUMEN}>Editar</summary>
          <div className="mt-3">
            <FormularioControl documentoId={e.documentoId} control={c} personas={opciones.personas} normas={opciones.normas} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** La edición en borrador: sus archivos y la zona de carga, «Qué cambió», «Adoptar esta edición» y «Descartar». */
function SeccionBorrador({ externo: e, pideCodigo, zona }: { externo: Externo; pideCodigo: boolean; zona: string }) {
  const b = e.borrador!;
  const exigeResumen = e.vigente !== null;
  return (
    <section aria-labelledby="externo-borrador" className={SECCION}>
      <h2 id="externo-borrador" className="text-sm font-semibold">
        {`Edición en borrador · ${b.edicion}`}
      </h2>
      <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
        <Dato etiqueta="Edición">{b.edicion}</Dato>
        <Dato etiqueta="Fecha de emisión">{b.fechaEdicion ? textoFecha(b.fechaEdicion, zona) : "Sin fecha"}</Dato>
        <div className="sm:col-span-2">
          <Dato etiqueta="Qué cambió">
            {b.resumenCambios ?? (exigeResumen ? "Sin escribir: hace falta para adoptarla." : "Sin escribir (opcional en la primera edición).")}
          </Dato>
        </div>
      </dl>

      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Archivos</h3>
        {b.archivos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin archivos todavía. Sin archivo principal la firma lleva la huella de los datos de la edición, y no se emiten copias
            controladas.
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-1.5 text-sm">
            {b.archivos.map((a) => (
              <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {/* Quien adopta abre lo que firma: la ficha de lectura no sirve un borrador (spec 13C §8.8). */}
                <a
                  href={`/vigencia/externos/${e.documentoId}/archivos/${a.id}/${encodeURIComponent(a.nombreOriginal)}`}
                  target="_blank"
                  rel="noopener"
                  className={`min-w-0 break-all rounded font-medium underline underline-offset-2 ${FOCO}`}
                >
                  {a.nombreOriginal}
                </a>
                <span className="text-xs text-muted-foreground">{`${ETIQUETA_ROL[a.rol] ?? a.rol} · ${formatearTamano(a.tamanoBytes)}`}</span>
                {e.acciones.adoptar ? (
                  <EliminarArchivo direccion={`/api/externos/${b.versionId}/archivos/${a.id}`} nombre={a.nombreOriginal} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {e.acciones.adoptar ? <ZonaCarga direccion={`/api/externos/${b.versionId}/archivos`} /> : null}
      </div>

      {e.acciones.adoptar ? (
        <>
          <details className="rounded-md border border-border p-3" open={exigeResumen && !b.resumenCambios}>
            <summary className={RESUMEN}>Corregir la edición y «qué cambió»</summary>
            <div className="mt-3">
              <FormularioEdicion
                modo="corregir"
                id={b.versionId}
                valores={{ edicion: b.edicion, fechaEdicion: b.fechaEdicion, resumenCambios: b.resumenCambios }}
                exigeResumen={exigeResumen}
              />
            </div>
          </details>
          <div className="flex flex-wrap items-start gap-2">
            <DialogoAdoptar
              documento={{ codigo: e.codigo, titulo: e.titulo }}
              borrador={{ versionId: b.versionId, numero: b.numero, edicion: b.edicion, huella: b.huella }}
              esPrimera={e.vigente === null}
              pideCodigo={pideCodigo}
            />
            <AccionConfirmada
              accion={descartarEdicionAccion}
              etiqueta="Descartar"
              confirmacion="La edición en borrador pasa a descartada: conserva sus archivos, deja libre su número y queda en la bitácora."
              campos={{ id: b.versionId }}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

/** «Adoptar edición nueva»: abre la edición siguiente en borrador (la primera, si se descartó la del alta). */
function SeccionAbrirEdicion({ externo: e, zona }: { externo: Externo; zona: string }) {
  const pendiente = e.control.edicionNuevaPendienteDesde;
  return (
    <details className={SECCION} open={pendiente !== null}>
      <summary className={RESUMEN}>{e.vigente ? "Adoptar edición nueva" : "Preparar la edición"}</summary>
      {pendiente ? (
        <p className="text-sm text-muted-foreground">
          {`La verificación del ${textoFecha(pendiente, zona)} constató una edición nueva: prepárela aquí y adóptela con su firma.`}
        </p>
      ) : null}
      <FormularioEdicion modo="abrir" id={e.documentoId} valores={{ edicion: "", fechaEdicion: null, resumenCambios: null }} exigeResumen={e.vigente !== null} />
    </details>
  );
}

/** El historial: las ediciones adoptadas y las verificaciones, inmutables. */
function Historial({ externo: e, zona }: { externo: Externo; zona: string }) {
  return (
    <section aria-labelledby="externo-historial" className={SECCION}>
      <h2 id="externo-historial" className="text-sm font-semibold">
        Historial
      </h2>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Ediciones</h3>
        {e.ediciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no se ha adoptado ninguna edición.</p>
        ) : (
          <ul className="flex list-none flex-col gap-1.5 text-sm">
            {e.ediciones.map((ed) => (
              <li key={ed.numero} className="flex flex-wrap items-center gap-2">
                <span>{`Versión ${ed.numero} · edición ${ed.edicion}`}</span>
                <InsigniaEstadoDocumento estado={ed.estado} />
                {ed.adoptadaEn ? <span className="text-xs text-muted-foreground">{`adoptada el ${textoFecha(ed.adoptadaEn, zona)}`}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Verificaciones</h3>
        {e.verificaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin verificaciones registradas.</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 text-sm">
            {e.verificaciones.map((v) => (
              <li key={v.id} className="min-w-0 border-t border-linea-suave pt-2 first:border-t-0 first:pt-0">
                <div>{`${textoFecha(v.creadoEn, zona)} · ${ETIQUETA_RESULTADO[v.resultado]} · ${v.nombre}`}</div>
                <div className="break-all text-xs text-muted-foreground">{`Versión ${v.version} · fuente: ${v.fuente}`}</div>
                {v.nota ? <div className="break-words text-xs text-muted-foreground">{v.nota}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * La página de control de un externo (spec 13C §8.8): sus datos de control, la edición en borrador o «Adoptar edición
 * nueva», la verificación, el retiro y el historial. Cada acción sale según lo que la persona puede hacer. Una sola
 * columna en todos los anchos: el orden del documento es el visual, y no queda una columna vacía.
 */
export function PaginaExterno({
  externo: e,
  opciones,
  pideCodigo,
  impacto = null,
}: {
  externo: Externo;
  /** Las personas y las normas que ofrece «Editar»; null si la persona no edita. */
  opciones: OpcionesControl | null;
  pideCodigo: boolean;
  /** El impacto normativo pendiente que la verificación resolverá (`?impacto=`), si es de este externo. */
  impacto?: { id: number; norma: string; proceso: string } | null;
}) {
  const zona = zonaHoraria();
  const pendiente = e.control.edicionNuevaPendienteDesde;
  const texto = textoVigenciaDeExterno({
    adoptado: e.vigente !== null,
    vigencia: e.vigencia,
    impacto: e.impacto,
    edicionPendiente: pendiente ? { desde: pendiente } : null,
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        codigo={e.codigo}
        titulo={e.titulo}
        migas={[{ nombre: "Vigencia", href: "/vigencia" }, { nombre: "Externos", href: "/vigencia/externos" }, { nombre: e.codigo }]}
        insignias={
          <>
            <Insignia variante="neutra">Documento externo</Insignia>
            {e.retirado ? <Insignia variante="critico">Retirado</Insignia> : <ChipVigencia vigencia={{ estado: e.vigencia.estado, texto }} />}
            {e.nivelAcceso === "restringido" ? (
              <Insignia variante="atencion" icono={Lock}>
                Acceso restringido
              </Insignia>
            ) : null}
          </>
        }
        descripcion={`${e.control.entidadEmisora} · ${e.proceso.nombre}`}
        acciones={
          e.vigente ? (
            <Link href={`/documentos/${encodeURIComponent(e.codigo.toLowerCase())}`} className={`${claseBoton("secundario")} ${FOCO}`}>
              Ver la ficha del documento
            </Link>
          ) : undefined
        }
      />

      {e.retirado ? (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          Este documento externo fue retirado: dejó de aplicar. Si vuelve a aplicar, se registra como un documento nuevo.
        </p>
      ) : null}

      {/* Una sola columna, en el orden en que se lee y se recorre con el teclado: la verificación (lo que hace el
          responsable técnico, también en el celular), los datos, la edición, el historial y el retiro. */}
      <div className="flex min-w-0 max-w-4xl flex-col gap-6">
        {e.acciones.verificar ? (
          <section aria-labelledby="externo-verificar" className={SECCION}>
            <h2 id="externo-verificar" className="text-sm font-semibold">
              {`Verificar la vigencia de ${e.codigo}`}
            </h2>
            {e.vigente ? (
              <p className="text-sm text-muted-foreground">
                {`${e.control.entidadEmisora} · edición ${e.vigente.edicion}, adoptada el ${textoFecha(e.vigente.adoptadaEn, zona)}.`}
              </p>
            ) : null}
            <FormularioVerificacion
              documentoId={e.documentoId}
              fuenteOficial={e.control.fuenteOficial}
              verificacionMeses={e.control.verificacionMeses}
              impacto={impacto}
            />
          </section>
        ) : null}

        <SeccionControl externo={e} opciones={opciones} zona={zona} />
        {e.borrador ? <SeccionBorrador externo={e} pideCodigo={pideCodigo} zona={zona} /> : null}
        {e.acciones.abrirEdicion ? <SeccionAbrirEdicion externo={e} zona={zona} /> : null}
        <Historial externo={e} zona={zona} />
        {e.acciones.retirar ? (
          <section aria-labelledby="externo-retirar" className={SECCION}>
            <h2 id="externo-retirar" className="text-sm font-semibold">
              Retiro
            </h2>
            <AccionConfirmada
              accion={retirarExternoAccion}
              etiqueta="Retirar"
              confirmacion="El documento deja de aplicar: su edición vigente se anula, sus copias controladas quedan por recoger y se avisa a quienes lo aplican. No vuelve: si aplica de nuevo, se registra como documento nuevo."
              campos={{ documentoId: e.documentoId }}
            >
              <Campo etiqueta="Motivo" nombre="motivo" ayuda="Entre 5 y 500 caracteres. Queda en la bitácora.">
                <textarea required minLength={5} maxLength={500} rows={2} className={`${claseControl} w-full min-w-0 max-w-full`} />
              </Campo>
            </AccionConfirmada>
          </section>
        ) : null}
      </div>
    </div>
  );
}
