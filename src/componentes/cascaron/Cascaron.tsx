import { after } from "next/server";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { contarNoLeidas, listarRecientes } from "@/db/consultas/notificaciones";
import { esResponsableDePuntos } from "@/db/consultas/distribucion/puntos-uso";
import { participaEnTramites } from "@/db/consultas/tramites";
import { ETIQUETA_ROL } from "@/lib/roles";
import type { SesionValida } from "@/lib/sesion";
import { tareasDePeticion } from "@/lib/tareas-peticion";
import { dispararRevisionDeVencimientos } from "@/lib/vencimientos-disparo";
import { VERSION_APP } from "@/lib/version";
import { BarraLateral } from "./BarraLateral";
import { BarraSuperior } from "./BarraSuperior";
import { Buscador } from "./Buscador";
import { Campana } from "./Campana";
import { MenuUsuario } from "./MenuUsuario";
import { entradasVisibles } from "./navegacion";

/**
 * Cromo de toda la app autenticada. Vive en el layout de (app): al navegar entre sus páginas
 * no se vuelve a montar, así que la barra lateral no parpadea.
 */
export async function Cascaron({ sesion, children }: { sesion: SesionValida; children: React.ReactNode }) {
  after(() => dispararRevisionDeVencimientos());
  // Las tareas y las insignias de «Vigencia» y de «Indicadores» salen de la misma lectura, compartida con la página de
  // la misma petición (`tareasDePeticion`). El responsable técnico de un externo ve «Vigencia» aunque sea de rol Consulta:
  // es una marca de la barra que viene con las tareas (si no se puede saber, se registra y la página sigue sin ella).
  const [
    marca,
    { total: tareas, vencidos, vencidasIndicadores, responsableTecnico: esResponsable },
    noLeidas,
    recientes,
    participa,
    responsable,
  ] = await Promise.all([
    obtenerMarcaSegura(),
    tareasDePeticion(sesion),
    contarNoLeidas(sesion.usuarioId),
    listarRecientes(sesion.usuarioId, 10),
    participaEnTramites(sesion.usuarioId),
    esResponsableDePuntos(sesion.usuarioId),
  ]);
  const entradas = entradasVisibles({
    ...sesion,
    participaEnTramites: participa,
    responsableDePuntos: responsable,
    responsableTecnico: esResponsable,
  });
  const logoUrl = marca.logo ? `/marca/logo?v=${marca.logo.version}` : null;
  const marcaBarra = { nombre: marca.nombre, sigla: marca.sigla, logoUrl };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] print:block! print:min-h-0">
      <BarraLateral
        marca={marcaBarra}
        entradas={entradas}
        tareas={tareas}
        vencidos={vencidos}
        vencidasIndicadores={vencidasIndicadores}
        version={VERSION_APP}
      />
      <div className="min-w-0">
        <BarraSuperior
          marca={marcaBarra}
          entradas={entradas}
          tareas={tareas}
          vencidos={vencidos}
          vencidasIndicadores={vencidasIndicadores}
          version={VERSION_APP}
          buscador={<Buscador entradas={entradas} />}
          campana={<Campana noLeidas={noLeidas} recientes={recientes} />}
          menuUsuario={<MenuUsuario nombre={sesion.nombre} etiquetaRol={ETIQUETA_ROL[sesion.rol]} tema={sesion.tema} />}
        />
        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 outline-none sm:px-6 lg:py-8 print:max-w-none print:px-0! print:py-0!">
          {children}
        </main>
      </div>
    </div>
  );
}
