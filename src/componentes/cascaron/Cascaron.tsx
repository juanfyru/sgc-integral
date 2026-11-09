import { after } from "next/server";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { contarNoLeidas, listarRecientes } from "@/db/consultas/notificaciones";
import { esResponsableDePuntos } from "@/db/consultas/distribucion/puntos-uso";
import { participaEnTramites } from "@/db/consultas/tramites";
import { esResponsableTecnico } from "@/db/consultas/vigencia/externos";
import { ETIQUETA_ROL } from "@/lib/roles";
import type { SesionValida } from "@/lib/sesion";
import { misTareas } from "@/lib/tareas";
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
  // El responsable técnico de un externo ve «Vigencia» aunque sea de rol Consulta. Es una marca de la barra: si no se
  // puede saber, se registra y la página sigue sin la entrada.
  const responsableTecnico = esResponsableTecnico(sesion.usuarioId).catch((err: unknown) => {
    console.error("No se pudo saber si la persona es responsable técnico de algún externo:", err);
    return false;
  });
  const [marca, { total: tareas, vencidos }, noLeidas, recientes, participa, responsable, esResponsable] = await Promise.all([
    obtenerMarcaSegura(),
    // Las tareas y la insignia de «Vigencia» salen de la misma lectura de la vigencia.
    responsableTecnico.then((rt) => misTareas(sesion, { responsableTecnico: rt })),
    contarNoLeidas(sesion.usuarioId),
    listarRecientes(sesion.usuarioId, 10),
    participaEnTramites(sesion.usuarioId),
    esResponsableDePuntos(sesion.usuarioId),
    responsableTecnico,
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
      <BarraLateral marca={marcaBarra} entradas={entradas} tareas={tareas} vencidos={vencidos} version={VERSION_APP} />
      <div className="min-w-0">
        <BarraSuperior
          marca={marcaBarra}
          entradas={entradas}
          tareas={tareas}
          vencidos={vencidos}
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
