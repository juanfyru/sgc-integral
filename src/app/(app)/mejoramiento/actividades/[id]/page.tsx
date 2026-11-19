import type { Metadata } from "next";
import {
  pedirAjusteAccion,
  quitarEnlaceDeTramiteAccion,
  reasignarActividadAccion,
  registrarSeguimientoAccion,
  terminarActividadAccion,
} from "@/app/acciones-mejoramiento";
import { CambioDocumental } from "@/componentes/mejoramiento/actividad/CambioDocumental";
import { PaginaDeActividad } from "@/componentes/mejoramiento/actividad/PaginaDeActividad";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { archivosQuitables, autorizarSubida } from "@/db/consultas/mejoramiento/archivos";
import { usuariosActivos } from "@/db/consultas/mejoramiento/opciones";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { exigirSesion } from "@/lib/paginas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirActividad } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Actividad" };

/**
 * La página de una actividad (spec 15 §16.1 y §16.2, maqueta 6), pensada para el teléfono: la abren su responsable, quien
 * registró un seguimiento en ella y quien ve su hallazgo completo; los demás reciben «no encontrado» (`exigirActividad`). Su
 * responsable registra seguimientos, adjunta evidencia y la termina; un líder del proceso o el Admin SGC la reasignan; los tres
 * piden reprogramarla (spec §10.6). «Cambio documental» (Fase 15B, anexo §9, maqueta 7): sus trámites, y pedir o enlazar uno a quien
 * puede (`cambioDocumental` de la lectura).
 */
export default async function PaginaActividad({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const a = await exigirActividad(sesion, id);
  const sql = obtenerSql();
  const dueno = { contexto: "mejora_actividad", contextoId: a.id } as const;
  const [subida, quitables, usuarios] = await Promise.all([
    a.puedeSeguir ? autorizarSubida(sesion, { contexto: "mejora_actividad", id: a.id }) : null,
    archivosQuitables(sql, sesion, a.archivos, dueno),
    a.puedeReasignar ? usuariosActivos() : [],
  ]);
  const migas = a.esResponsable
    ? [{ nombre: "Mis actividades", href: "/mejoramiento/actividades" }, { nombre: `${a.hallazgo.codigo} · ${a.etiqueta}` }]
    : [
        { nombre: "Mejoramiento", href: "/mejoramiento" },
        { nombre: a.hallazgo.codigo, href: rutaDeHallazgo(a.hallazgo.id) },
        { nombre: a.etiqueta },
      ];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina migas={migas} codigo={`${a.hallazgo.codigo} · ${a.etiqueta}`} titulo={a.descripcion} />
      <PaginaDeActividad
        actividad={a}
        hoy={fechaEnZona(new Date(), zonaHoraria())}
        usuarios={usuarios}
        subida={subida?.ok ? `/api/mejoramiento/actividades/${a.id}/archivos` : null}
        quitables={quitables}
        cambioDocumental={
          <CambioDocumental
            actividadId={a.id}
            tramites={a.tramites}
            admite={a.cambioDocumental.admite}
            puedePedir={a.cambioDocumental.puedePedir}
            devueltaEn={a.devueltaEn}
            zona={zonaHoraria()}
            quitar={quitarEnlaceDeTramiteAccion}
          />
        }
        acciones={{
          seguimiento: registrarSeguimientoAccion,
          terminar: terminarActividadAccion,
          reasignar: reasignarActividadAccion,
          pedirAjuste: pedirAjusteAccion,
        }}
      />
    </div>
  );
}
