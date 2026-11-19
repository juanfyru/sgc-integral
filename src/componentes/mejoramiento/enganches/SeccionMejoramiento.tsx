import Link from "next/link";
import { ClipboardCheck, Megaphone, Printer } from "lucide-react";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { HallazgoQueCita, SeccionDeCitas } from "@/db/consultas/mejoramiento/citas";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`;

/** El color del estado; el texto va siempre con él. Abierto, el del módulo; cerrado, bien; rechazado o anulado, sin dato. */
function varianteDe(f: HallazgoQueCita): VarianteInsignia {
  if (!f.terminado) return "modulo";
  return f.estado === "cerrado" ? "bien" : "sin-dato";
}

/**
 * La sección «Mejoramiento» de la página de un documento, un proceso, un subproceso, un indicador o una norma (Fase 15B, anexo §10.1 y
 * §10.2, maqueta 8), ya decidida por `seccionDeMejoramiento`: los hallazgos que la persona ve y citan lo de la página (los no terminados
 * primero, hasta diez), cada uno con su estado y cómo lo cita, «Ver todos» hacia la lista filtrada y el botón que le toca («Abrir
 * hallazgo» o «Reportar»; en la norma, ninguno). En la página del proceso, también «SGC-FO-14 del proceso» (`consolidado`), a quien lo
 * imprime. **Sin filas no pinta la lista**: ni el encabezado, ni un cero, solo los botones; sin botones tampoco, nada.
 */
export function SeccionMejoramiento({
  seccion,
  consolidado,
  className = "",
}: {
  seccion: SeccionDeCitas;
  /** El SGC-FO-14 consolidado del proceso en el año en curso, solo a quien lo imprime (anexo §5.5). */
  consolidado?: string | null;
  className?: string;
}) {
  const { filas, hayMas, verTodos, boton } = seccion;
  const botones =
    boton || consolidado ? (
      <div className="flex flex-wrap items-center gap-2">
        {consolidado ? (
          <Link href={consolidado} prefetch={false} className={`${claseBoton("secundario", "sm")} ${FOCO}`}>
            <Printer aria-hidden="true" className="size-4" />
            SGC-FO-14 del proceso
          </Link>
        ) : null}
        {boton ? (
          <Link href={boton.href} className={`${claseBoton("secundario", "sm")} ${FOCO}`}>
            {boton.texto === "Reportar" ? <Megaphone aria-hidden="true" className="size-4" /> : <ClipboardCheck aria-hidden="true" className="size-4" />}
            {boton.texto}
          </Link>
        ) : null}
      </div>
    ) : null;

  if (filas.length === 0) return botones ? <div className={`print:hidden ${className}`}>{botones}</div> : null;

  return (
    <section aria-labelledby="seccion-mejoramiento" className={`flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="seccion-mejoramiento" className="text-sm font-semibold text-foreground">
          Mejoramiento
        </h2>
        {botones}
      </div>
      <ul className="flex list-none flex-col gap-2 text-sm">
        {filas.map((f) => (
          <li key={f.id} className="flex min-w-0 flex-col gap-1 border-l-2 border-mod-planes pl-3">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={rutaDeHallazgo(f.id)} className={`font-mono text-xs ${ENLACE}`}>
                {f.codigo}
              </Link>
              <span className="min-w-0 break-words">{f.titulo}</span>
              <Insignia variante={varianteDe(f)} modulo="planes">
                {f.etiqueta}
              </Insignia>
            </span>
            <span className="text-xs text-muted-foreground">{f.como}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {hayMas ? <span className="text-muted-foreground">Se muestran los diez primeros. </span> : null}
        <Link href={verTodos} className={ENLACE}>
          Ver todos
        </Link>
      </p>
    </section>
  );
}
