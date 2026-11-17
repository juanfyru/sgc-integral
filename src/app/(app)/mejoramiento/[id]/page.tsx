import type { Metadata } from "next";
import Link from "next/link";
import { anularHallazgoAccion, cambiarProcesoAccion, reclasificarHallazgoAccion, registrarOcurrenciaAccion } from "@/app/acciones-mejoramiento";
import { DialogoCambiarProceso } from "@/componentes/mejoramiento/DialogoCambiarProceso";
import { DialogoAnular } from "@/componentes/mejoramiento/DialogoAnular";
import { DialogoReclasificar } from "@/componentes/mejoramiento/DialogoReclasificar";
import { Ocurrencias } from "@/componentes/mejoramiento/Ocurrencias";
import { Recorrido, type PasoDeRecorrido } from "@/componentes/mejoramiento/Recorrido";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { InsigniasDelHallazgo } from "@/componentes/mejoramiento/InsigniasDelHallazgo";
import { LoQueSigue } from "@/componentes/mejoramiento/LoQueSigue";
import { SeccionIdentificacion } from "@/componentes/mejoramiento/SeccionIdentificacion";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { cerradosDelProceso, documentosVigentesVisibles, normasQueRigen, procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { diaCorto } from "@/lib/mejoramiento/formato";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { TERMINALES } from "@/lib/mejoramiento/tipos";
import { DESDE } from "@/lib/mejoramiento/transiciones";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
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
  const terminado = TERMINALES.includes(h.estado);
  const gestiona = completo && !terminado && puede(sesion, "mejora.gestionar");
  // La identificación forma parte de lo firmado desde que se envía el plan de la ronda 1 (spec §7.6).
  const firmada = h.ronda > 1 || h.rondas.some((r) => r.numero === 1 && r.enviadoEn !== null);
  const reclasificable = gestiona && (DESDE.reclasificar as readonly string[]).includes(h.estado) && !firmada;
  const [normas, documentos, cerrados] = reclasificable
    ? await Promise.all([normasQueRigen(), documentosVigentesVisibles(sesion), cerradosDelProceso(h.procesoId, h.id)])
    : [[], [], []];
  const puedeEditar = completo && h.estado === "por_aceptar" && h.registradoPorId === sesion.usuarioId && puede(sesion, "mejora.registrar");
  const puedeCambiarProceso = gestiona && h.estado === "por_aceptar";
  const procesos = puedeCambiarProceso ? await procesosDelAlcance(sesion) : [];
  // Las notas que se añadieron al reclasificar: la descripción no se reescribe.
  const notas = completo
    ? h.eventos.flatMap((e) => {
        const nota = e.tipo === "reclasificar" && typeof e.detalle === "object" && e.detalle !== null ? (e.detalle as { nota?: unknown }).nota : undefined;
        return typeof nota === "string" && nota !== "" ? [{ cuando: e.cuando, nota }] : [];
      })
    : [];
  const clave = `${h.estado}-${h.eventos.length}`;

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
          <SeccionIdentificacion hallazgo={h} zona={zona} abierta={ESPERA_ACEPTACION.has(h.estado)} notas={notas} />
          {completo ? (
            <Ocurrencias
              key={`ocurrencias-${h.ocurrencias.length}`}
              hallazgoId={h.id}
              ocurrencias={h.ocurrencias}
              puedeAnadir={!terminado && puede(sesion, "mejora.registrar")}
              hoy={fechaEnZona(new Date(), zona)}
              accion={registrarOcurrenciaAccion}
            />
          ) : null}
          {puedeEditar || gestiona ? (
            <div className="flex flex-wrap gap-2">
              {puedeEditar ? (
                <Link href={`/mejoramiento/${h.id}/editar`} className={claseBoton("secundario")}>
                  Editar
                </Link>
              ) : null}
              {puedeCambiarProceso ? (
                <DialogoCambiarProceso
                  key={`proceso-${clave}`}
                  hallazgoId={h.id}
                  codigo={h.codigo}
                  procesoActualId={h.procesoId}
                  procesos={procesos}
                  accion={cambiarProcesoAccion}
                />
              ) : null}
              {reclasificable ? (
                <DialogoReclasificar
                  key={`reclasificar-${clave}`}
                  datos={{
                    hallazgoId: h.id,
                    codigo: h.codigo,
                    clase: h.clase,
                    criticidad: h.criticidad,
                    origen: h.origen,
                    fuente: h.fuente,
                    referenciaCaso: h.referenciaCaso,
                    titulo: h.titulo,
                    requisitoClausula: h.requisitoClausula,
                    requisitoNormaId: h.requisitoNormaId,
                    requisitoDocumentoId: h.requisitoDocumentoId,
                    reincidenteDeId: h.reincidenteDe && "id" in h.reincidenteDe ? h.reincidenteDe.id : null,
                    fechaLimiteEnte: h.fechaLimiteEnte,
                  }}
                  normas={normas}
                  documentos={documentos}
                  cerrados={cerrados}
                  accion={reclasificarHallazgoAccion}
                />
              ) : null}
              {gestiona ? <DialogoAnular key={`anular-${clave}`} hallazgoId={h.id} codigo={h.codigo} accion={anularHallazgoAccion} /> : null}
            </div>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <LoQueSigue texto={h.loQueSigue} />
          {completo ? <HistorialDelHallazgo eventos={h.eventos} zona={zona} /> : null}
        </div>
      </div>
    </div>
  );
}
