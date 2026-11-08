"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { cancelarTramiteAccion, corregirDatosTramiteAccion, reasignarTramiteAccion } from "@/app/acciones-tramites";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { DatosParaGestionar, DetalleTramite, UsuarioDesignable } from "@/db/consultas/tramites";
import type { Rol } from "@/lib/roles";
import {
  ETIQUETA_PAPEL,
  candidatosAprobador,
  candidatosRevisor,
  papelesReasignables,
  rolAprobador,
  type Papel,
} from "@/lib/tramites/separacion";
import { ETAPAS_CON_CORRECCION, type Autoridad } from "@/lib/tramites/tipos";
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
  | "procesoId"
  | "subprocesoId"
  | "solicitanteId"
  | "elaboradorId"
  | "revisorId"
  | "aprobadorId"
  | "elaborador"
  | "revisor"
  | "aprobador"
  | "requiereSocializacion"
>;

type AccionServidor = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

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

const nombreConCargo = (u: UsuarioDesignable) => (u.cargo ? `${u.nombre} — ${u.cargo}` : u.nombre);

/** Quienes pueden aprobar con esa autoridad y ese originador, sin quien ya aprueba. */
export function aprobadoresPara(
  t: Pick<TramiteParaGestionar, "aprobadorId">,
  d: Pick<DatosParaGestionar, "usuarios">,
  autoridad: Autoridad,
  originador: { id: number | null; rol: Rol },
): UsuarioDesignable[] {
  return candidatosAprobador(d.usuarios, rolAprobador(autoridad, originador.rol), originador.id).filter((u) => u.id !== t.aprobadorId);
}

/**
 * Quienes pueden entrar a ese papel, sin quien ya lo tiene. Las reglas se vuelven a comprobar en
 * el servidor. Quien aprueba puede pasar a elaborar si en el mismo envío entra otro aprobador.
 */
export function candidatosDe(papel: Papel, t: TramiteParaGestionar, d: DatosParaGestionar): UsuarioDesignable[] {
  if (papel === "elaborador") return d.usuarios.filter((u) => u.id !== t.elaboradorId && u.id !== t.revisorId);
  if (papel === "revisor") return candidatosRevisor(d.usuarios, t.elaboradorId).filter((u) => u.id !== t.revisorId);
  const originadorId = t.tipo === "eliminar" ? t.solicitanteId : t.elaboradorId;
  return aprobadoresPara(t, d, d.autoridad, { id: originadorId, rol: d.rolOriginador });
}

/** Proceso (`p:<id>`) o subproceso (`s:<id>`), como en la aceptación. */
export function opcionesDePropietario(procesos: DatosParaGestionar["procesos"]) {
  return procesos.flatMap((p) => [
    { marca: `p:${p.id}`, nombre: `${p.nombre} (${p.sigla})` },
    ...p.subprocesos.map((s) => ({ marca: `s:${s.id}`, nombre: `${p.nombre} › ${s.nombre}` })),
  ]);
}

function CampoAprobador({ candidatos }: { candidatos: UsuarioDesignable[] }) {
  return (
    <Campo
      etiqueta="Quien aprueba, si cambia"
      nombre="aprobadorId"
      ayuda="El rol que aprueba depende de quien elabora y del tipo de documento."
    >
      <select defaultValue="" className={anchoCompleto}>
        <option value="">Sin cambiar</option>
        {candidatos.map((u) => (
          <option key={u.id} value={u.id}>
            {nombreConCargo(u)}
          </option>
        ))}
      </select>
    </Campo>
  );
}

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
  const [persona, setPersona] = useState("");
  const actual = papel ? tramite[papel] : null;
  const elegida = datos.usuarios.find((u) => String(u.id) === persona);
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
            <select
              value={papel}
              onChange={(e) => {
                setPapel(e.target.value as Papel | "");
                setPersona("");
              }}
              className={anchoCompleto}
            >
              <option value="">Solo cambiar la fecha</option>
              {papeles.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PAPEL[p]}
                </option>
              ))}
            </select>
          </Campo>
          {papel ? (
            <Campo etiqueta="Persona" nombre="usuarioId" ayuda={actual ? `Hoy lo tiene ${actual}.` : undefined}>
              <select required value={persona} onChange={(e) => setPersona(e.target.value)} className={anchoCompleto}>
                <option value="">Elija a una persona</option>
                {candidatosDe(papel, tramite, datos).map((u) => (
                  <option key={u.id} value={u.id}>
                    {nombreConCargo(u)}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
          {papel === "elaborador" ? (
            <CampoAprobador
              candidatos={aprobadoresPara(tramite, datos, datos.autoridad, elegida ?? { id: tramite.elaboradorId, rol: datos.rolOriginador })}
            />
          ) : null}
        </>
      )}
      <Campo etiqueta="Fecha límite de la etapa" nombre="venceEn" ayuda="Vacía, conserva la que tiene. Vence al final de ese día.">
        <input type="date" required={!papel} min={hoy} className={anchoCompleto} />
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
  datos,
  cerrar,
}: {
  tramite: TramiteParaGestionar;
  datos: DatosParaGestionar;
  cerrar: () => void;
}) {
  const { estado, enviar, pendiente, alEnviar } = useEnvio(corregirDatosTramiteAccion, cerrar);
  const crea = tramite.tipo === "crear";
  const tipoActual = String(tramite.tipoDocumentoId ?? "");
  const [tipo, setTipo] = useState(tipoActual);
  const elegido = datos.tipos.find((t) => String(t.id) === tipo);
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
          <Campo etiqueta="Proceso o subproceso propietario" nombre="principal">
            <select
              required
              defaultValue={tramite.subprocesoId ? `s:${tramite.subprocesoId}` : `p:${tramite.procesoId}`}
              className={anchoCompleto}
            >
              {opcionesDePropietario(datos.procesos).map((o) => (
                <option key={o.marca} value={o.marca}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Código" nombre="codigo" ayuda="Debe llevar las siglas del proceso y del tipo, cumplir el formato configurado y no repetirse. Si corrige el proceso o el tipo, corrija también el código.">
            <input required maxLength={40} defaultValue={tramite.codigo ?? ""} className={`${anchoCompleto} font-mono`} />
          </Campo>
          <Campo etiqueta="Tipo de documento" nombre="tipoDocumentoId">
            <select required value={tipo} onChange={(e) => setTipo(e.target.value)} className={anchoCompleto}>
              {datos.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {elegido && tipo !== tipoActual ? (
            <CampoAprobador candidatos={aprobadoresPara(tramite, datos, elegido.autoridad, { id: tramite.elaboradorId, rol: datos.rolOriginador })} />
          ) : null}
        </>
      ) : null}
      <ErrorAccion estado={estado} />
      <PieDelDialogo cerrar={cerrar} pendiente={pendiente} confirmar="Guardar la corrección" />
    </form>
  );
}

/** La marca de socialización se corrige en toda etapa de trabajo, también desde la aprobación. */
function FormularioMarca({ tramite, cerrar }: { tramite: TramiteParaGestionar; cerrar: () => void }) {
  const { estado, enviar, pendiente, alEnviar } = useEnvio(corregirDatosTramiteAccion, cerrar);
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-4 p-5">
      <Ocultos tramite={tramite} />
      <p aria-hidden="true" className="font-semibold">
        Marca de socialización
      </p>
      <p className="text-sm text-muted-foreground">
        Si está marcada, al publicar el sistema pide registrar la jornada con quienes aplican el documento. Si ya se publicó, no tiene efecto.
      </p>
      <Campo etiqueta="¿Requiere socialización?" nombre="requiereSocializacion">
        <select defaultValue={tramite.requiereSocializacion ? "si" : "no"} className={anchoCompleto}>
          <option value="si">Sí, requiere socialización</option>
          <option value="no">No la requiere</option>
        </select>
      </Campo>
      <ErrorAccion estado={estado} />
      <PieDelDialogo cerrar={cerrar} pendiente={pendiente} confirmar="Guardar la marca" />
    </form>
  );
}

/** Dice qué pasa con la versión: según la solicitud, no hay ninguna o es la vigente. */
export function efectoDeCancelar(t: TramiteParaGestionar): string {
  if (t.tipo === "eliminar") return "La solicitud se cierra y el documento sigue vigente. Queda en el historial.";
  if (t.elaboradorId === null) return "La solicitud se cierra. Queda en el historial.";
  const consecuencia = t.tipo === "crear" ? "El código no se reutiliza." : "El documento vigente no cambia.";
  return `La solicitud se cierra y la versión en trámite se descarta; sus archivos se conservan. ${consecuencia}`;
}

/** Lo que hace quien gestiona con un trámite abierto, sea quien sea el responsable del paso. */
export function AccionesGestion({
  tramite,
  datos,
  hoy,
  puedeMarcar = false,
}: {
  tramite: TramiteParaGestionar;
  datos: DatosParaGestionar;
  hoy: string;
  /** `distribucion.gestionar`: quien además de gestionar el trámite puede cambiar la marca de socialización. */
  puedeMarcar?: boolean;
}) {
  return (
    <section aria-label="Gestión del trámite" className="flex flex-wrap items-start justify-end gap-2">
      {ETAPAS_CON_CORRECCION.includes(tramite.etapa) ? (
        <DialogoDeGestion etiqueta="Corregir datos del documento">
          {(cerrar) => <FormularioCorreccion tramite={tramite} datos={datos} cerrar={cerrar} />}
        </DialogoDeGestion>
      ) : null}
      {puedeMarcar && tramite.tipo !== "eliminar" ? (
        <DialogoDeGestion etiqueta="Marca de socialización">
          {(cerrar) => <FormularioMarca tramite={tramite} cerrar={cerrar} />}
        </DialogoDeGestion>
      ) : null}
      <DialogoDeGestion etiqueta="Reasignar">
        {(cerrar) => <FormularioReasignar tramite={tramite} datos={datos} hoy={hoy} cerrar={cerrar} />}
      </DialogoDeGestion>
      <AccionEnDialogo
        tramite={tramite}
        accion={cancelarTramiteAccion}
        etiqueta="Cancelar el trámite"
        texto={efectoDeCancelar(tramite)}
        confirmar="Cancelar el trámite"
        pideMotivo
      />
    </section>
  );
}
