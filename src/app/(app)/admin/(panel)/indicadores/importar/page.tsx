import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { ESTADO_DE_LOTE } from "@/componentes/indicadores/importacion/estados";
import { SubirPlantilla } from "@/componentes/indicadores/importacion/SubirPlantilla";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import { lotesRecientes } from "@/db/consultas/indicadores/importacion";
import { fechaYHora } from "@/lib/indicadores/ficha-en-texto";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Importar indicadores — Administración SGC" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Una descarga, no una página: va con `<a>` y no con `<Link>` (no se precarga ni navega en el cliente). */
const RUTA_DE_LA_PLANTILLA = "/admin/indicadores/importar/plantilla";

const COLUMNAS = [
  { clave: "lote", etiqueta: "Importación" },
  { clave: "archivo", etiqueta: "Plantilla" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "fichas", etiqueta: "Fichas" },
  { clave: "cargo", etiqueta: "Cargada por" },
];

/** «Importar indicadores» (spec 14A §5.3): la plantilla, «Nueva importación» y los lotes recientes con su estado. */
export default async function PaginaImportarIndicadores() {
  const sesion = await exigirPermiso("indicadores.administrar");
  const lotes = await lotesRecientes(sesion);
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina
        titulo="Importar indicadores"
        descripcion="Cargue de una vez las fichas que el hospital aprobó antes de SGC Integral: una plantilla en Excel, una vista previa y la clave de quien importa."
        migas={[{ nombre: "Configuración de indicadores", href: "/admin/indicadores" }, { nombre: "Importar indicadores" }]}
      />
      <section className="flex flex-col items-start gap-3" aria-labelledby="titulo-plantilla">
        <h2 id="titulo-plantilla" className="font-display text-lg font-semibold">
          La plantilla
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Una hoja con una fila por indicador, sus instrucciones y las listas de los maestros y del mapa de hoy.
        </p>
        <a href={RUTA_DE_LA_PLANTILLA} className={claseBoton("secundario")}>
          Descargar la plantilla
        </a>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="titulo-nueva">
        <h2 id="titulo-nueva" className="font-display text-lg font-semibold">
          Nueva importación
        </h2>
        <SubirPlantilla />
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="titulo-lotes">
        <h2 id="titulo-lotes" className="font-display text-lg font-semibold">
          Importaciones recientes
        </h2>
        {lotes.length === 0 ? (
          <EstadoVacio icono={FileSpreadsheet} titulo="Aún no hay importaciones" texto="Descargue la plantilla, llénela y súbala en «Nueva importación»." />
        ) : (
          <TablaDatos titulo="Importaciones recientes" columnas={COLUMNAS} filas={lotes.length} vacio="Aún no hay importaciones">
            {lotes.map((l) => (
              <tr key={l.id}>
                <td className={celda}>
                  <Link href={`/admin/indicadores/importar/${l.id}`} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                    {`Importación n.º ${l.id}`}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{fechaYHora(l.cargadoEn)}</span>
                </td>
                <td className={`${celda} break-words`}>{l.archivo ?? "—"}</td>
                <td className={celda}>
                  <Insignia variante={ESTADO_DE_LOTE[l.estado].variante}>{ESTADO_DE_LOTE[l.estado].texto}</Insignia>
                </td>
                <td className={celda}>
                  {l.estado === "importado" || l.estado === "deshecho" ? `${l.aprobadas} aprobadas, ${l.borradores} en borrador` : "—"}
                </td>
                <td className={celda}>{l.cargadoPor}</td>
              </tr>
            ))}
          </TablaDatos>
        )}
      </section>
    </div>
  );
}
