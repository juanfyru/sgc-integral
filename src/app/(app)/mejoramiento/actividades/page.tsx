import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { MisActividades } from "@/componentes/mejoramiento/actividad/MisActividades";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { misActividades } from "@/db/consultas/mejoramiento/actividades";
import { veAlgunHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { veAlgunPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { contarReportesPorClasificar } from "@/db/consultas/mejoramiento/reportes";
import { estaAbierta } from "@/lib/mejoramiento/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis actividades" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Mis actividades» (spec 15 §16.1), para toda sesión: las actividades de planes aprobados a cargo de la persona, cada una con
 * su hallazgo, su fin, su avance y su estado, y el enlace a su página. La pestaña «Hallazgos», con la regla de la lista
 * (`veAlgunHallazgo`): a quien no ve ninguno, la lista lo trae aquí.
 */
export default async function PaginaMisActividades() {
  const sesion = await exigirSesion();
  const ahora = new Date();
  const [actividades, veHallazgos, porClasificar, vePlanes] = await Promise.all([
    misActividades(sesion, { ahora }),
    veAlgunHallazgo(sesion),
    contarReportesPorClasificar(sesion),
    veAlgunPlan(sesion),
  ]);
  const pendientes = actividades.filter((a) => estaAbierta(a.estado)).length;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: "Mis actividades" }]}
        titulo="Mis actividades"
        descripcion={
          actividades.length > 0
            ? `${cuenta(pendientes, "actividad por hacer", "actividades por hacer")} · registre sus seguimientos y su evidencia en cada una.`
            : "Las actividades de los planes de acción que tiene a su cargo."
        }
        acciones={
          puede(sesion, "mejora.registrar") && !veHallazgos ? (
            <Link href="/mejoramiento/nuevo" className={`${claseBoton("secundario")} ${FOCO}`}>
              <Plus aria-hidden="true" className="size-4" />
              Registrar hallazgo
            </Link>
          ) : null
        }
      />
      <PestanasMejoramiento activa="actividades" visibles={pestanasVisibles(sesion, { veHallazgos, vePlanes })} numeros={{ reportes: porClasificar }} />
      <MisActividades actividades={actividades} hoy={fechaEnZona(ahora, zonaHoraria())} />
    </div>
  );
}
