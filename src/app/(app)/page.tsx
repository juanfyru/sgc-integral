import { AcordeonMapa } from "@/componentes/mapa/AcordeonMapa";
import { MapaProcesos } from "@/componentes/mapa/MapaProcesos";
import { MisTareas } from "@/componentes/inicio/MisTareas";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerDatosMapa } from "@/db/consultas/mapa";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { MisProcesos } from "@/componentes/MisProcesos";
import { procesosAsignados } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
import { misTareas } from "@/lib/tareas";

// El mapa vive en BD: siempre se lee en el momento de la petición.
export const dynamic = "force-dynamic";

export default async function Inicio() {
  const sesion = await exigirSesion();
  const misProcesos = sesion.rol === "lider_proceso" ? await procesosAsignados(sesion.usuarioId) : null;
  const [datos, marca, tareas] = await Promise.all([
    obtenerDatosMapa(),
    obtenerMarcaSegura(),
    misTareas(sesion),
  ]);
  const { configuracion } = datos;

  return (
    <>
      <EncabezadoPagina
        superior={marca.nombre}
        titulo="Inicio"
        descripcion={configuracion.subtitulo_mapa ?? undefined}
      />

      <MisTareas tareas={tareas} />
      {misProcesos && <MisProcesos procesos={misProcesos} />}

      {/* Escritorio: el mapa completo por bandas. Mobile: acordeón (D9). */}
      <section aria-label="Mapa de procesos">
        <h2 className="sr-only">Mapa de procesos</h2>
        <div className="hidden lg:block">
          <MapaProcesos datos={datos} />
        </div>
        <div className="lg:hidden">
          <AcordeonMapa datos={datos} />
        </div>
      </section>
    </>
  );
}
