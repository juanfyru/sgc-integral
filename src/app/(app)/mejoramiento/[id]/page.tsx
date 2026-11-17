import type { Metadata } from "next";
import { Recorrido, type PasoDeRecorrido } from "@/componentes/mejoramiento/Recorrido";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { InsigniasDelHallazgo } from "@/componentes/mejoramiento/InsigniasDelHallazgo";
import { LoQueSigue } from "@/componentes/mejoramiento/LoQueSigue";
import { SeccionIdentificacion } from "@/componentes/mejoramiento/SeccionIdentificacion";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { diaCorto } from "@/lib/mejoramiento/formato";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { exigirSesion } from "@/lib/paginas";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirHallazgo } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hallazgo" };

/** Estados en que el hallazgo todavía espera su aceptación: la identificación queda abierta. */
const ESPERA_ACEPTACION = new Set(["por_aceptar", "rechazo", "arbitraje"]);

/** Los pasos del recorrido con la fecha de lo ya ocurrido que el historial permite decir. */
function pasosConFechas(h: DetalleDeHallazgo, zona: string): PasoDeRecorrido[] {
  const cuando = (tipo: string) => h.eventos.find((e) => e.tipo === tipo)?.cuando;
  const fechas: Record<string, Date | undefined> = {
    registro: h.registradoEn,
    aceptado: cuando("aceptar"),
    correccion: cuando("corregir"),
    cierre: h.cierre.cerradoEn ?? undefined,
  };
  return pasosDelRecorrido({
    id: h.id,
    codigo: h.codigo,
    clase: h.clase,
    criticidad: h.criticidad,
    origen: h.origen,
    estado: h.estado,
    ronda: h.ronda,
    procesoId: h.procesoId,
    reincidenteDe: h.reincidenteDe && "id" in h.reincidenteDe ? h.reincidenteDe.id : h.reincidenteDe ? -1 : null,
    correccionRequerida: h.correccion.requerida,
    accionRequerida: h.decision.accionRequerida,
    resultadoCierre: h.cierre.resultado,
    registradoPor: 0,
  }).map((p) => {
    const f = fechas[p.clave];
    return p.estado === "hecho" && f ? { ...p, nota: diaCorto(f, zona) } : p;
  });
}

/**
 * La página de un hallazgo (spec 15 §16.2, maqueta 2): el recorrido, la identificación, lo que sigue y el historial. Las
 * demás secciones (corrección, causa raíz, plan, ejecución, verificación, eficacia y cierre) las añaden las tareas 10 a 17.
 * Quien no lo ve recibe «no encontrado». Quien lo ve solo por una actividad (`ve: "actividad"`) no recibe el historial.
 */
export default async function PaginaHallazgo({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const h = await exigirHallazgo(sesion, id);
  const zona = zonaHoraria();
  const completo = h.ve === "completo";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: h.codigo }]}
        codigo={h.codigo}
        insignias={
          <>
            <InsigniasDelHallazgo clase={h.clase} criticidad={h.criticidad} marcas={h.marcas} />
            <Insignia variante="neutra">{h.etiqueta}</Insignia>
          </>
        }
        titulo={h.titulo}
        descripcion={`${h.proceso} · registró: ${h.registradoPor}`}
      />
      <Recorrido pasos={pasosConFechas(h, zona)} />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <SeccionIdentificacion hallazgo={h} zona={zona} abierta={ESPERA_ACEPTACION.has(h.estado)} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <LoQueSigue texto={h.loQueSigue} />
          {completo ? <HistorialDelHallazgo eventos={h.eventos} zona={zona} /> : null}
        </div>
      </div>
    </div>
  );
}
