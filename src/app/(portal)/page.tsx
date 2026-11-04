import { AcordeonMapa } from "@/componentes/mapa/AcordeonMapa";
import { MapaProcesos } from "@/componentes/mapa/MapaProcesos";
import { obtenerDatosMapa } from "@/db/consultas/mapa";
import { exigirSesion } from "@/lib/paginas";

// El mapa vive en BD: siempre se lee en el momento de la petición.
export const dynamic = "force-dynamic";

export default async function Inicio() {
  await exigirSesion();
  const datos = await obtenerDatosMapa();
  const { configuracion } = datos;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6 lg:mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-verde-texto">
          {configuracion.nombre_entidad ?? ""}
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-azul-tinta sm:text-4xl">
          Mapa de Procesos
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {configuracion.subtitulo_mapa ?? ""} · Seleccione un proceso para
          consultar sus documentos vigentes.
        </p>
      </header>

      {/* Escritorio: el mapa completo por bandas. Mobile: acordeón (D9). */}
      <main>
        <div className="hidden lg:block">
          <MapaProcesos datos={datos} />
        </div>
        <div className="lg:hidden">
          <AcordeonMapa datos={datos} />
        </div>
      </main>
    </div>
  );
}
