import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Database } from "lucide-react";
import { NuevoDato } from "@/componentes/indicadores/datos/FormularioDato";
import { TablaDeDatos } from "@/componentes/indicadores/datos/TablaDeDatos";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { indicadoresQueLoUsan, listarDatos, opcionesDeDato, pestanaDeDatos, resumenDeDatos } from "@/db/consultas/indicadores/datos";
import { asegurarPeriodosDeDatos } from "@/db/consultas/indicadores/datos-periodos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Datos compartidos" };

/**
 * «Datos compartidos» (anexo 14C, §4.7, maqueta 11): los datos que la persona ve (quien administra, Gerencia, Control Interno,
 * los líderes del proceso dueño y sus responsables), con su último valor, quién lo reportó, los indicadores que lo usan y que
 * ella ve, y su estado. Antes de leer abre los periodos que se piden de esos datos. Para quien no ve ningún dato ni administra
 * indicadores, no existe. Quien administra crea datos («Nuevo dato»).
 */
export default async function PaginaDatos() {
  const sesion = await exigirSesion();
  const administra = puede(sesion, "indicadores.administrar");
  const datos = await listarDatos(sesion);
  if (datos.length === 0 && !administra) notFound();
  const ids = datos.map((d) => d.id);
  await asegurarPeriodosDeDatos({ datoIds: ids });
  const [resumen, usan, pestana, opciones] = await Promise.all([
    resumenDeDatos(sesion, ids),
    indicadoresQueLoUsan(sesion, ids),
    pestanaDeDatos(sesion),
    administra ? opcionesDeDato(null) : null,
  ]);
  const filas = datos.map((dato) => ({ dato, resumen: resumen.get(dato.id), usan: usan.get(dato.id) ?? [] }));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo="Datos compartidos"
        descripcion={`${cuenta(datos.length, "dato", "datos")} · cada uno lo reporta una sola vez quien responde por él y lo toman los indicadores que lo usan.`}
        acciones={opciones ? <NuevoDato opciones={opciones} /> : null}
      />
      <PestanasIndicadores
        activa="datos"
        visibles={pestanasVisibles(sesion, { aprueba: apruebaFichas(sesion), veDatos: pestana.visible })}
        numeros={{ datos: pestana.porReportar }}
      />
      {filas.length === 0 ? (
        <EstadoVacio
          icono={Database}
          titulo="Aún no hay datos compartidos"
          texto="Cree el primero con «Nuevo dato»: lo reporta una sola vez quien responde por él y lo toman los indicadores que lo usan."
        />
      ) : (
        <TablaDeDatos filas={filas} ahora={new Date()} />
      )}
    </div>
  );
}
