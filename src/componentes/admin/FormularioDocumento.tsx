"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { EdicionDeControl, OpcionDocumento } from "@/db/consultas/admin";
import { NUMERO_MAXIMO_DE_VERSION } from "@/lib/tramites/tipos";
import { enviarSinReiniciar } from "./sin-reiniciar";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
type Tipo = { id: number; nombre: string; sigla: string };
type ProcesoConSub = {
  id: number;
  nombre: string;
  subprocesos: Array<{ id: number; nombre: string }>;
};
type Asociacion = { procesoId: number | null; subprocesoId: number | null; esPrincipal: boolean };

const claseCampo = `${claseControl} w-full disabled:bg-muted`;
/** `read-only:` también alcanza a un <select>, que nunca se edita como texto: lo pintaría deshabilitado. */
const claseTexto = `${claseCampo} read-only:bg-muted`;

const marcaDe = ({ procesoId, subprocesoId }: Pick<Asociacion, "procesoId" | "subprocesoId">) =>
  procesoId !== null ? `p:${procesoId}` : `s:${subprocesoId}`;

/** Lo enviado, para repoblar el formulario cuando llega sin JavaScript y la acción lo rechaza. */
function useFormulario(accion: Accion) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const enviados = estado?.valores;
  const campo = (nombre: string): string | undefined => {
    const v = enviados?.[nombre];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const lista = (nombre: string): string[] | undefined => {
    if (!enviados) return undefined;
    const v = enviados[nombre];
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  };
  return { estado, enviar, pendiente, campo, lista, alEnviar: enviarSinReiniciar(enviar) };
}

function Rechazo({ estado }: { estado: EstadoAccion }) {
  if (!estado) return null;
  return (
    <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  );
}

function CampoNivelAcceso({ valor }: { valor: string }) {
  return (
    <Campo etiqueta="Nivel de acceso" nombre="nivelAcceso">
      <select required defaultValue={valor} className={claseCampo}>
        <option value="general">General</option>
        <option value="restringido">Restringido</option>
      </select>
    </Campo>
  );
}

function CamposDescriptivos({ descripcion, palabrasClave }: { descripcion: string; palabrasClave: string }) {
  return (
    <>
      <Campo etiqueta="Descripción" nombre="descripcion" ayuda="Opcional. Alimenta la búsqueda.">
        <textarea rows={3} maxLength={2000} defaultValue={descripcion} className={claseTexto} />
      </Campo>
      <Campo etiqueta="Palabras clave" nombre="palabrasClave" ayuda="Opcional. Separadas por coma. Alimentan la búsqueda.">
        <input maxLength={500} defaultValue={palabrasClave} className={claseTexto} />
      </Campo>
    </>
  );
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function DocumentosRelacionados({ documentos, marcados }: { documentos: OpcionDocumento[]; marcados: Set<string> }) {
  const [filtro, setFiltro] = useState("");
  const buscado = normalizar(filtro.trim());
  const coincide = (d: OpcionDocumento) => normalizar(`${d.codigo} ${d.titulo}`).includes(buscado);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Documentos relacionados</legend>
      <input
        type="search"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault(); // Enter filtra; no debe enviar el formulario
        }}
        placeholder="Filtrar por código o título"
        aria-label="Filtrar documentos relacionados"
        className={claseTexto}
      />
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
        {documentos.map((d) => (
          // El que no coincide se oculta sin desmontarse: si estaba marcado, sigue viajando.
          <label key={d.id} className={coincide(d) ? "flex items-start gap-2 text-sm" : "hidden"}>
            <input type="checkbox" name="relacionados" value={d.id} defaultChecked={marcados.has(String(d.id))} className="mt-0.5" />
            <span className="min-w-0 break-words">
              <span className="font-mono">{d.codigo}</span>
              {` — ${d.titulo}`}
            </span>
          </label>
        ))}
        {documentos.some(coincide) ? null : (
          <p className="text-sm text-muted-foreground">
            {documentos.length === 0 ? "Aún no hay documentos vigentes." : "Ningún documento coincide."}
          </p>
        )}
      </div>
    </fieldset>
  );
}

type PropietarioFijo = { nombre: string; razon: string };

function Asociaciones({
  procesos,
  marcadas,
  principal,
  propietarioFijo,
}: {
  procesos: ProcesoConSub[];
  marcadas: Set<string>;
  principal: string;
  propietarioFijo?: PropietarioFijo;
}) {
  const casillas = (marca: string, nombre: string) => (
    <>
      {propietarioFijo && marca === principal ? (
        <input type="checkbox" checked disabled readOnly aria-label={`${nombre} es el propietario`} />
      ) : (
        <input type="checkbox" name="asociaciones" value={marca} defaultChecked={marcadas.has(marca)} aria-label={`Aplica a ${nombre}`} />
      )}
      {propietarioFijo ? null : (
        <input
          type="radio"
          name="principal"
          value={marca}
          defaultChecked={principal === marca}
          aria-label={`${nombre} es el propietario`}
        />
      )}
    </>
  );
  const enLaLista = new Set(procesos.flatMap((p) => [`p:${p.id}`, ...p.subprocesos.map((s) => `s:${s.id}`)]));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        {propietarioFijo ? "Otros procesos donde aplica" : "Dónde aplica (marque los procesos o subprocesos; el círculo define el propietario)"}
      </legend>
      {propietarioFijo ? (
        <p className="text-sm text-muted-foreground">
          {"Proceso propietario: "}
          <span className="font-medium text-foreground">{propietarioFijo.nombre}</span>
          {`. ${propietarioFijo.razon}`}
          <input type="hidden" name="principal" value={principal} />
        </p>
      ) : null}
      {/* Lo que ya no se ofrece, por un proceso desactivado, no se pierde al guardar otra cosa. */}
      {[...marcadas]
        .filter((marca) => !enLaLista.has(marca) && marca !== principal)
        .map((marca) => (
          <input key={marca} type="hidden" name="asociaciones" value={marca} />
        ))}
      <div className="max-h-80 overflow-y-auto rounded-md border p-3">
        {procesos.map((p) => (
          <details key={p.id} open={marcadas.has(`p:${p.id}`) || p.subprocesos.some((s) => marcadas.has(`s:${s.id}`))}>
            <summary className="flex cursor-pointer items-center gap-2 py-1 text-sm">
              {casillas(`p:${p.id}`, p.nombre)}
              <span className="font-medium">{p.nombre}</span>
            </summary>
            <div className="ml-8 flex flex-col gap-1 pb-2">
              {p.subprocesos.map((s) => (
                <span key={s.id} className="flex items-center gap-2 text-sm">
                  {casillas(`s:${s.id}`, s.nombre)}
                  {s.nombre}
                </span>
              ))}
            </div>
          </details>
        ))}
      </div>
    </fieldset>
  );
}

/** El alta: un documento aprobado fuera de la plataforma, con todos sus datos de una vez. */
export function FormularioDocumento({
  accion,
  tipos,
  procesos,
  documentos,
  formatoCodigo,
}: {
  accion: Accion;
  tipos: Tipo[];
  procesos: ProcesoConSub[];
  documentos: OpcionDocumento[];
  formatoCodigo: string | null;
}) {
  const { estado, enviar, pendiente, campo, lista, alEnviar } = useFormulario(accion);
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Código" nombre="codigo" ayuda={formatoCodigo ? `Formato: ${formatoCodigo}.` : undefined}>
          <input required maxLength={40} defaultValue={campo("codigo")} className={`${claseTexto} font-mono uppercase`} />
        </Campo>
        <Campo etiqueta="Tipo" nombre="tipoId">
          <select required defaultValue={campo("tipoId")} className={claseCampo}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{`${t.nombre} (${t.sigla})`}</option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Título" nombre="titulo">
        <input required minLength={3} maxLength={200} defaultValue={campo("titulo")} className={claseTexto} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Versión con la que entra" nombre="numeroInicial" ayuda="El número real del documento.">
          <input
            type="number"
            required
            min={1}
            max={NUMERO_MAXIMO_DE_VERSION}
            step={1}
            defaultValue={campo("numeroInicial") ?? 1}
            className={claseTexto}
          />
        </Campo>
        <CampoNivelAcceso valor={campo("nivelAcceso") ?? "general"} />
      </div>
      <CamposDescriptivos descripcion={campo("descripcion") ?? ""} palabrasClave={campo("palabrasClave") ?? ""} />
      <Asociaciones procesos={procesos} marcadas={new Set(lista("asociaciones"))} principal={campo("principal") ?? ""} />
      <DocumentosRelacionados documentos={documentos} marcados={new Set(lista("relacionados"))} />
      <Rechazo estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Registrando…" : "Registrar documento"}
      </Boton>
    </form>
  );
}

/** Código, tipo y título. Lo que §8.6 no deja cambiar aparece deshabilitado, con la razón escrita. */
export function FormularioControl({
  accion,
  tipos,
  documentoId,
  valores,
  edicion,
}: {
  accion: Accion;
  tipos: Tipo[];
  documentoId: number;
  valores: { codigo: string; titulo: string; tipoId: number; tipoNombre: string };
  edicion: EdicionDeControl;
}) {
  const { estado, enviar, pendiente, campo, alEnviar } = useFormulario(accion);
  const codigoFijo = edicion.codigoYTipo !== null;
  const tituloFijo = edicion.titulo !== null;
  const razones = [...new Set([edicion.codigoYTipo, edicion.titulo])].filter((r) => r !== null);
  // Un tipo desactivado sigue siendo el del documento: el <select> debe poder mostrarlo.
  const opciones = tipos.some((t) => t.id === valores.tipoId)
    ? tipos
    : [{ id: valores.tipoId, nombre: valores.tipoNombre, sigla: "inactivo" }, ...tipos];
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="documentoId" value={documentoId} />
      {razones.length > 0 ? (
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          {razones.map((razon) => (
            <p key={razon}>{razon}.</p>
          ))}
        </div>
      ) : null}
      <fieldset disabled={codigoFijo && tituloFijo} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Datos de control</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Código" nombre="codigo">
            <input
              required
              maxLength={40}
              readOnly={codigoFijo}
              defaultValue={campo("codigo") ?? valores.codigo}
              className={`${claseTexto} font-mono uppercase`}
            />
          </Campo>
          <Campo etiqueta="Tipo" nombre="tipoId">
            <select required disabled={codigoFijo} defaultValue={campo("tipoId") ?? valores.tipoId} className={claseCampo}>
              {opciones.map((t) => (
                <option key={t.id} value={t.id}>{`${t.nombre} (${t.sigla})`}</option>
              ))}
            </select>
          </Campo>
          {/* Un <select> deshabilitado no viaja, y la acción valida el formulario completo. */}
          {codigoFijo ? <input type="hidden" name="tipoId" value={valores.tipoId} /> : null}
        </div>
        <Campo etiqueta="Título" nombre="titulo">
          <input
            required
            minLength={3}
            maxLength={200}
            readOnly={tituloFijo}
            defaultValue={campo("titulo") ?? valores.titulo}
            className={claseTexto}
          />
        </Campo>
      </fieldset>
      <Rechazo estado={estado} />
      {codigoFijo && tituloFijo ? null : (
        <Boton type="submit" pendiente={pendiente} className="self-start">
          {pendiente ? "Guardando…" : "Guardar datos de control"}
        </Boton>
      )}
    </form>
  );
}

export type DistribucionDelDocumento = {
  /** Las listas activas y, aunque estén desactivadas, las que el documento ya tiene. */
  listas: Array<{ id: number; nombre: string; activa: boolean }>;
  listaIds: number[];
  lecturaObligatoriaIngreso: boolean;
};

function BloqueDistribucion({
  distribucion,
  marcadas,
  lecturaObligatoria,
}: {
  distribucion: DistribucionDelDocumento;
  marcadas: Set<string>;
  lecturaObligatoria: boolean;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Distribución</legend>
      <input type="hidden" name="distribucion" value="1" />
      <p className="text-xs text-muted-foreground">
        Además de las personas de sus procesos, el documento llega a quienes estén en las listas elegidas (si es restringido,
        solo a quien puede verlo).
      </p>
      {distribucion.listas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay listas de distribución.</p>
      ) : (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
          {distribucion.listas.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="listaIds" value={l.id} defaultChecked={marcadas.has(String(l.id))} className="size-4" />
              {l.nombre}
              {l.activa ? null : <span className="text-xs text-muted-foreground">(lista desactivada)</span>}
            </label>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="lecturaObligatoriaIngreso" defaultChecked={lecturaObligatoria} className="size-4" />
        Lectura obligatoria al ingresar al proceso
      </label>
    </fieldset>
  );
}

/** Lo que no es parte del contenido aprobado: se edita siempre (spec 13A §8.6). */
export function FormularioCatalogo({
  accion,
  procesos,
  documentos,
  documentoId,
  codigo,
  valores,
  propietarioFijo,
  distribucion,
}: {
  accion: Accion;
  procesos: ProcesoConSub[];
  documentos: OpcionDocumento[];
  distribucion?: DistribucionDelDocumento;
  documentoId: number;
  codigo: string;
  valores: {
    descripcion: string | null;
    palabrasClave: string | null;
    nivelAcceso: string;
    asociaciones: Asociacion[];
    relacionados: number[];
  };
  propietarioFijo?: PropietarioFijo;
}) {
  const { estado, enviar, pendiente, campo, lista, alEnviar } = useFormulario(accion);
  const principal = valores.asociaciones.find((a) => a.esPrincipal);
  return (
    <form action={enviar} onSubmit={alEnviar} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="documentoId" value={documentoId} />
      <input type="hidden" name="codigo" value={codigo} />
      <CampoNivelAcceso valor={campo("nivelAcceso") ?? valores.nivelAcceso} />
      <CamposDescriptivos
        descripcion={campo("descripcion") ?? valores.descripcion ?? ""}
        palabrasClave={campo("palabrasClave") ?? valores.palabrasClave ?? ""}
      />
      <Asociaciones
        procesos={procesos}
        marcadas={new Set(lista("asociaciones") ?? valores.asociaciones.map(marcaDe))}
        principal={campo("principal") ?? (principal ? marcaDe(principal) : "")}
        propietarioFijo={propietarioFijo}
      />
      <DocumentosRelacionados documentos={documentos} marcados={new Set(lista("relacionados") ?? valores.relacionados.map(String))} />
      {distribucion ? (
        <BloqueDistribucion
          distribucion={distribucion}
          marcadas={new Set(lista("listaIds") ?? distribucion.listaIds.map(String))}
          lecturaObligatoria={estado?.valores ? lista("lecturaObligatoriaIngreso")?.length === 1 : distribucion.lecturaObligatoriaIngreso}
        />
      ) : null}
      <Rechazo estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar datos de catálogo"}
      </Boton>
    </form>
  );
}
