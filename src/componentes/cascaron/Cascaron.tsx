import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { contarNoLeidas, listarRecientes } from "@/db/consultas/notificaciones";
import { ETIQUETA_ROL } from "@/lib/roles";
import type { SesionValida } from "@/lib/sesion";
import { misTareas } from "@/lib/tareas";
import { VERSION_APP } from "@/lib/version";
import { BarraLateral } from "./BarraLateral";
import { BarraSuperior } from "./BarraSuperior";
import { Buscador } from "./Buscador";
import { MenuUsuario } from "./MenuUsuario";
import { entradasVisibles } from "./navegacion";

/**
 * Cromo de toda la app autenticada. Vive en el layout de (app): al navegar entre sus páginas
 * no se vuelve a montar, así que la barra lateral no parpadea.
 */
export async function Cascaron({ sesion, children }: { sesion: SesionValida; children: React.ReactNode }) {
  const [marca, tareas, noLeidas, recientes] = await Promise.all([
    obtenerMarcaSegura(),
    misTareas(sesion),
    contarNoLeidas(sesion.usuarioId),
    listarRecientes(sesion.usuarioId, 10),
  ]);
  const entradas = entradasVisibles(sesion);
  const logoUrl = marca.logo ? `/marca/logo?v=${marca.logo.version}` : null;
  const marcaBarra = { nombre: marca.nombre, sigla: marca.sigla, logoUrl };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <BarraLateral marca={marcaBarra} entradas={entradas} tareas={tareas.length} version={VERSION_APP} />
      <div className="min-w-0">
        <BarraSuperior
          marca={marcaBarra}
          entradas={entradas}
          tareas={tareas.length}
          version={VERSION_APP}
          // Marcador: la Tarea 10 pone la campana (con estas cifras).
          buscador={<Buscador entradas={entradas} />}
          campana={<div data-pendiente="campana" data-no-leidas={noLeidas} data-recientes={recientes.length} />}
          menuUsuario={<MenuUsuario nombre={sesion.nombre} etiquetaRol={ETIQUETA_ROL[sesion.rol]} tema={sesion.tema} />}
        />
        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 outline-none sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
