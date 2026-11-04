"use client";

import { hexValido } from "@/lib/color";
import { contrasteWCAG } from "@/lib/contraste";
import { derivarMarca, formatearRazon, SUPERFICIES, validarMarca } from "@/lib/marca";

const BLANCO = "#ffffff";

function Linea({ texto, cumple }: { texto: string; cumple: boolean }) {
  return (
    <p className={`text-xs ${cumple ? "text-estado-bien-texto" : "text-estado-critico-texto"}`}>
      {texto} · {cumple ? "cumple" : "no cumple"}
    </p>
  );
}

function MiniPantalla({
  tema,
  etiqueta,
  tokens,
  sigla,
  nombre,
}: {
  tema: "claro" | "oscuro";
  etiqueta: string;
  tokens: Record<string, string>;
  sigla: string;
  nombre: string;
}) {
  const s = SUPERFICIES[tema];
  const monograma = sigla.slice(0, 2).toUpperCase();
  return (
    <div
      role="img"
      aria-label={`Vista previa en tema ${etiqueta}: barra lateral con ${sigla} y botón Guardar`}
      className="flex overflow-hidden rounded-lg border border-border"
      style={{
        background: s.fondo,
        color: s.tinta,
        "--marca": tokens.marca,
        "--marca-relleno": tokens["marca-relleno"],
        "--marca-oscurecida": tokens["marca-oscurecida"],
      } as React.CSSProperties}
    >
      <div className="flex w-28 flex-col gap-2 p-3" style={{ background: s.panel }}>
        <span
          className="flex size-8 items-center justify-center rounded-md text-xs font-bold"
          style={{ background: "var(--marca-relleno)", color: BLANCO }}
        >
          {monograma}
        </span>
        <span className="truncate text-xs font-medium">{nombre}</span>
        <span className="text-xs font-medium" style={{ color: "var(--marca)" }}>
          Inicio
        </span>
      </div>
      <div className="flex flex-1 flex-col items-start justify-between gap-3 p-3">
        <span className="text-xs font-medium">Tema {etiqueta}</span>
        <span
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: "var(--marca-relleno)", color: BLANCO }}
        >
          Guardar
        </span>
      </div>
    </div>
  );
}

export function VistaPreviaMarca({
  primario,
  secundario,
  sigla,
  nombre,
}: {
  primario: string;
  secundario: string;
  sigla: string;
  nombre: string;
}) {
  const validos = hexValido(primario) && hexValido(secundario);
  const tokens = derivarMarca({ primario, secundario });
  const errores = validos ? validarMarca({ primario, secundario }) : [];
  const falla = (campo: string) => errores.some((e) => e.campo === campo);
  return (
    <section aria-labelledby="titulo-vista-previa" className="space-y-3">
      <h2 id="titulo-vista-previa" className="text-sm font-semibold">
        Vista previa
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <MiniPantalla tema="claro" etiqueta="claro" tokens={tokens.claro} sigla={sigla} nombre={nombre} />
        <MiniPantalla tema="oscuro" etiqueta="oscuro" tokens={tokens.oscuro} sigla={sigla} nombre={nombre} />
      </div>
      <div aria-live="polite" className="space-y-1">
        {hexValido(primario) ? (
          <Linea
            texto={`Primario, texto blanco: ${formatearRazon(contrasteWCAG(primario, BLANCO))}:1`}
            cumple={!falla("color_primario")}
          />
        ) : null}
        {hexValido(secundario) ? (
          <Linea
            texto={`Secundario, fondo claro: ${formatearRazon(contrasteWCAG(secundario, SUPERFICIES.claro.fondo))}:1`}
            cumple={!falla("color_secundario")}
          />
        ) : null}
      </div>
    </section>
  );
}
