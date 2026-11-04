"use client";

import { useEffect, useState } from "react";
import { Monograma } from "@/componentes/cascaron/Monograma";
import { hexValido } from "@/lib/color";
import { contrasteWCAG } from "@/lib/contraste";
import { derivarMarca, type ErrorMarca, formatearRazon, SUPERFICIES } from "@/lib/marca";

const BLANCO = "#ffffff";

function MiniPantalla({
  tema,
  tokens,
  sigla,
  nombre,
}: {
  tema: "claro" | "oscuro";
  tokens: Record<string, string>;
  sigla: string;
  nombre: string;
}) {
  const s = SUPERFICIES[tema];
  return (
    <div
      role="img"
      aria-label={`Vista previa en tema ${tema}: barra lateral con ${sigla} y botón Guardar`}
      className="flex overflow-hidden rounded-lg border border-border"
      style={{
        background: s.fondo,
        color: s.tinta,
        "--marca": tokens.marca,
        "--marca-relleno": tokens["marca-relleno"],
        "--marca-oscurecida": tokens["marca-oscurecida"],
        "--marca-2-relleno": tokens["marca-2-relleno"],
        "--marca-2-contraste": tokens["marca-2-contraste"],
      } as React.CSSProperties}
    >
      <div className="flex w-28 flex-col gap-2 p-3" style={{ background: s.panel }}>
        <Monograma sigla={sigla} className="size-10 rounded-lg text-xs" />
        <span className="truncate text-xs font-medium">{nombre}</span>
        <span className="text-xs font-medium" style={{ color: "var(--marca)" }}>
          Inicio
        </span>
      </div>
      <div className="flex flex-1 flex-col items-start justify-between gap-3 p-3">
        <span className="text-xs font-medium">Tema {tema}</span>
        <span
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{
            background: "var(--marca-relleno)",
            color: BLANCO,
            border: tema === "oscuro" ? "1px solid var(--marca)" : undefined,
          }}
        >
          Guardar
        </span>
      </div>
    </div>
  );
}

function Linea({ texto, cumple }: { texto: string; cumple: boolean }) {
  return (
    <p className={`text-xs ${cumple ? "text-estado-bien-texto" : "text-estado-critico-texto"}`}>
      {texto} · {cumple ? "cumple" : "no cumple"}
    </p>
  );
}

/** `errores`: la validación de contraste ya calculada por el formulario (una sola vez por render). */
export function VistaPreviaMarca({
  primario,
  secundario,
  sigla,
  nombre,
  errores,
}: {
  primario: string;
  secundario: string;
  sigla: string;
  nombre: string;
  errores: ErrorMarca[];
}) {
  const tokens = derivarMarca({ primario, secundario });
  const falla = (campo: string) => errores.some((e) => e.campo === campo);
  const lineas: { texto: string; cumple: boolean }[] = [];
  if (hexValido(primario)) {
    lineas.push({
      texto: `Primario, texto blanco: ${formatearRazon(contrasteWCAG(primario, BLANCO))}:1`,
      cumple: !falla("color_primario"),
    });
  }
  if (hexValido(secundario)) {
    lineas.push({
      texto: `Secundario, fondo claro: ${formatearRazon(contrasteWCAG(secundario, SUPERFICIES.claro.fondo))}:1`,
      cumple: !falla("color_secundario"),
    });
    const relleno = tokens.claro["marca-2-relleno"];
    const contraste = tokens.claro["marca-2-contraste"];
    lineas.push({
      texto: `Monograma: texto ${contraste === BLANCO ? "blanco" : "tinta"}, ${formatearRazon(contrasteWCAG(contraste, relleno))}:1`,
      cumple: contrasteWCAG(contraste, relleno) >= 4.5,
    });
  }

  // El lector de pantalla se entera 400 ms después del último cambio, no a cada tecla.
  const resumen = lineas.map((l) => `${l.texto}, ${l.cumple ? "cumple" : "no cumple"}`).join(". ");
  const [anunciado, setAnunciado] = useState(resumen);
  useEffect(() => {
    const t = setTimeout(() => setAnunciado(resumen), 400);
    return () => clearTimeout(t);
  }, [resumen]);

  return (
    <section aria-labelledby="titulo-vista-previa" className="space-y-3">
      <h2 id="titulo-vista-previa" className="text-sm font-semibold">
        Vista previa
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <MiniPantalla tema="claro" tokens={tokens.claro} sigla={sigla} nombre={nombre} />
        <MiniPantalla tema="oscuro" tokens={tokens.oscuro} sigla={sigla} nombre={nombre} />
      </div>
      <div aria-hidden="true" className="space-y-1">
        {lineas.map((l) => (
          <Linea key={l.texto.split(":")[0]} {...l} />
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {anunciado}
      </p>
    </section>
  );
}
