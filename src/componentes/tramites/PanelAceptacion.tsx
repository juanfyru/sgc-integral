"use client";

import Link from "next/link";
import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { aceptarSolicitudAccion, rechazarSolicitudAccion } from "@/app/acciones-tramites";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type {
  CatalogoClasificacion,
  ContextoAceptacion,
  DatosParaAceptar,
  DetalleTramite,
  DocumentoDeCatalogo,
  TipoDeDocumento,
  UsuarioDesignable,
} from "@/db/consultas/tramites";
import { ETIQUETA_ROL, type Rol } from "@/lib/roles";
import { codigoSiguiente } from "@/lib/tramites/codigo";
import { candidatosAprobador, candidatosRevisor, rolAprobador } from "@/lib/tramites/separacion";
import type { Autoridad } from "@/lib/tramites/tipos";
import { AccionEnDialogo, ErrorAccion, Ocultos } from "./AccionesSolicitud";

export type TramiteParaAceptar = Pick<
  DetalleTramite,
  | "id"
  | "etapa"
  | "ronda"
  | "tipo"
  | "solicitanteId"
  | "procesoId"
  | "subprocesoId"
  | "tipoDocumentoId"
  | "tituloPropuesto"
  | "codigo"
  | "titulo"
  | "procesoNombre"
>;

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

type Plantilla = DatosParaAceptar["plantilla"];
type Decision = "nuevo" | "modificacion";

const anchoCompleto = `${claseControl} w-full`;

function Bloque({
  id,
  titulo,
  className,
  children,
}: {
  id: string;
  titulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl border border-border bg-card p-4 shadow-xs ${className ?? ""}`}>
      <h2 id={id} className="mb-3 text-sm font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

/** Se abre en otra pestaña: quien acepta no debe perder lo que lleva escrito. */
function EnlaceDocumento({ codigo, children }: { codigo: string; children?: React.ReactNode }) {
  return (
    <Link href={`/documentos/${codigo.toLowerCase()}`} target="_blank" className="font-mono text-xs underline underline-offset-2">
      {children ?? codigo}
      <span className="sr-only"> (abre en otra pestaña)</span>
    </Link>
  );
}

function BloqueDuplicidad({
  parecidos,
  documentos,
  procesoId,
  decision,
  alDecidir,
  documentoId,
  alElegirDocumento,
}: {
  parecidos: DatosParaAceptar["parecidos"];
  documentos: DocumentoDeCatalogo[];
  procesoId: number;
  decision: Decision;
  alDecidir: (decision: Decision) => void;
  documentoId: string;
  alElegirDocumento: (id: string) => void;
}) {
  return (
    <Bloque id="titulo-duplicidad" titulo="¿Ya existe un documento parecido?">
      {parecidos.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">No hay documentos vigentes con un título parecido.</p>
      ) : (
        <ul className="mb-3 flex list-none flex-col gap-2">
          {parecidos.map((p) => (
            <li key={p.documentoId} className="flex flex-wrap items-start justify-between gap-2 text-sm">
              <span className="min-w-0">
                <EnlaceDocumento codigo={p.codigo} /> {p.titulo}
                <span className="block text-xs text-muted-foreground">
                  {`Vigente, versión ${p.version}${p.procesoId === procesoId ? "" : " · de otro proceso"}`}
                </span>
              </span>
              <Insignia variante={p.nivel === "muy_parecido" ? "atencion" : "neutra"}>
                {p.nivel === "muy_parecido" ? "Muy parecido" : "Parecido"}
              </Insignia>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Qué decide sobre la duplicidad</legend>
        <label className="inline-flex items-start gap-2 text-sm">
          <input type="radio" name="decision" value="nuevo" checked={decision === "nuevo"} onChange={() => alDecidir("nuevo")} />
          No es un duplicado: es un documento nuevo
        </label>
        <label className="inline-flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="decision"
            value="modificacion"
            checked={decision === "modificacion"}
            onChange={() => alDecidir("modificacion")}
          />
          Es una modificación de un documento que ya existe
        </label>
      </fieldset>
      {decision === "modificacion" ? (
        <div className="mt-3">
          <Campo
            etiqueta="Documento que ya existe"
            nombre="documentoExistenteId"
            ayuda="Solo vigentes de este proceso. Si el parecido es de otro proceso, rechace la solicitud con su código."
          >
            <select required value={documentoId} onChange={(e) => alElegirDocumento(e.target.value)} className={anchoCompleto}>
              <option value="">Elija el documento</option>
              {documentos
                .filter((d) => d.procesoId === procesoId)
                .map((d) => (
                  <option key={d.id} value={d.id} disabled={d.conTramite || d.conBorrador}>
                    {`${d.codigo} — ${d.titulo}${d.conTramite ? " (trámite abierto)" : d.conBorrador ? " (borrador de carga pendiente)" : ""}`}
                  </option>
                ))}
            </select>
          </Campo>
        </div>
      ) : null}
    </Bloque>
  );
}

/** Lista desplegable de casillas: son muchas y casi nunca hace falta tocarlas. */
function ListaDeCasillas({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">{titulo}</summary>
      <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">{children}</div>
    </details>
  );
}

function ClasificacionNueva({
  tramite,
  catalogo,
  codigoSugerido,
  tipoId,
  tipo,
  plantilla,
  alElegirTipo,
}: {
  tramite: TramiteParaAceptar;
  catalogo: CatalogoClasificacion;
  codigoSugerido: string | null;
  tipoId: string;
  tipo: TipoDeDocumento | null;
  plantilla: Plantilla;
  alElegirTipo: (id: string) => void;
}) {
  const opciones = catalogo.procesos.flatMap((p) => [
    { marca: `p:${p.id}`, nombre: `${p.nombre} (${p.sigla})`, sigla: p.sigla },
    ...p.subprocesos.map((s) => ({ marca: `s:${s.id}`, nombre: `${p.nombre} › ${s.nombre}`, sigla: p.sigla })),
  ]);
  const [principal, setPrincipal] = useState(tramite.subprocesoId ? `s:${tramite.subprocesoId}` : `p:${tramite.procesoId}`);
  const [codigo, setCodigo] = useState(codigoSugerido ?? "");
  const [codigoEditado, setCodigoEditado] = useState(false);

  // El código corregido a mano no se toca; el propuesto sigue al proceso y al tipo elegidos.
  const proponer = (marca: string, idTipo: string) => {
    if (codigoEditado) return;
    const proceso = opciones.find((o) => o.marca === marca)?.sigla;
    const siglaTipo = catalogo.tipos.find((t) => String(t.id) === idTipo)?.sigla;
    setCodigo(proceso && siglaTipo ? (codigoSiguiente(catalogo.formatoCodigo, catalogo.codigos, { proceso, tipo: siglaTipo }) ?? "") : "");
  };
  const siglaProceso = opciones.find((o) => o.marca === principal)?.sigla;

  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Título" nombre="titulo">
        <input required minLength={3} maxLength={200} defaultValue={tramite.tituloPropuesto ?? ""} className={anchoCompleto} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo de documento" nombre="tipoDocumentoId">
          <select
            required
            value={tipoId}
            onChange={(e) => {
              alElegirTipo(e.target.value);
              proponer(principal, e.target.value);
            }}
            className={anchoCompleto}
          >
            <option value="">Elija el tipo</option>
            {catalogo.tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.nombre} (${t.sigla})`}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Nivel de acceso" nombre="nivelAcceso">
          <select required defaultValue="general" className={anchoCompleto}>
            <option value="general">General</option>
            <option value="restringido">Restringido</option>
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Proceso o subproceso propietario" nombre="principal">
        <select
          required
          value={principal}
          onChange={(e) => {
            setPrincipal(e.target.value);
            proponer(e.target.value, tipoId);
          }}
          className={anchoCompleto}
        >
          <option value="">Elija el propietario</option>
          {opciones.map((o) => (
            <option key={o.marca} value={o.marca}>
              {o.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <ListaDeCasillas titulo="Otros procesos donde aplica">
        {opciones
          .filter((o) => o.marca !== principal)
          .map((o) => (
            <label key={o.marca} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="asociaciones" value={o.marca} />
              {o.nombre}
            </label>
          ))}
      </ListaDeCasillas>
      <Campo etiqueta="Descripción" nombre="descripcion" ayuda="Opcional. Alimenta la búsqueda.">
        <textarea rows={2} maxLength={2000} className={anchoCompleto} />
      </Campo>
      <Campo etiqueta="Palabras clave" nombre="palabrasClave" ayuda="Opcional. Separadas por coma.">
        <input maxLength={500} className={anchoCompleto} />
      </Campo>
      <ListaDeCasillas titulo="Documentos relacionados">
        {catalogo.documentos.map((d) => (
          <label key={d.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="relacionados" value={d.id} />
            {`${d.codigo} — ${d.titulo}`}
          </label>
        ))}
      </ListaDeCasillas>
      <Campo
        etiqueta="Código"
        nombre="codigo"
        ayuda={
          codigoSugerido === null
            ? "No hay un formato de código configurado: escríbalo."
            : `Sugerido: siguiente consecutivo de ${siglaProceso ?? "?"}-${tipo?.sigla ?? "?"}.`
        }
      >
        <input
          required
          maxLength={40}
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setCodigoEditado(true);
          }}
          className={`${anchoCompleto} font-mono uppercase`}
        />
      </Campo>
      <dl className="grid grid-cols-2 gap-3">
        <Dato etiqueta="Versión">1</Dato>
        {plantilla ? (
          <Dato etiqueta="Plantilla">
            <EnlaceDocumento codigo={plantilla.codigo}>{`${plantilla.codigo}, versión ${plantilla.version}`}</EnlaceDocumento>
          </Dato>
        ) : null}
      </dl>
    </div>
  );
}

/** En una modificación el código, el tipo y el proceso no se editan (spec 13A §8.6). */
function DocumentoExistente({
  codigo,
  tipo,
  proceso,
  version,
  plantilla,
  tituloEditable,
}: {
  codigo: string;
  tipo: string;
  proceso: string;
  version: number;
  plantilla: Plantilla;
  tituloEditable?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dato etiqueta="Código">
          <span className="font-mono">{codigo}</span>
        </Dato>
        <Dato etiqueta="Tipo">{tipo}</Dato>
        <Dato etiqueta="Proceso">{proceso}</Dato>
        <Dato etiqueta="Versión">{version}</Dato>
        {plantilla ? (
          <Dato etiqueta="Plantilla">
            <EnlaceDocumento codigo={plantilla.codigo}>{`${plantilla.codigo}, versión ${plantilla.version}`}</EnlaceDocumento>
          </Dato>
        ) : null}
      </dl>
      {tituloEditable !== undefined ? (
        <Campo etiqueta="Título" nombre="tituloNuevo" ayuda="Si lo cambia, se aplica al publicar. Hasta entonces el portal muestra el actual.">
          <input required minLength={3} maxLength={200} defaultValue={tituloEditable} className={anchoCompleto} />
        </Campo>
      ) : null}
    </div>
  );
}

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
                  tipo={tipoElegido}
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
