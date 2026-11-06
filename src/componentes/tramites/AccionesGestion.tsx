"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { cancelarTramiteAccion, corregirDatosTramiteAccion, reasignarTramiteAccion } from "@/app/acciones-tramites";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { DatosParaGestionar, DetalleTramite, UsuarioDesignable } from "@/db/consultas/tramites";
import {
  ETIQUETA_PAPEL,
  candidatosAprobador,
  candidatosRevisor,
  papelesReasignables,
  rolAprobador,
  type Papel,
} from "@/lib/tramites/separacion";
import type { Etapa } from "@/lib/tramites/tipos";
import { AccionEnDialogo, ErrorAccion, Ocultos } from "./AccionesSolicitud";
import { anchoCompleto } from "./PiezasAceptacion";

export type TramiteParaGestionar = Pick<
  DetalleTramite,
  | "id"
  | "etapa"
  | "ronda"
  | "tipo"
  | "codigo"
  | "titulo"
  | "tipoDocumentoId"
  | "solicitanteId"
  | "elaboradorId"
  | "revisorId"
  | "aprobadorId"
  | "elaborador"
  | "revisor"
  | "aprobador"
>;

type AccionServidor = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

const ETAPAS_CON_CORRECCION: readonly Etapa[] = ["elaboracion", "revision"];

/** Sin un rechazo del servidor, el diálogo se cierra. Enviar desde una transición conserva lo escrito si rechaza. */
function useEnvio(accion: AccionServidor, cerrar: () => void) {
  const [estado, enviar, pendiente] = useActionState(async (previo: EstadoAccion, datos: FormData) => {
    const resultado = await accion(previo, datos);
    if (!resultado) cerrar();
    return resultado;
  }, null);
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
  return { estado, enviar, pendiente, alEnviar };
}

/** El formulario vive solo mientras el diálogo está abierto: al reabrirlo no trae lo de la vez anterior. */
function DialogoDeGestion({ etiqueta, children }: { etiqueta: string; children: (cerrar: () => void) => React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={cerrar}
        titulo={etiqueta}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? children(cerrar) : null}
      </Dialogo>
    </>
  );
}

function PieDelDialogo({ cerrar, pendiente, confirmar }: { cerrar: () => void; pendiente: boolean; confirmar: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Boton variante="secundario" onClick={cerrar}>
        Volver
      </Boton>
      <Boton type="submit" pendiente={pendiente}>
        {pendiente ? "Guardando…" : confirmar}
      </Boton>
    </div>
  );
}

/** Quienes pueden entrar a ese papel, sin quien ya lo tiene. Las reglas se vuelven a comprobar en el servidor. */
export function candidatosDe(papel: Papel, t: TramiteParaGestionar, d: DatosParaGestionar): UsuarioDesignable[] {
  if (papel === "elaborador") return d.usuarios.filter((u) => ![t.elaboradorId, t.revisorId, t.aprobadorId].includes(u.id));
  if (papel === "revisor") return candidatosRevisor(d.usuarios, t.elaboradorId).filter((u) => u.id !== t.revisorId);
  const originadorId = t.tipo === "eliminar" ? t.solicitanteId : t.elaboradorId;
  return candidatosAprobador(d.usuarios, rolAprobador(d.autoridad, d.rolOriginador), originadorId).filter((u) => u.id !== t.aprobadorId);
}

const NOMBRE_ACTUAL = { elaborador: "elaborador", revisor: "revisor", aprobador: "aprobador" } as const;

function FormularioReasignar({
  tramite,
  datos,
  hoy,
  cerrar,
}: {
  tramite: TramiteParaGestionar;
  datos: DatosParaGestionar;
  hoy: string;
  cerrar: () => void;
}) {
  const { estado, enviar, pendiente, alEnviar } = useEnvio(reasignarTramiteAccion, cerrar);
  const papeles = papelesReasignables(tramite.etapa);
  const [papel, setPapel] = useState<Papel | "">("");
  const actual = papel ? tramite[NOMBRE_ACTUAL[papel]] : null;
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-4 p-5">
      <Ocultos tramite={tramite} />
      <p aria-hidden="true" className="font-semibold">
        Reasignar
      </p>
      {papeles.length === 0 ? (
        <p className="text-sm text-muted-foreground">En esta etapa no hay a quién reasignar: solo se cambia la fecha límite.</p>
      ) : (
        <>
          <Campo etiqueta="Papel" nombre="papel" ayuda="Solo los pasos que siguen pendientes.">
            <select value={papel} onChange={(e) => setPapel(e.target.value as Papel | "")} className={anchoCompleto}>
              <option value="">Sin cambiar a nadie</option>
              {papeles.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PAPEL[p]}
                </option>
              ))}
            </select>
          </Campo>
          {papel ? (
            <Campo etiqueta="Persona" nombre="usuarioId" ayuda={actual ? `Hoy lo tiene ${actual}.` : undefined}>
              <select key={papel} defaultValue="" className={anchoCompleto}>
                <option value="">Elija a una persona</option>
                {candidatosDe(papel, tramite, datos).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.cargo ? `${u.nombre} — ${u.cargo}` : u.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
        </>
      )}
      <Campo etiqueta="Fecha límite de la etapa" nombre="venceEn" ayuda="Vacía, conserva la que tiene. Vence al final de ese día.">
        <input type="date" min={hoy} className={anchoCompleto} />
      </Campo>
      <Campo etiqueta="Motivo" nombre="motivo" ayuda="Entre 5 y 1000 caracteres. Queda en el historial.">
        <textarea required minLength={5} maxLength={1000} rows={3} className={anchoCompleto} />
      </Campo>
      <ErrorAccion estado={estado} />
      <PieDelDialogo cerrar={cerrar} pendiente={pendiente} confirmar="Reasignar" />
    </form>
  );
}

function FormularioCorreccion({
  tramite,
  tipos,
  cerrar,
}: {
  tramite: TramiteParaGestionar;
  tipos: DatosParaGestionar["tipos"];
  cerrar: () => void;
}) {
  const { estado, enviar, pendiente, alEnviar } = useEnvio(corregirDatosTramiteAccion, cerrar);
  const crea = tramite.tipo === "crear";
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-4 p-5">
      <Ocultos tramite={tramite} />
      <p aria-hidden="true" className="font-semibold">
        Corregir datos del documento
      </p>
      <p className="text-sm text-muted-foreground">
        {crea
          ? "Nadie ve todavía este documento. Desde la aprobación estos datos quedan fijos."
          : "En una modificación solo cambia el título, y se aplica al publicar. Hasta entonces el documento conserva el suyo."}
      </p>
      <Campo etiqueta="Título" nombre="titulo">
        <input required minLength={3} maxLength={200} defaultValue={tramite.titulo} className={anchoCompleto} />
      </Campo>
      {crea ? (
        <>
          <Campo etiqueta="Código" nombre="codigo" ayuda="Debe cumplir el formato configurado y no repetirse. Si cambia el tipo, revíselo.">
            <input required maxLength={40} defaultValue={tramite.codigo ?? ""} className={`${anchoCompleto} font-mono`} />
          </Campo>
          <Campo etiqueta="Tipo de documento" nombre="tipoDocumentoId">
            <select required defaultValue={tramite.tipoDocumentoId ?? ""} className={anchoCompleto}>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </>
      ) : null}
      <ErrorAccion estado={estado} />
      <PieDelDialogo cerrar={cerrar} pendiente={pendiente} confirmar="Guardar la corrección" />
    </form>
  );
}

/** Lo que hace quien gestiona con un trámite abierto, sea quien sea el responsable del paso. */
export function AccionesGestion({
  tramite,
  datos,
  hoy,
}: {
  tramite: TramiteParaGestionar;
  datos: DatosParaGestionar;
  hoy: string;
}) {
  const textoCancelar =
    tramite.tipo === "eliminar"
      ? "La solicitud se cierra y el documento sigue vigente. Queda en el historial."
      : "La solicitud se cierra. La versión en trámite se descarta; sus archivos se conservan y el documento vigente no cambia.";
  return (
    <section aria-label="Gestión del trámite" className="flex flex-wrap items-start justify-end gap-2">
      {ETAPAS_CON_CORRECCION.includes(tramite.etapa) ? (
        <DialogoDeGestion etiqueta="Corregir datos del documento">
          {(cerrar) => <FormularioCorreccion tramite={tramite} tipos={datos.tipos} cerrar={cerrar} />}
        </DialogoDeGestion>
      ) : null}
      <DialogoDeGestion etiqueta="Reasignar">
        {(cerrar) => <FormularioReasignar tramite={tramite} datos={datos} hoy={hoy} cerrar={cerrar} />}
      </DialogoDeGestion>
      <AccionEnDialogo
        tramite={tramite}
        accion={cancelarTramiteAccion}
        etiqueta="Cancelar el trámite"
        texto={textoCancelar}
        confirmar="Cancelar el trámite"
        pideMotivo
      />
    </section>
  );
}
