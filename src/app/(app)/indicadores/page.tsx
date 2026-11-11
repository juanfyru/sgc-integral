import type { Metadata } from "next";
import Link from "next/link";
import { Gauge, Plus } from "lucide-react";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import { fichasPorAprobar } from "@/db/consultas/indicadores/aprobacion";
import { listarIndicadoresBasico, type FilaIndicadorBasica } from "@/db/consultas/indicadores/fichas";
import type { EstadoIndicador } from "@/lib/indicadores/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { rutaDeIndicador } from "./_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Indicadores" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const ESTADO: Record<EstadoIndicador, { etiqueta: string; variante: VarianteInsignia }> = {
  borrador: { etiqueta: "Borrador", variante: "atencion" },
  activo: { etiqueta: "Activo", variante: "neutra" },
  retirado: { etiqueta: "Retirado", variante: "sin-dato" },
  descartado: { etiqueta: "Descartado", variante: "sin-dato" },
};

/** Un cambio en curso sobre una ficha aprobada, para quien administra. */
function cambioEnCurso(f: FilaIndicadorBasica): string | null {
  if (f.estado !== "activo") return null;
  if (f.versionEstado === "borrador") return "Cambio en borrador";
  if (f.versionEstado === "por_aprobar") return "Cambio por aprobar";
  return null;
}

const COLUMNAS = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "estado", etiqueta: "Estado" },
];

/**
 * «Indicadores» (spec §12.1 y §12.2), para toda persona con sesión: por ahora la lista básica de lo que la persona ve.
 * Quien administra ve además los borradores y crea indicadores. La Tarea 15 trae la lista completa.
 */
export default async function PaginaIndicadores() {
  const sesion = await exigirSesion();
  const administra = puede(sesion, "indicadores.administrar");
  const aprueba = apruebaFichas(sesion);
  const [filas, porAprobar] = await Promise.all([listarIndicadoresBasico(sesion), aprueba ? fichasPorAprobar(sesion) : []]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo="Indicadores"
        descripcion="Los indicadores de los procesos, con su ficha técnica."
        acciones={
          administra ? (
            <Link href="/indicadores/nuevo" className={`${claseBoton("primario")} ${FOCO}`}>
              <Plus aria-hidden="true" className="size-4" />
              Nuevo indicador
            </Link>
          ) : undefined
        }
      />
      <PestanasIndicadores activa="lista" visibles={pestanasVisibles(sesion, { aprueba })} numeros={{ "por-aprobar": porAprobar.length }} />
      {filas.length === 0 ? (
        <EstadoVacio
          icono={Gauge}
          titulo="Aún no hay indicadores"
          texto={administra ? "Cree el primero con su ficha técnica: se guarda en borrador hasta que se apruebe." : "Cuando se aprueben indicadores que usted pueda ver, aparecerán aquí."}
          accion={administra ? { href: "/indicadores/nuevo", etiqueta: "Nuevo indicador" } : undefined}
        />
      ) : (
        <TablaDatos titulo="Indicadores" columnas={COLUMNAS} filas={filas.length} vacio="Sin indicadores.">
          {filas.map((f) => {
            const cambio = administra ? cambioEnCurso(f) : null;
            return (
              <tr key={f.id}>
                <td className={`${celda} whitespace-nowrap font-mono text-xs`}>{f.codigo}</td>
                <td className={celda}>
                  <Link href={rutaDeIndicador(f.codigo)} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                    {f.nombre || "(sin nombre)"}
                  </Link>
                </td>
                <td className={celda}>{f.proceso}</td>
                <td className={celda}>
                  <span className="flex flex-wrap gap-1">
                    <Insignia variante={ESTADO[f.estado].variante}>{ESTADO[f.estado].etiqueta}</Insignia>
                    {cambio ? <Insignia variante="atencion">{cambio}</Insignia> : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </TablaDatos>
      )}
    </div>
  );
}
