import type { Metadata } from "next";
import Link from "next/link";
import {
  aceptarHallazgoAccion,
  anularHallazgoAccion,
  arbitrarHallazgoAccion,
  arbitrarHallazgoGerenciaAccion,
  cambiarProcesoAccion,
  decidirAccionCorrectivaAccion,
  decidirAccionCorrectivaGerenciaAccion,
  devolverCorreccionAccion,
  rechazarHallazgoAccion,
  reclasificarHallazgoAccion,
  registrarCorreccionAccion,
  registrarOcurrenciaAccion,
  retirarHallazgoAccion,
  sostenerHallazgoAccion,
  validarCorreccionAccion,
} from "@/app/acciones-mejoramiento";
import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import { AnalisisEnLectura } from "@/componentes/mejoramiento/analisis/AnalisisEnLectura";
import { PlanEnLectura, type IndicadorEnLectura } from "@/componentes/mejoramiento/plan/PlanEnLectura";
import { DialogoCambiarProceso } from "@/componentes/mejoramiento/DialogoCambiarProceso";
import { DialogoAnular } from "@/componentes/mejoramiento/DialogoAnular";
import { DialogoReclasificar } from "@/componentes/mejoramiento/DialogoReclasificar";
import { Ocurrencias } from "@/componentes/mejoramiento/Ocurrencias";
import { PasoAceptar } from "@/componentes/mejoramiento/pasos/PasoAceptar";
import { PasoArbitrar } from "@/componentes/mejoramiento/pasos/PasoArbitrar";
import { PasoCorregir } from "@/componentes/mejoramiento/pasos/PasoCorregir";
import { PasoDecidir } from "@/componentes/mejoramiento/pasos/PasoDecidir";
import { PasoTrasRechazo } from "@/componentes/mejoramiento/pasos/PasoTrasRechazo";
import { PasoValidar } from "@/componentes/mejoramiento/pasos/PasoValidar";
import { Recorrido, type PasoDeRecorrido } from "@/componentes/mejoramiento/Recorrido";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { InsigniasDelHallazgo } from "@/componentes/mejoramiento/InsigniasDelHallazgo";
import { LoQueSigue } from "@/componentes/mejoramiento/LoQueSigue";
import { SeccionCorreccion } from "@/componentes/mejoramiento/SeccionCorreccion";
import { SeccionIdentificacion } from "@/componentes/mejoramiento/SeccionIdentificacion";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerSql } from "@/db/cliente";
import { puedeFormular } from "@/db/consultas/mejoramiento/analisis";
import { archivosDe, archivosQuitables, autorizarSubida } from "@/db/consultas/mejoramiento/archivos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { indicadorDeEficacia } from "@/db/consultas/mejoramiento/indicador-de-eficacia";
import type { DetalleDeHallazgo, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import {
  cerradosDelProceso,
  documentosVigentesVisibles,
  normasQueRigen,
  procesosDelAlcance,
  usuariosActivos,
} from "@/db/consultas/mejoramiento/opciones";
import { examinarPlan } from "@/db/consultas/mejoramiento/plan";
import { ofreceRechazo, puedeExigirLaAccion } from "@/db/consultas/mejoramiento/recorrido";
import { puedeVerIndicador } from "@/lib/alcance";
import { seccionesDeLaRonda } from "@/lib/mejoramiento/secciones";
import { diaCorto } from "@/lib/mejoramiento/formato";
import { rutaDeFormular } from "@/lib/mejoramiento/rutas";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { TERMINALES } from "@/lib/mejoramiento/tipos";
import { DESDE } from "@/lib/mejoramiento/transiciones";
import { exigirSesion } from "@/lib/paginas";
import type { SesionValida } from "@/lib/sesion";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirHallazgo } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hallazgo" };

/** Estados en que el hallazgo todavía espera su aceptación: la identificación queda abierta. */
const ESPERA_ACEPTACION = new Set(["por_aceptar", "rechazo", "arbitraje"]);
/** Estados en que la corrección (y su decisión) es la etapa en curso: «2. Corrección» queda abierta. */
const EN_LA_CORRECCION = new Set(["por_corregir", "por_decidir", "por_validar"]);

/** Los pasos del recorrido con la fecha de lo ya ocurrido que el historial permite decir. */
function pasosConFechas(h: DetalleDeHallazgo, zona: string): PasoDeRecorrido[] {
  const cuando = (tipo: string) => h.eventos.find((e) => e.tipo === tipo)?.cuando;
  const fechas: Record<string, Date | undefined> = {
    registro: h.registradoEn,
    aceptado: cuando("aceptar") ?? cuando("confirmar_hallazgo"),
    correccion: h.correccion.registradaEn ?? undefined,
    decision: h.decision.decididaEn ?? undefined,
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

/** El texto que un evento guarda en esa clave de su detalle (la justificación del rechazo, la réplica, la nota). */
function textoDelEvento(e: DetalleDeHallazgo["eventos"][number] | undefined, clave: string): string | null {
  const d = e?.detalle;
  if (typeof d !== "object" || d === null) return null;
  const v = (d as Record<string, unknown>)[clave];
  return typeof v === "string" && v !== "" ? v : null;
}

/** Estados en que el plan de la ronda en curso es la etapa en curso: «4. Plan de acción» queda abierta. */
const EN_EL_PLAN = new Set(["por_formular", "en_revision", "en_aprobacion", "en_ejecucion"]);
/** Estados con el plan de la ronda en curso sin aprobar: la sección dice desde cuándo se podría evaluar con sus fechas. */
const PLAN_SIN_APROBAR = new Set(["por_formular", "en_revision", "en_aprobacion"]);

/** El indicador enlazado al criterio de la ronda, nombrado solo a quien lo ve (spec §11.2); a los demás, «un indicador». */
async function indicadorParaQuienLee(r: RondaDeDetalle, sesion: SesionValida): Promise<IndicadorEnLectura> {
  if (r.indicadorEficaciaId === null) return null;
  const sql = obtenerSql();
  const [ind, ve] = await Promise.all([indicadorDeEficacia(sql, r.indicadorEficaciaId), puedeVerIndicador(r.indicadorEficaciaId, sesion, { sql })]);
  if (!ind) return null;
  return ve ? { visible: true, codigo: ind.codigo, nombre: ind.nombre, periodicidad: ind.periodicidad } : { visible: false };
}

/** El último evento de alguno de esos tipos. */
const ultimoDe = (h: DetalleDeHallazgo, tipos: string[]) => h.eventos.findLast((e) => tipos.includes(e.tipo));

/**
 * La página de un hallazgo (spec 15 §16.2, maqueta 2): el recorrido, la identificación, la corrección, lo que sigue (con el
 * formulario del paso a quien puede darlo) y el historial. Las demás secciones (causa raíz, plan, ejecución, verificación,
 * eficacia y cierre) las añaden las tareas 11 a 17. Quien no lo ve recibe «no encontrado». Quien lo ve solo por una
 * actividad (`ve: "actividad"`) no recibe el historial ni los archivos.
 */
export default async function PaginaHallazgo({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const h = await exigirHallazgo(sesion, id);
  const zona = zonaHoraria();
  const hoy = fechaEnZona(new Date(), zona);
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
        const nota = e.tipo === "reclasificar" ? textoDelEvento(e, "nota") : null;
        return nota ? [{ cuando: e.cuando, nota }] : [];
      })
    : [];
  const clave = `${h.estado}-${h.eventos.length}`;

  // Los archivos del hallazgo: solo para quien lo ve completo; el servidor decide cada subida.
  const sqlArchivos = obtenerSql();
  const dueno = { contexto: "mejora_hallazgo", contextoId: h.id } as const;
  const archivos = completo ? await archivosDe(sqlArchivos, sesion, dueno) : [];
  const evidencias = archivos.filter((a) => a.rol === "evidencia");
  const puedeSubirEvidencia = completo && (await autorizarSubida(sesion, { contexto: "mejora_hallazgo", id: h.id, rol: "evidencia" })).ok;
  const quitables = await archivosQuitables(sqlArchivos, sesion, evidencias, dueno);

  // «2. Corrección», desde que la no conformidad está por corregir (las etapas que faltan no aparecen). Una corrección ya
  // registrada se sigue viendo aunque el hallazgo deje de ser no conformidad: queda como historia (spec §7.6).
  const conCorreccion = h.correccion.requerida !== null || (h.clase === "no_conformidad" && h.estado === "por_corregir");
  const correcciones = archivos.filter((a) => a.rol === "correccion");
  const puedeSubirCorreccion =
    completo && h.estado === "por_corregir" && (await autorizarSubida(sesion, { contexto: "mejora_hallazgo", id: h.id, rol: "correccion" })).ok;
  const quitablesDeCorreccion = conCorreccion ? await archivosQuitables(sqlArchivos, sesion, correcciones, dueno) : [];
  const ultimaDeLaCorreccion = ultimoDe(h, ["corregir", "devolver_correccion"]);
  const devuelta =
    h.estado === "por_corregir" && ultimaDeLaCorreccion?.tipo === "devolver_correccion" ? textoDelEvento(ultimaDeLaCorreccion, "nota") : null;

  // El formulario del paso, a quien puede darlo (la regla del acto la repite el servidor).
  const sigue = h.loQueSigue;
  const puedeExigir = completo && puedeExigirLaAccion(sesion, h);
  const conFormulario = completo && !terminado && (sigue.puede || puedeExigir);
  const usuarios = conFormulario && sigue.paso === "corregir" ? await usuariosActivos() : [];
  const comoGerencia = sesion.rol === "gerencia";
  const rechaza =
    conFormulario &&
    sigue.paso === "aceptar" &&
    (await ofreceRechazo(obtenerSql(), sesion, { registradoPor: h.registradoPorId, procesoId: h.procesoId, origen: h.origen }));
  // «Por formular» no tiene formulario aquí: la causa raíz y el plan se formulan en su propia página.
  const formulaAqui = completo && h.estado === "por_formular" && (await puedeFormular(obtenerSql(), sesion, { procesoId: h.procesoId }));
  const formulario = formulaAqui ? (
    <Link href={rutaDeFormular(h.id)} className={claseBoton("primario")}>
      Formular el análisis y el plan
    </Link>
  ) : !conFormulario ? null : sigue.paso === "aceptar" ? (
    <PasoAceptar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      puedeRechazar={rechaza}
      aceptar={aceptarHallazgoAccion}
      rechazar={rechazarHallazgoAccion}
    />
  ) : sigue.paso === "tras_rechazo" ? (
    <PasoTrasRechazo
      key={`paso-${clave}`}
      hallazgoId={h.id}
      justificacion={textoDelEvento(ultimoDe(h, ["rechazar"]), "justificacion")}
      enSuLugar={h.registradoPorId !== sesion.usuarioId}
      retirar={retirarHallazgoAccion}
      sostener={sostenerHallazgoAccion}
    />
  ) : sigue.paso === "arbitrar" ? (
    <PasoArbitrar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      justificacion={textoDelEvento(ultimoDe(h, ["rechazar"]), "justificacion")}
      replica={textoDelEvento(ultimoDe(h, ["sostener"]), "replica")}
      hoy={hoy}
      accion={comoGerencia ? arbitrarHallazgoGerenciaAccion : arbitrarHallazgoAccion}
    />
  ) : sigue.paso === "corregir" ? (
    <PasoCorregir key={`paso-${clave}`} hallazgoId={h.id} usuarios={usuarios} hoy={hoy} accion={registrarCorreccionAccion} />
  ) : sigue.paso === "decidir" ? (
    <PasoDecidir key={`paso-${clave}`} hallazgoId={h.id} hoy={hoy} accion={decidirAccionCorrectivaAccion} />
  ) : sigue.paso === "validar" ? (
    <PasoValidar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      sinAccion={h.correccion.requerida === false}
      puedeValidar={sigue.puede}
      puedeExigir={puedeExigir}
      hoy={hoy}
      validar={validarCorreccionAccion}
      devolver={devolverCorreccionAccion}
      exigir={comoGerencia ? decidirAccionCorrectivaGerenciaAccion : decidirAccionCorrectivaAccion}
    />
  ) : null;

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
          <SeccionIdentificacion hallazgo={h} zona={zona} abierta={ESPERA_ACEPTACION.has(h.estado)} notas={notas}>
            {completo ? (
              <ArchivosDe
                archivos={evidencias}
                quitables={quitables}
                direccionDeSubida={puedeSubirEvidencia ? `/api/mejoramiento/hallazgos/${h.id}/archivos` : null}
                nombre="Zona de carga de las evidencias del hallazgo"
                vacio="Sin evidencias adjuntas."
              />
            ) : null}
          </SeccionIdentificacion>
          {conCorreccion ? (
            <SeccionCorreccion
              correccion={h.correccion}
              decision={h.decision}
              zona={zona}
              abierta={EN_LA_CORRECCION.has(h.estado)}
              archivos={completo ? correcciones.length : null}
              devuelta={devuelta}
            >
              {completo ? (
                <ArchivosDe
                  archivos={correcciones}
                  quitables={quitablesDeCorreccion}
                  direccionDeSubida={puedeSubirCorreccion ? `/api/mejoramiento/hallazgos/${h.id}/archivos?rol=correccion` : null}
                  nombre="Zona de carga de la evidencia de la corrección"
                  vacio="Sin evidencia de la corrección."
                />
              ) : null}
            </SeccionCorreccion>
          ) : null}
          {await Promise.all(
            h.rondas.map(async (r) => {
              const enCurso = r.numero === h.ronda;
              // La causa raíz y el plan se leen en texto también por quien solo es responsable de una actividad (spec §6.3).
              const secciones = seccionesDeLaRonda(h, r);
              const conAnalisis = secciones.causaRaiz;
              const conPlan = secciones.plan;
              // Los adjuntos del análisis son de la ronda: quien revisa y quien aprueba los leen aquí; solo quien ve completo.
              const adjuntos = secciones.adjuntos
                ? (await archivosDe(sqlArchivos, sesion, { contexto: "mejora_ronda", contextoId: r.id })).filter((a) => a.rol === "analisis")
                : [];
              const evaluableDesde =
                conPlan && enCurso && r.estadoPlan !== "aprobado" && PLAN_SIN_APROBAR.has(h.estado)
                  ? (await examinarPlan(sqlArchivos, h.id, await contextoDeMejora(sqlArchivos, new Date()))).evaluableDesde
                  : null;
              return (
                <div key={`ronda-${r.id}`} className="contents">
                  {conAnalisis ? (
                    <AnalisisEnLectura
                      ronda={r}
                      titulo={enCurso ? "3. Causa raíz" : `3. Causa raíz (ronda ${r.numero})`}
                      abierta={enCurso && h.estado === "por_formular"}
                    >
                      {adjuntos.length > 0 ? (
                        <div className="flex flex-col gap-2 border-t border-linea-suave pt-3">
                          <h3 className="text-sm font-semibold">Adjuntos del análisis</h3>
                          <ArchivosDe archivos={adjuntos} nombre="Adjuntos del análisis" />
                        </div>
                      ) : null}
                    </AnalisisEnLectura>
                  ) : null}
                  {conPlan ? (
                    <PlanEnLectura
                      ronda={r}
                      titulo={enCurso ? "4. Plan de acción" : `4. Plan de acción (ronda ${r.numero})`}
                      abierta={enCurso && EN_EL_PLAN.has(h.estado)}
                      indicador={await indicadorParaQuienLee(r, sesion)}
                      evaluableDesde={evaluableDesde}
                      hoy={hoy}
                    />
                  ) : null}
                </div>
              );
            }),
          )}
          {completo ? (
            <Ocurrencias
              key={`ocurrencias-${h.ocurrencias.length}`}
              hallazgoId={h.id}
              ocurrencias={h.ocurrencias}
              puedeAnadir={!terminado && puede(sesion, "mejora.registrar")}
              hoy={hoy}
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
          <LoQueSigue texto={sigue.turno}>{formulario}</LoQueSigue>
          {completo ? <HistorialDelHallazgo eventos={h.eventos} zona={zona} /> : null}
        </div>
      </div>
    </div>
  );
}
