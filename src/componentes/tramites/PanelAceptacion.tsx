"use client";

import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { aceptarSolicitudAccion, rechazarSolicitudAccion } from "@/app/acciones-tramites";
import { Boton } from "@/componentes/ui/Boton";
import { Campo } from "@/componentes/ui/Campo";
import type { ContextoAceptacion, DatosParaAceptar, UsuarioDesignable } from "@/db/consultas/tramites";
import { ETIQUETA_ROL, type Rol } from "@/lib/roles";
import { candidatosAprobador, candidatosRevisor, rolAprobador } from "@/lib/tramites/separacion";
import type { Autoridad } from "@/lib/tramites/tipos";
import { AccionEnDialogo, ErrorAccion, Ocultos } from "./AccionesSolicitud";
import { BloqueDuplicidad, type Decision } from "./BloqueDuplicidad";
import { ClasificacionNueva } from "./ClasificacionNueva";
import { DocumentoExistente } from "./DocumentoExistente";
import { Bloque, anchoCompleto, type TramiteParaAceptar } from "./PiezasAceptacion";

export type { TramiteParaAceptar } from "./PiezasAceptacion";

type Props = {
  tramite: TramiteParaAceptar;
  datos: DatosParaAceptar;
  contexto: ContextoAceptacion;
  /** Quien acepta: por defecto, también revisa. */
  usuarioId: number;
  plazos: { revision: number; aprobacion: number };
  hoy: string;
  venceSugerida: string;
};

function SelectorDeUsuario({
  etiqueta,
  nombre,
  ayuda,
  error,
  usuarios,
  valor,
  alCambiar,
}: {
  etiqueta: string;
  nombre: string;
  ayuda?: string;
  error?: string;
  usuarios: UsuarioDesignable[];
  valor: string;
  alCambiar: (id: string) => void;
}) {
  return (
    <Campo etiqueta={etiqueta} nombre={nombre} ayuda={ayuda} error={error}>
      <select required value={valor} onChange={(e) => alCambiar(e.target.value)} className={anchoCompleto}>
        <option value="">Elija a una persona</option>
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.cargo ? `${u.nombre} — ${u.cargo}` : u.nombre}
          </option>
        ))}
      </select>
    </Campo>
  );
}

function razonDelAprobador(autoridad: Autoridad, tipo: string | null, rolOriginador: Rol | null, elimina: boolean): string {
  if (rolOriginador === "admin_sgc") {
    return `${elimina ? "La pide" : "Elabora"} un ${ETIQUETA_ROL.admin_sgc}: aprueba ${ETIQUETA_ROL.gerencia}.`;
  }
  const clase = tipo ?? "Este";
  return autoridad === "estrategico"
    ? `${clase} es un tipo estratégico: aprueba ${ETIQUETA_ROL.gerencia}.`
    : `${clase} es un tipo operativo: aprueba el ${ETIQUETA_ROL.admin_sgc}.`;
}

function faltaAprobador(rol: "gerencia" | "admin_sgc", usuarios: UsuarioDesignable[], elimina: boolean): string {
  const etiqueta = ETIQUETA_ROL[rol];
  return usuarios.some((u) => u.rol === rol)
    ? `No hay otro usuario activo con el rol ${etiqueta}: ${elimina ? "quien la pide" : "quien elabora"} no puede aprobar`
    : `No hay ningún usuario activo con el rol ${etiqueta}`;
}

export function PanelAceptacion({ tramite, datos, contexto, usuarioId, plazos, hoy, venceSugerida }: Props) {
  const [estado, enviar, pendiente] = useActionState(aceptarSolicitudAccion, null);
  const idFormulario = useId();
  const { catalogo, documento, solicitanteRol } = contexto;
  const elimina = tramite.tipo === "eliminar";

  const [decision, setDecision] = useState<Decision>("nuevo");
  const [documentoId, setDocumentoId] = useState("");
  const [tipoId, setTipoId] = useState(tramite.tipoDocumentoId === null ? "" : String(tramite.tipoDocumentoId));
  const [elaboradorId, setElaboradorId] = useState(
    datos.usuarios.some((u) => u.id === tramite.solicitanteId) ? String(tramite.solicitanteId) : "",
  );
  const [revisorId, setRevisorId] = useState(String(usuarioId));
  const [aprobadorId, setAprobadorId] = useState("");

  const convierte = catalogo !== null && decision === "modificacion";
  const existente = convierte ? (catalogo.documentos.find((d) => String(d.id) === documentoId) ?? null) : null;
  const tipoElegido = catalogo?.tipos.find((t) => String(t.id) === tipoId) ?? null;
  const tipoDelExistente = catalogo?.tipos.find((t) => t.id === existente?.tipoId) ?? null;

  const autoridad = existente?.autoridad ?? tipoElegido?.autoridad ?? datos.autoridad;
  const plantilla = !catalogo ? datos.plantilla : existente ? (tipoDelExistente?.plantilla ?? null) : (tipoElegido?.plantilla ?? null);
  const nombreTipo = existente?.tipo ?? documento?.tipo ?? tipoElegido?.nombre ?? null;

  const elaborador = datos.usuarios.find((u) => String(u.id) === elaboradorId) ?? null;
  const originador = elimina ? { id: tramite.solicitanteId, rol: solicitanteRol } : elaborador;
  const rolQueAprueba = rolAprobador(autoridad, originador?.rol ?? "consulta");
  const aprobadores = candidatosAprobador(datos.usuarios, rolQueAprueba, originador?.id ?? null);
  const revisores = candidatosRevisor(datos.usuarios, elaborador?.id ?? null);

  // Lo elegido deja de valer si cambia quién elabora o el tipo; un candidato único viene elegido.
  const aprobador = aprobadores.some((u) => String(u.id) === aprobadorId)
    ? aprobadorId
    : aprobadores.length === 1
      ? String(aprobadores[0].id)
      : "";
  const revisor = revisores.some((u) => String(u.id) === revisorId) ? revisorId : "";

  const sinRevisor = !elimina && revisores.length === 0;
  const sinAprobador = aprobadores.length === 0;

  // Como en FormularioSolicitud: enviar desde una transición no reinicia el formulario tras un
  // rechazo del servidor, y `action` queda para cuando aún no hay JavaScript.
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datosFormulario = new FormData(evento.currentTarget);
    startTransition(() => enviar(datosFormulario));
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        id={idFormulario}
        action={enviar}
        onSubmit={alEnviar}
        className={`grid grid-cols-1 items-start gap-6 lg:grid-cols-2 ${catalogo ? "lg:grid-rows-[auto_1fr]" : ""}`}
      >
        <Ocultos tramite={tramite} />
        {catalogo ? (
          <BloqueDuplicidad
            parecidos={datos.parecidos}
            documentos={catalogo.documentos}
            procesoId={tramite.procesoId}
            decision={decision}
            alDecidir={setDecision}
            documentoId={documentoId}
            alElegirDocumento={setDocumentoId}
          />
        ) : null}

        {!elimina ? (
          <Bloque id="titulo-clasificacion" titulo="Clasificación y código" className={catalogo ? "lg:row-span-2" : undefined}>
            {catalogo ? (
              // Deshabilitado no se envía ni se valida, y lo escrito sigue ahí si la decisión cambia.
              <fieldset disabled={convierte} className={convierte ? "hidden" : "min-w-0"}>
                <ClasificacionNueva
                  tramite={tramite}
                  catalogo={catalogo}
                  codigoSugerido={datos.codigoSugerido}
                  tipoId={tipoId}
                  plantilla={plantilla}
                  alElegirTipo={setTipoId}
                />
              </fieldset>
            ) : null}
            {existente ? (
              <DocumentoExistente
                codigo={existente.codigo}
                tipo={existente.tipo}
                proceso={existente.proceso}
                version={existente.versionSiguiente}
                plantilla={plantilla}
              />
            ) : convierte ? (
              <p className="text-sm text-muted-foreground">Elija el documento que ya existe para ver sus datos.</p>
            ) : null}
            {documento ? (
              <DocumentoExistente
                codigo={tramite.codigo ?? ""}
                tipo={documento.tipo}
                proceso={tramite.procesoNombre}
                version={documento.versionSiguiente}
                plantilla={plantilla}
                tituloEditable={tramite.titulo}
              />
            ) : null}
          </Bloque>
        ) : null}

        <Bloque id="titulo-responsables" titulo={elimina ? "Quién aprueba" : "Responsables y fechas"}>
          <div className="flex flex-col gap-4">
            {!elimina ? (
              <>
                <SelectorDeUsuario
                  etiqueta="Elabora"
                  nombre="elaboradorId"
                  usuarios={datos.usuarios}
                  valor={elaboradorId}
                  alCambiar={setElaboradorId}
                />
                <Campo etiqueta="Fecha límite de elaboración" nombre="venceElaboracion">
                  <input type="date" required min={hoy} defaultValue={venceSugerida} className={anchoCompleto} />
                </Campo>
                <SelectorDeUsuario
                  etiqueta="Revisa"
                  nombre="revisorId"
                  ayuda={`Quien elabora no puede revisar. Plazo: ${plazos.revision} días.`}
                  error={sinRevisor ? "No hay ningún usuario activo que pueda revisar" : undefined}
                  usuarios={revisores}
                  valor={revisor}
                  alCambiar={setRevisorId}
                />
              </>
            ) : null}
            <SelectorDeUsuario
              etiqueta="Aprueba"
              nombre="aprobadorId"
              ayuda={`${razonDelAprobador(autoridad, nombreTipo, originador?.rol ?? null, elimina)} Plazo: ${plazos.aprobacion} días.`}
              error={sinAprobador ? faltaAprobador(rolQueAprueba, datos.usuarios, elimina) : undefined}
              usuarios={aprobadores}
              valor={aprobador}
              alCambiar={setAprobadorId}
            />
          </div>
        </Bloque>
      </form>

      <div className="flex flex-col items-end gap-2">
        <ErrorAccion estado={estado} />
        <div className="flex flex-wrap justify-end gap-2">
          <AccionEnDialogo
            tramite={tramite}
            accion={rechazarSolicitudAccion}
            etiqueta="Rechazar con motivo"
            texto="La solicitud se cierra como rechazada y se avisa a quien la pidió."
            confirmar="Rechazar"
            pideMotivo
          />
          <Boton type="submit" form={idFormulario} pendiente={pendiente} disabled={sinRevisor || sinAprobador}>
            {pendiente ? "Procesando…" : elimina ? "Aceptar y pasar a aprobación" : "Aceptar y abrir el trámite"}
          </Boton>
        </div>
      </div>
    </div>
  );
}
