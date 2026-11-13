"use client";

import { useState } from "react";
import { importarLoteAccion, vistaPreviaAccion } from "@/app/admin/acciones-indicadores";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { VistaPrevia } from "@/db/consultas/indicadores/importacion";
import type { Pendiente } from "@/lib/indicadores/importacion/revisar";
import { esImportable, TablaVistaPrevia } from "./TablaVistaPrevia";

const CONTROL = `${claseControl} w-full`;
const NUMERO = `${claseControl} w-24`;

/** El texto como lo normaliza el servidor (minúsculas, sin acentos, espacios simples): es la clave de la correspondencia. */
function clave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ROTULO: Record<Pendiente["tipo"], string> = { subproceso: "Subproceso", cargo: "Cargo", tipo: "Tipo", unidad: "Unidad" };
const noVacio = (v: string) => v.trim() !== "";

type Elegida = { tipo: Pendiente["tipo"]; texto: string; valor: string };

/**
 * La página de un lote por importar (spec 14A §5.3, pasos 2 a 6): los datos de la aprobación previa, la regla, las
 * correspondencias que faltan, la vista previa y, con la clave, «Importar N fichas». La vista previa se pide al servidor
 * con lo escrito; importar queda deshabilitado mientras la vista no refleje lo que hay en el formulario.
 */
export function FormularioImportacion({ loteId, vistaInicial, pideCodigo }: { loteId: number; vistaInicial: VistaPrevia; pideCodigo: boolean }) {
  const [documento, setDocumento] = useState("");
  const [aprobadoPor, setAprobadoPor] = useState("");
  const [fecha, setFecha] = useState("");
  const [pctAscendente, setPctAscendente] = useState("90");
  const [pctDescendente, setPctDescendente] = useState("110");
  const [elegidas, setElegidas] = useState<Record<string, Elegida>>({});
  const [siglasNo, setSiglasNo] = useState<Record<number, boolean>>({});
  const [vista, setVista] = useState(vistaInicial);
  const [firmaVista, setFirmaVista] = useState(() => JSON.stringify(["90", "110", {}]));
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valoresElegidos = Object.fromEntries(Object.entries(elegidas).map(([k, e]) => [k, e.valor]));
  const firma = JSON.stringify([pctAscendente, pctDescendente, valoresElegidos]);
  const actualizada = firma === firmaVista;

  // Lo que hay que resolver: lo pendiente en la vista más lo ya elegido (que deja de ser pendiente al refrescar).
  const lista: Elegida[] = [...vista.pendientes.map((p) => ({ tipo: p.tipo, texto: p.texto, valor: elegidas[`${p.tipo}:${clave(p.texto)}`]?.valor ?? "" }))];
  for (const [k, e] of Object.entries(elegidas)) {
    if (!lista.some((x) => `${x.tipo}:${clave(x.texto)}` === k)) lista.push(e);
  }

  const importables = vista.filas.filter(esImportable);
  const siglas = new Map<number, string>();
  for (const f of importables) {
    if (f.ficha?.subprocesoId != null && f.ficha.siglaParaSubproceso) siglas.set(f.ficha.subprocesoId, f.ficha.siglaParaSubproceso);
  }

  function camposDeLaRegla(): Record<string, string> {
    const campos: Record<string, string> = { pctAscendente, pctDescendente };
    for (const [k, e] of Object.entries(elegidas)) if (noVacio(e.valor)) campos[`corr:${k}`] = e.valor;
    return campos;
  }

  async function actualizar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setActualizando(true);
    setError(null);
    try {
      const datos = new FormData();
      datos.set("id", String(loteId));
      for (const [campo, valor] of Object.entries(camposDeLaRegla())) datos.set(campo, valor);
      const respuesta = await vistaPreviaAccion(null, datos);
      if (respuesta && respuesta.ok && "vista" in respuesta) {
        setVista(respuesta.vista);
        setFirmaVista(firma);
      } else if (respuesta && !respuesta.ok) setError(respuesta.error);
    } catch {
      setError("No se pudo actualizar la vista previa: intente de nuevo");
    } finally {
      setActualizando(false);
    }
  }

  const opcionesDe = (tipo: Pendiente["tipo"]) => {
    const o = vista.opciones;
    if (tipo === "subproceso") return o.subprocesos.map((s) => ({ id: s.id, etiqueta: `${s.proceso} › ${s.nombre}` }));
    if (tipo === "cargo") return o.cargos.map((x) => ({ id: x.id, etiqueta: x.nombre }));
    if (tipo === "tipo") return o.tipos.map((x) => ({ id: x.id, etiqueta: x.nombre }));
    return o.unidades.map((x) => ({ id: x.id, etiqueta: x.nombre }));
  };

  const ocultos: Record<string, string> = { id: String(loteId), documento, aprobadoPor, fecha, ...camposDeLaRegla() };
  for (const [subprocesoId, sigla] of siglas) if (!siglasNo[subprocesoId]) ocultos[`sigla:${subprocesoId}`] = sigla;

  const n = importables.length;
  const etiqueta = `Importar ${n} ${n === 1 ? "ficha" : "fichas"}`;
  const datosCompletos = documento.trim() !== "" && aprobadoPor.trim() !== "" && fecha !== "";
  const motivoDeshabilitado =
    n === 0
      ? "Ninguna fila está lista: corrija la plantilla o resuelva las correspondencias."
      : !actualizada
        ? "Actualice la vista previa: cambió la regla o una correspondencia."
        : !datosCompletos
          ? "Complete los datos de la aprobación previa."
          : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form onSubmit={actualizar} className="flex flex-col gap-6" aria-label="Datos de la importación">
        <section className="flex max-w-2xl flex-col gap-3" aria-labelledby="titulo-aprobacion">
          <h2 id="titulo-aprobacion" className="font-display text-lg font-semibold">
            Aprobación previa
          </h2>
          <p className="text-sm text-muted-foreground">
            Estas fichas se aprobaron antes de SGC Integral: dígalo una vez para todo el lote. Queda en cada ficha aprobada.
          </p>
          <Campo etiqueta="Documento" nombre="documento" ayuda="Código y versión del documento que las aprobó, por ejemplo SGC-TI-002 v1.">
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={120} className={CONTROL} />
          </Campo>
          <Campo etiqueta="Quién aprobó" nombre="aprobadoPor" ayuda="Cargo y nombre.">
            <input value={aprobadoPor} onChange={(e) => setAprobadoPor(e.target.value)} maxLength={200} className={CONTROL} />
          </Campo>
          <Campo etiqueta="Fecha" nombre="fecha">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${claseControl} w-full sm:w-56`} />
          </Campo>
        </section>

        <section className="flex max-w-2xl flex-col gap-3" aria-labelledby="titulo-regla">
          <h2 id="titulo-regla" className="font-display text-lg font-semibold">
            La regla de los rangos
          </h2>
          <p className="text-sm text-muted-foreground">
            La matriz no trae rangos por indicador: cada ficha con meta toma la regla general que aprobó la Gerencia.
          </p>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Atención desde el
            <input type="number" min={1} max={99} step={1} required value={pctAscendente} onChange={(e) => setPctAscendente(e.target.value)} className={NUMERO} />
            % de la meta, en ascendente
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Atención hasta el
            <input type="number" min={101} max={999} step={1} required value={pctDescendente} onChange={(e) => setPctDescendente(e.target.value)} className={NUMERO} />
            % de la meta, en descendente
          </label>
        </section>

        {lista.length > 0 ? (
          <section className="flex max-w-2xl flex-col gap-3" aria-labelledby="titulo-correspondencias">
            <h2 id="titulo-correspondencias" className="font-display text-lg font-semibold">
              Correspondencias
            </h2>
            <p className="text-sm text-muted-foreground">
              Lo que no coincide exactamente con el sistema se elige una vez y vale para todas las filas que lo usan.
            </p>
            {lista.map((p) => {
              const k = `${p.tipo}:${clave(p.texto)}`;
              const id = `corr-${p.tipo}-${clave(p.texto).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
              return (
                <Campo key={k} etiqueta={`${ROTULO[p.tipo]} para «${p.texto}»`} nombre={`corr:${k}`} id={id}>
                  <select
                    value={p.valor}
                    onChange={(e) => setElegidas((prev) => ({ ...prev, [k]: { tipo: p.tipo, texto: p.texto, valor: e.target.value } }))}
                    className={CONTROL}
                  >
                    <option value="">Sin elegir</option>
                    {opcionesDe(p.tipo).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
              );
            })}
          </section>
        ) : null}

        {siglas.size > 0 ? (
          <section className="flex max-w-2xl flex-col gap-2" aria-labelledby="titulo-siglas">
            <h2 id="titulo-siglas" className="font-display text-lg font-semibold">
              Siglas de subproceso
            </h2>
            <p className="text-sm text-muted-foreground">El código de estas filas trae una sigla que su subproceso aún no tiene.</p>
            {[...siglas].map(([subprocesoId, sigla]) => {
              const nombre = vista.opciones.subprocesos.find((s) => s.id === subprocesoId)?.nombre ?? `n.º ${subprocesoId}`;
              return (
                <label key={subprocesoId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`sigla:${subprocesoId}`}
                    checked={!siglasNo[subprocesoId]}
                    onChange={(e) => setSiglasNo((prev) => ({ ...prev, [subprocesoId]: !e.target.checked }))}
                  />
                  {`Dar la sigla ${sigla} al subproceso ${nombre}`}
                </label>
              );
            })}
          </section>
        ) : null}

        <div className="flex flex-col items-start gap-2">
          <Boton type="submit" variante="secundario" pendiente={actualizando}>
            {actualizando ? "Actualizando…" : "Actualizar la vista previa"}
          </Boton>
          {error ? (
            <p role="alert" className="text-sm text-estado-critico-texto">
              {error}
            </p>
          ) : null}
        </div>
      </form>

      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="titulo-vista">
        <h2 id="titulo-vista" className="font-display text-lg font-semibold">
          Vista previa
        </h2>
        <p className="text-sm text-muted-foreground">
          {`${n} de ${vista.filas.length} filas están listas. Una fila con problemas o sin correspondencia no se importa; el resto sí.`}
        </p>
        <TablaVistaPrevia vista={vista} />
      </section>

      <section className="flex max-w-2xl flex-col items-start gap-2" aria-labelledby="titulo-importar">
        <h2 id="titulo-importar" className="font-display text-lg font-semibold">
          Importar
        </h2>
        {motivoDeshabilitado ? (
          <>
            <Boton disabled>{etiqueta}</Boton>
            <p className="text-sm text-muted-foreground">{motivoDeshabilitado}</p>
          </>
        ) : (
          <DialogoFirma
            titulo={`Importar ${n} ${n === 1 ? "ficha" : "fichas"} de indicadores`}
            etiquetaBoton={etiqueta}
            accion={importarLoteAccion}
            ocultos={ocultos}
            pideCodigo={pideCodigo}
          >
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Fichas</dt>
              <dd>{n}</dd>
              <dt className="text-muted-foreground">Documento</dt>
              <dd className="break-words">{documento}</dd>
              <dt className="text-muted-foreground">Quién aprobó</dt>
              <dd className="break-words">{aprobadoPor}</dd>
              <dt className="text-muted-foreground">Fecha</dt>
              <dd>{fecha}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              Entra todo o nada. Las fichas «Aprobado» quedan aprobadas con esta aprobación previa y las «Propuesto» quedan en borrador. La
              clave deja constancia de quién importó.
            </p>
          </DialogoFirma>
        )}
      </section>
    </div>
  );
}
