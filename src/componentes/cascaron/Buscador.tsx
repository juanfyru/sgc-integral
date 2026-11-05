"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { TextoResaltado } from "@/componentes/busqueda/TextoResaltado";
import { Dialogo } from "@/componentes/ui/Dialogo";
import {
  LARGO_MAXIMO_CONSULTA,
  LARGO_MINIMO_CONSULTA,
  estadoDeBusqueda,
  type RespuestaRapida,
  type ResultadoRapido,
} from "@/lib/busqueda-rapida";
import { IconoNav } from "./IconoNav";
import type { EntradaNav } from "./navegacion";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ESPERA_MS = 200;

const sinAcentos = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Clases de una fila de la lista. La activa no lleva texto de marca sobre el tinte (su contraste
 * depende del color que elija la entidad): fondo neutro y un borde izquierdo de marca, que la
 * señala aunque el color se parezca al fondo. La inactiva reserva el borde para no saltar.
 */
export function claseOpcion(activa: boolean): string {
  return `flex cursor-pointer items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm text-foreground ${
    activa ? "border-marca bg-muted" : "border-transparent hover:bg-muted"
  }`;
}

type Opcion =
  | { id: string; clase: "ir"; entrada: EntradaNav; ruta: string }
  | { id: string; clase: "documento"; resultado: ResultadoRapido; ruta: string }
  | { id: string; clase: "todos"; ruta: string };

export function Buscador({ entradas }: { entradas: EntradaNav[] }) {
  const [abierto, setAbierto] = useState(false);
  // Idempotente: Dialogo la llama en todo cierre, también en el que pide este componente.
  const cerrar = () => setAbierto(false);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto(true);
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-keyshortcuts="Control+K"
        className={`inline-flex size-10 items-center justify-center gap-2 rounded-md border-border text-muted-foreground hover:bg-muted sm:h-9 sm:w-56 sm:justify-start sm:border sm:bg-background sm:px-3 ${FOCO}`}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only sm:flex-1 sm:text-left sm:text-sm">Buscar…</span>
        <kbd className="hidden rounded border border-border px-1.5 font-sans text-xs text-texto-terciario sm:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialogo
        abierto={abierto}
        alCerrar={cerrar}
        titulo="Búsqueda global"
        className="fixed left-1/2 top-[10vh] m-0 w-[min(36rem,calc(100vw-2rem))] max-w-none -translate-x-1/2 rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {/* Se monta solo abierto: sus efectos (temporizador, fetch) no corren con el diálogo cerrado. */}
        {abierto && <Paleta entradas={entradas} cerrar={cerrar} />}
      </Dialogo>
    </>
  );
}

function Paleta({ entradas, cerrar }: { entradas: EntradaNav[]; cerrar: () => void }) {
  const router = useRouter();
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [respuesta, setRespuesta] = useState<RespuestaRapida | null>(null);
  const [activa, setActiva] = useState(0);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const consulta = texto.trim().slice(0, LARGO_MAXIMO_CONSULTA);
  const buscaDocumentos = consulta.length >= LARGO_MINIMO_CONSULTA;

  useEffect(() => {
    if (!buscaDocumentos) return;
    const control = new AbortController();
    const temporizador = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(consulta)}`, { signal: control.signal });
        if (!r.ok) throw new Error(String(r.status));
        const datos = (await r.json()) as { resultados: ResultadoRapido[] };
        setRespuesta({ consulta, resultados: datos.resultados });
      } catch {
        if (control.signal.aborted) return;
        setRespuesta({ consulta, resultados: null });
      }
    }, ESPERA_MS);
    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [consulta, buscaDocumentos]);

  const irA = useMemo(() => {
    const norm = sinAcentos(consulta);
    return entradas.filter((e) => sinAcentos(e.etiqueta).includes(norm));
  }, [entradas, consulta]);

  const estado = estadoDeBusqueda(consulta, respuesta);
  const resultados = (estado === "listo" && respuesta?.resultados) || [];
  const docsVisibles = resultados;

  const opciones: Opcion[] = [
    ...irA.map((entrada, i): Opcion => ({ id: `${idBase}-ir-${i}`, clase: "ir", entrada, ruta: entrada.href })),
    ...docsVisibles.map(
      (resultado, i): Opcion => ({ id: `${idBase}-doc-${i}`, clase: "documento", resultado, ruta: resultado.ruta }),
    ),
    ...(buscaDocumentos
      ? [{ id: `${idBase}-todos`, clase: "todos", ruta: `/buscar?q=${encodeURIComponent(consulta)}` } as Opcion]
      : []),
  ];
  const indice = Math.min(activa, Math.max(opciones.length - 1, 0));
  const opcionActiva = opciones[indice];

  function elegir(o: Opcion) {
    cerrar();
    router.push(o.ruta);
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && opciones.length > 0) {
      e.preventDefault();
      setActiva((indice + 1) % opciones.length);
    } else if (e.key === "ArrowUp" && opciones.length > 0) {
      e.preventDefault();
      setActiva((indice - 1 + opciones.length) % opciones.length);
    } else if (e.key === "Enter" && opcionActiva) {
      e.preventDefault();
      elegir(opcionActiva);
    }
    // Escape lo cierra el propio <dialog>, que llama a alCerrar.
  }

  const idActiva = opcionActiva?.id;
  useEffect(() => {
    if (idActiva) document.getElementById(idActiva)?.scrollIntoView?.({ block: "nearest" });
  }, [idActiva]);

  const sinCoincidencias =
    irA.length === 0 && (!buscaDocumentos || (estado === "listo" && resultados.length === 0));
  const filasIr = opciones.filter((o) => o.clase === "ir");
  const filasDocs = opciones.filter((o) => o.clase === "documento");
  const filaTodos = opciones.find((o) => o.clase === "todos");

  const propsOpcion = (o: Opcion) => ({
    id: o.id,
    role: "option" as const,
    "aria-selected": o.id === idActiva,
    onClick: () => elegir(o),
    onMouseMove: () => setActiva(opciones.indexOf(o)),
    className: claseOpcion(o.id === idActiva),
  });
  const claseTitulo = "px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-texto-terciario";

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={campo}
          type="text"
          role="combobox"
          aria-expanded={opciones.length > 0}
          aria-controls={idLista}
          aria-activedescendant={idActiva}
          aria-autocomplete="list"
          aria-label="Buscar documentos o ir a una página"
          placeholder="Buscar documentos o ir a una página…"
          autoComplete="off"
          spellCheck={false}
          maxLength={LARGO_MAXIMO_CONSULTA}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActiva(0);
          }}
          onKeyDown={alTeclear}
          className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-texto-terciario"
        />
      </div>

      <ul id={idLista} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
        {filasIr.length > 0 && (
          <li role="presentation">
            <p className={claseTitulo}>Ir a</p>
            <ul role="group" aria-label="Ir a">
              {filasIr.map((o) =>
                o.clase === "ir" ? (
                  <li key={o.id} {...propsOpcion(o)}>
                    <IconoNav nombre={o.entrada.icono} className="size-4 shrink-0" />
                    {o.entrada.etiqueta}
                  </li>
                ) : null,
              )}
            </ul>
          </li>
        )}
        {buscaDocumentos && (
          <li role="presentation">
            <p className={claseTitulo}>Documentos</p>
            <ul role="group" aria-label="Documentos">
              {filasDocs.map((o) =>
                o.clase === "documento" ? (
                  <li key={o.id} {...propsOpcion(o)}>
                    <span className="shrink-0 font-mono text-xs">{o.resultado.codigo}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {o.resultado.tituloResaltado ? (
                        <TextoResaltado texto={o.resultado.tituloResaltado} />
                      ) : (
                        o.resultado.titulo
                      )}
                    </span>
                    <span className="shrink-0 rounded border border-border px-1.5 text-xs text-muted-foreground">
                      {o.resultado.tipo}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </li>
        )}
        {filaTodos && (
          <li {...propsOpcion(filaTodos)}>Ver todos los resultados de “{consulta}”</li>
        )}
      </ul>

      <div className="px-4 pb-3 text-sm text-muted-foreground" role="status" aria-live="polite">
        {estado === "cargando" && "Buscando…"}
        {estado === "error" && "No se pudo buscar; intente de nuevo"}
        {estado !== "error" && estado !== "cargando" && sinCoincidencias && "Sin coincidencias"}
      </div>
    </div>
  );
}
