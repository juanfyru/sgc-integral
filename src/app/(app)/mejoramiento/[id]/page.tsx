import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import {
  aceptarHallazgoAccion,
  anularHallazgoAccion,
  aprobarPlanAccion,
  arbitrarHallazgoAccion,
  cambiarDePlanAccion,
  cerrarHallazgoAccion,
  arbitrarHallazgoGerenciaAccion,
  cambiarProcesoAccion,
  decidirAccionCorrectivaAccion,
  decidirAccionCorrectivaGerenciaAccion,
  decidirAjusteAccion,
  decidirAjusteGerenciaAccion,
  devolverCorreccionAccion,
  devolverPlanAccion,
  devolverPlanGerenciaAccion,
  escalarAGerenciaAccion,
  evaluarEficaciaAccion,
  firmarRevisionAccion,
  pedirAjusteAccion,
  ponerEnPlanAccion,
  ponerObjetivoAccion,
  reasignarActividadAccion,
  rechazarHallazgoAccion,
  reclasificarHallazgoAccion,
  registrarCorreccionAccion,
  registrarOcurrenciaAccion,
  registrarRespuestaAlEnteAccion,
  responderEscaladaAccion,
  retirarHallazgoAccion,
  sacarDelPlanAccion,
  sostenerHallazgoAccion,
  validarCorreccionAccion,
  verificarImplementacionAccion,
} from "@/app/acciones-mejoramiento";
import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import { DialogoReasignar } from "@/componentes/mejoramiento/actividad/DialogoReasignar";
import { AjustesDelPlan, fraseDeAjusteDeDetalle, lineasDeLoQueSeAnade } from "@/componentes/mejoramiento/ajustes/AjustesDelPlan";
import { DialogoAjusteDelPlan } from "@/componentes/mejoramiento/ajustes/DialogoPedirAjuste";
import { DialogoEscalar, DialogoResponderEscalada } from "@/componentes/mejoramiento/ajustes/DialogoEscalar";
import { PasoDecidirAjuste } from "@/componentes/mejoramiento/ajustes/PasoDecidirAjuste";
import { AnalisisEnLectura } from "@/componentes/mejoramiento/analisis/AnalisisEnLectura";
import { LaVezPasada } from "@/componentes/mejoramiento/analisis/LaVezPasada";
import { PanelDeFirmas, firmasDelEnvio } from "@/componentes/mejoramiento/plan/PanelDeFirmas";
import { ParecidosDeOtrosProcesos } from "@/componentes/mejoramiento/plan/ParecidosDeOtrosProcesos";
import { PasoAprobar } from "@/componentes/mejoramiento/plan/PasoAprobar";
import { DevolverPlan, PasoRevisar } from "@/componentes/mejoramiento/plan/PasoRevisar";
import { PlanEnLectura } from "@/componentes/mejoramiento/plan/PlanEnLectura";
import { DialogoCambiarProceso } from "@/componentes/mejoramiento/DialogoCambiarProceso";
import { DialogoAnular } from "@/componentes/mejoramiento/DialogoAnular";
import { DialogoReclasificar } from "@/componentes/mejoramiento/DialogoReclasificar";
import { BorradorDeLaEvaluacion } from "@/componentes/mejoramiento/BorradorDeLaEvaluacion";
import { EnlacesDelHallazgo } from "@/componentes/mejoramiento/EnlacesDelHallazgo";
import { FechasDelHallazgo } from "@/componentes/mejoramiento/FechasDelHallazgo";
import { Ocurrencias } from "@/componentes/mejoramiento/Ocurrencias";
import { RondaAnterior } from "@/componentes/mejoramiento/RondaAnterior";
import { SeccionCierre } from "@/componentes/mejoramiento/SeccionCierre";
import { SeccionEficacia, SeccionVerificacion } from "@/componentes/mejoramiento/SeccionVerificacion";
import { PasoCerrar } from "@/componentes/mejoramiento/pasos/PasoCerrar";
import { PasoEvaluar } from "@/componentes/mejoramiento/pasos/PasoEvaluar";
import { PasoVerificar } from "@/componentes/mejoramiento/pasos/PasoVerificar";
import { PasoAceptar } from "@/componentes/mejoramiento/pasos/PasoAceptar";
import { PasoArbitrar } from "@/componentes/mejoramiento/pasos/PasoArbitrar";
import { PasoCorregir } from "@/componentes/mejoramiento/pasos/PasoCorregir";
import { PasoResponderAlEnte } from "@/componentes/mejoramiento/pasos/PasoResponderAlEnte";
import { PasoDecidir } from "@/componentes/mejoramiento/pasos/PasoDecidir";
import { PasoTrasRechazo } from "@/componentes/mejoramiento/pasos/PasoTrasRechazo";
import { PasoValidar } from "@/componentes/mejoramiento/pasos/PasoValidar";
import { Recorrido, type PasoDeRecorrido } from "@/componentes/mejoramiento/Recorrido";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { InsigniasDelHallazgo } from "@/componentes/mejoramiento/InsigniasDelHallazgo";
import { LoQueSigue } from "@/componentes/mejoramiento/LoQueSigue";
import { SeccionClasificacion } from "@/componentes/mejoramiento/SeccionClasificacion";
import { AccionCorrectivaRequerida } from "@/componentes/mejoramiento/enganches/AccionCorrectivaRequerida";
import { SeccionCorreccion } from "@/componentes/mejoramiento/SeccionCorreccion";
import { SeccionRespuestaAlEnte } from "@/componentes/mejoramiento/SeccionRespuestaAlEnte";
import { SeccionIdentificacion } from "@/componentes/mejoramiento/SeccionIdentificacion";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerSql } from "@/db/cliente";
import { pideAjustesDelPlan, puedeReasignar } from "@/db/consultas/mejoramiento/actividades";
import { laVezPasada, puedeFormular } from "@/db/consultas/mejoramiento/analisis";
import { firmasDeHallazgo, puedeAprobar, puedeDevolverSinRevisor, puedeRevisar } from "@/db/consultas/mejoramiento/aprobacion";
import { archivosDe, archivosQuitables, autorizarSubida } from "@/db/consultas/mejoramiento/archivos";
import { FALTA_EL_FORMATO } from "@/db/consultas/mejoramiento/carga-confirmada";
import { revisoresDe } from "@/db/consultas/mejoramiento/avisos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { baseDeDetalle, type ActividadDeDetalle, type DetalleDeHallazgo, type RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import {
  cerradosDelProceso,
  documentosVigentesVisibles,
  normasQueRigen,
  objetivosActivos,
  procesosDelAlcance,
  usuariosActivos,
} from "@/db/consultas/mejoramiento/opciones";
import { planesParaClasificar } from "@/db/consultas/mejoramiento/planes-lectura";
import { parecidosDeOtrosProcesos } from "@/db/consultas/mejoramiento/parecidos";
import { examinarPlan } from "@/db/consultas/mejoramiento/plan";
import { ofreceRechazo, puedeExigirLaAccion } from "@/db/consultas/mejoramiento/recorrido";
import { aprobacionEnVigor, oficiosPosibles } from "@/db/consultas/mejoramiento/registro";
import { datosDeEvaluacion, huellaDeLoVisto } from "@/db/consultas/mejoramiento/verificacion";
import { leerCambios } from "@/lib/mejoramiento/analisis";
import { seccionesDeLaRonda } from "@/lib/mejoramiento/secciones";
import { diaCorto, fechaDeDia } from "@/lib/mejoramiento/formato";
import { esExterno } from "@/lib/mejoramiento/origenes";
import { cuentaParaElPlan } from "@/lib/mejoramiento/planes";
import { fechaDelAjustePasada, razonDeGerencia, tipoPropuesto } from "@/lib/mejoramiento/reglas";
import { rutaDeFormular, rutaDeImprimir, rutaDePlan } from "@/lib/mejoramiento/rutas";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { ErrorMejora, estaAbierta, SE_AJUSTA_EN, TERMINALES } from "@/lib/mejoramiento/tipos";
import { DESDE } from "@/lib/mejoramiento/transiciones";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirHallazgo, indicadorParaQuienLee } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hallazgo" };

/** Estados en que el hallazgo todavía espera su aceptación: la identificación queda abierta. */
const ESPERA_ACEPTACION = new Set(["por_aceptar", "rechazo", "arbitraje"]);
/** Estados en que la corrección (y su decisión) es la etapa en curso: «2. Corrección» queda abierta. */
const EN_LA_CORRECCION = new Set(["por_corregir", "por_decidir", "por_validar"]);

/**
 * Los pasos del recorrido con la fecha de lo ya ocurrido que el historial permite decir; en la espera de eficacia, desde cuándo se
 * puede registrar «eficaz» (maqueta 2: «Eficacia · desde el 1 mar»).
 */
function pasosConFechas(h: DetalleDeHallazgo, zona: string): PasoDeRecorrido[] {
  const cuando = (tipo: string) => h.eventos.find((e) => e.tipo === tipo)?.cuando;
  const enCurso = h.rondas.find((r) => r.numero === h.ronda);
  const fechas: Record<string, Date | undefined> = {
    // En un hallazgo cargado, el día en que se registró en papel (su evento `registrar`, hecho fuera; spec §15).
    registro: cuando("registrar") ?? h.registradoEn,
    aceptado: cuando("aceptar") ?? cuando("confirmar_hallazgo"),
    correccion: h.correccion.registradaEn ?? undefined,
    decision: h.decision.decididaEn ?? undefined,
    verificacion: enCurso?.verificacion?.en,
    eficacia: enCurso?.evaluacion?.en,
    cierre: h.cierre.cerradoEn ?? undefined,
  };
  return pasosDelRecorrido(baseDeDetalle(h)).map((p) => {
    const f = fechas[p.clave];
    if (p.clave === "eficacia" && p.estado === "actual" && h.fechas.evaluableDesde) return { ...p, nota: `desde el ${fechaDeDia(h.fechas.evaluableDesde)}` };
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
/** Desde el plan aprobado: «5. Seguimiento y verificación» aparece; abierta mientras se verifica. */
const CON_SEGUIMIENTO = new Set(["en_ejecucion", "por_verificar", "en_espera", "por_cerrar", "cerrado"]);
/** «7. Cierre» aparece por cerrar y en un hallazgo cerrado o anulado. */
const CON_CIERRE = new Set(["por_cerrar", "cerrado", "anulado"]);

/** Los cambios que pidió la segunda pregunta del análisis, en palabras («documentos, matriz de riesgos»), o nulo. */
function cambiosPedidos(cambios: unknown): string | null {
  const c = leerCambios(cambios);
  if (!c) return null;
  const cuales = [c.documentos ? "documentos" : null, c.riesgos ? "matriz de riesgos" : null, c.controles ? "controles" : null].filter(Boolean);
  return cuales.length > 0 ? cuales.join(", ") : null;
}

/** El último evento de alguno de esos tipos. */
const ultimoDe = (h: DetalleDeHallazgo, tipos: string[]) => h.eventos.findLast((e) => tipos.includes(e.tipo));

/**
 * La página de un hallazgo (spec 15 §16.2, maqueta 2): el recorrido arriba y, debajo, una sección por etapa en el orden del
 * SGC-FO-AC-01 (1. Identificación, 2. Corrección, 3. Causa raíz, 4. Plan de acción, 5. Seguimiento y verificación, 6. Verificación
 * de eficacia y 7. Cierre): las hechas, plegadas con su resumen de una línea; la actual, abierta; las que faltan no aparecen. Las
 * rondas anteriores, plegadas («Ronda 1 · no eficaz»). A la derecha, «Lo que sigue» (con el formulario del paso a quien puede
 * darlo: también verificar, evaluar la eficacia y cerrar), las firmas del plan, las fechas, los enlaces, las ocurrencias y el
 * historial. Quien no lo ve recibe «no encontrado». Quien lo ve solo por una
 * actividad (`ve: "actividad"`) no recibe el historial ni los archivos. Cada actividad enlaza a su página para quien la abre.
 * Con el plan aprobado, «Ajustes del plan» lista los ajustes de cada ronda (spec §10.6) y ofrece «Pedir un ajuste» (añadir o
 * cancelar) a un líder del proceso o al Admin SGC; quien decide un ajuste lo hace en «Lo que sigue»; el Admin SGC escala a
 * Gerencia una actividad vencida y Gerencia responde la escalada (§10.7). En un hallazgo externo con el plan de la ronda en vigor
 * aprobado, «Respuesta al ente» (§13.4): el Admin SGC sube el oficio, lo elige y registra la fecha de envío; registrada, la
 * fecha, quién y el oficio.
 */
export default async function PaginaHallazgo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { id } = await params;
  // `evaluarEficaciaAccion` vuelve aquí con `?visto=cambio` cuando cambió lo que se mostró para evaluar: el formulario lo dice.
  const avisoCambio = (await searchParams).visto === "cambio";
  // Una sola hora para toda la página: la etiqueta, «Lo que sigue» y lo que se muestra para evaluar se calculan con ella.
  const ahora = new Date();
  const h = await exigirHallazgo(sesion, id, { ahora });
  const zona = zonaHoraria();
  const hoy = fechaEnZona(ahora, zona);
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
  // La clasificación (Fase 15B, anexo §3.4 y §10.4): los planes y los objetivos que se ofrecen, solo a quien clasifica.
  const [planesElegibles, objetivosElegibles] = h.clasificacion.puedeClasificar
    ? await Promise.all([planesParaClasificar(sesion), objetivosActivos()])
    : [[], []];
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
  // La evidencia del reporte del que nació (spec §7.3): la abre quien ve el hallazgo completo; ya no se sube ni se quita.
  const delReporte =
    h.reporteId !== null ? await archivosDe(sqlArchivos, sesion, { contexto: "mejora_reporte", contextoId: h.reporteId }) : [];
  // La de cada reporte que se sumó como ocurrencia (§7.5: la ocurrencia lleva su evidencia).
  const archivosDeOcurrencias: Record<number, Awaited<ReturnType<typeof archivosDe>>> = {};
  for (const o of h.ocurrencias) {
    if (o.reporteId === null) continue;
    const suyos = await archivosDe(sqlArchivos, sesion, { contexto: "mejora_reporte", contextoId: o.reporteId });
    if (suyos.length > 0) archivosDeOcurrencias[o.id] = suyos;
  }

  // Un hallazgo cargado (spec §15): su formato firmado, que el Admin SGC sube y nadie quita, y quién aprobó el plan en papel.
  const formatos = archivos.filter((a) => a.rol === "carga");
  const puedeSubirFormato =
    completo && h.cargado && (await autorizarSubida(sesion, { contexto: "mejora_hallazgo", id: h.id, rol: "carga" })).ok;
  const enPapel = h.rondas.find((r) => r.numero === 1);
  const seccionCarga = h.cargado ? (
    <section aria-labelledby="carga-formato" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="carga-formato" className="font-display text-base font-semibold">
          Cargado: hecho en papel
        </h2>
        {h.cargaConfirmada ? null : <Insignia variante="atencion">{FALTA_EL_FORMATO}</Insignia>}
      </div>
      <p className="text-sm">
        Lo que se hizo en papel quedó marcado como hecho fuera de la plataforma, sin firma del sistema.
        {enPapel?.aprobadoFuera && enPapel.aprobadoEn
          ? ` Aprobó el plan ${enPapel.aprobadoFuera} (${enPapel.aprobadoRol === "gerencia" ? "Gerencia" : "Coordinador del SGC"}), el ${fechaDeDia(fechaEnZona(enPapel.aprobadoEn, zona))}.`
          : ""}
      </p>
      {h.cargaConfirmada ? null : (
        <p className="text-sm">
          Adjunte el formato firmado escaneado: es la evidencia de lo hecho en papel. Hasta entonces, las actividades no llegan a sus
          responsables y el plan no se verifica.
        </p>
      )}
      {completo ? (
        <ArchivosDe
          archivos={formatos}
          direccionDeSubida={puedeSubirFormato ? `/api/mejoramiento/hallazgos/${h.id}/archivos?rol=carga` : null}
          nombre="Zona de carga del formato firmado"
          vacio="Aún no se ha subido el formato firmado."
        />
      ) : null}
    </section>
  ) : null;

  // «2. Corrección», desde que la no conformidad está por corregir (las etapas que faltan no aparecen). Una corrección ya
  // registrada se sigue viendo aunque el hallazgo deje de ser no conformidad: queda como historia (spec §7.6). La de un hallazgo de
  // verificación (Fase 15B, anexo §7.2) está desde que nace: es la de ese hallazgo, con la acción correctiva ya requerida.
  const conCorreccion =
    h.correccionEnlazada !== null || h.correccion.requerida !== null || (h.clase === "no_conformidad" && h.estado === "por_corregir");
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

  // Las firmas del plan de la ronda en curso (spec §8.6): desde que se envía, con lo que firmó cada uno; revisar y aprobar,
  // a quien puede (la regla del acto la repite el servidor).
  const sqlPlan = obtenerSql();
  const rondaEnCurso = h.rondas.find((r) => r.numero === h.ronda) ?? null;
  const enviado = rondaEnCurso !== null && rondaEnCurso.estadoPlan !== "borrador";
  const firmas = enviado ? await firmasDeHallazgo(sqlPlan, h.id) : [];
  const envio = rondaEnCurso && enviado ? firmasDelEnvio(firmas, h.ronda, rondaEnCurso.estadoPlan) : null;
  const huellaDelEnvio = firmas.findLast((f) => f.ronda === h.ronda && f.firma === "elaboro")?.huella ?? null;
  const contextoDelPlan = envio?.elaboro ? await contextoDeMejora(sqlPlan, ahora) : null;
  const elaboroAdmin = rondaEnCurso?.elaboroAdmin ?? false;
  const revisa = completo && h.estado === "en_revision" && huellaDelEnvio !== null && (await puedeRevisar(sqlPlan, sesion, h));
  const aprueba = completo && h.estado === "en_aprobacion" && huellaDelEnvio !== null && puedeAprobar(sesion);
  // Sin nadie que lo revise, quien lo elaboró lo devuelve para reenviarlo directo a Gerencia (F15-DC15).
  const devuelveSinRevisor = completo && h.estado === "en_revision" && !revisa && (await puedeDevolverSinRevisor(sqlPlan, sesion, h));
  // Sin nadie activo que revise lo enviado, la firma «Revisó» lo dice en lugar de nombrar al Administrador del SGC.
  const nadieRevisa = h.estado === "en_revision" && (await revisoresDe(sqlPlan, { id: h.id, ronda: h.ronda })).length === 0;
  // Los parecidos de otros procesos, solo al Administrador del SGC que revisa (spec §8.6): la consulta no recibe sesión.
  const parecidosDeOtros = revisa ? await parecidosDeOtrosProcesos(sqlPlan, h.id, { ahora }) : [];
  const anteriorAlRevisar = revisa && h.reincidenteDe && "id" in h.reincidenteDe ? await laVezPasada(sqlPlan, h.id) : null;
  // Las actividades por su etiqueta («A1.2»), para el historial y para reasignar. La de un responsable inactivo, sin
  // terminar, se reasigna desde aquí (Review Focus 2): quien puede reasignar la ve con «Responsable inactivo» y «Reasignar».
  const etiquetas: Record<number, string> = Object.fromEntries(
    h.rondas.flatMap((r) => r.acciones.flatMap((a) => a.actividades.map((x) => [x.id, `A${a.orden}.${x.orden}`] as const))),
  );
  const sinResponsable = (rondaEnCurso?.acciones ?? []).flatMap((a) =>
    a.actividades.filter((x) => !x.responsableActivo && x.finOriginal !== null && estaAbierta(x.estado)),
  );
  const reasignaAqui =
    completo && h.estado === "en_ejecucion" && sinResponsable.length > 0 && (await puedeReasignar(sqlPlan, sesion, { procesoId: h.procesoId }));
  const usuariosParaReasignar = reasignaAqui ? await usuariosActivos() : [];
  const causasSinAccion = rondaEnCurso
    ? rondaEnCurso.causas
        .filter((c) => !rondaEnCurso.acciones.some((a) => a.causaIds.includes(c.id)))
        .map((c) => ({ orden: c.orden, texto: c.texto, porque: c.sinAccionPorque }))
    : [];

  // Los ajustes al plan aprobado (spec §10.6): desde aquí, añadir o cancelar, un líder del proceso o el Admin SGC (el
  // responsable pide reprogramar la suya desde su actividad); quien decide lo hace en «Lo que sigue». El servidor lo repite.
  const etiquetasDeAccion: Record<number, string> = Object.fromEntries(h.rondas.flatMap((r) => r.acciones.map((a) => [a.id, `A${a.orden}`] as const)));
  // En una carga sin su formato firmado el plan no se ajusta ni se escala (spec §15): sus formularios no aparecen.
  const ajustable = completo && h.cargaConfirmada && SE_AJUSTA_EN.includes(h.estado) && rondaEnCurso?.estadoPlan === "aprobado";
  const pideAjustes = ajustable && (await pideAjustesDelPlan(sqlPlan, sesion, { procesoId: h.procesoId }));
  const ajustesEnCurso = rondaEnCurso?.ajustes ?? [];
  const conAjustePendiente = new Set(ajustesEnCurso.flatMap((x) => (x.estado === "pendiente" && x.actividadId !== null ? [x.actividadId] : [])));
  const cancelables = (rondaEnCurso?.acciones ?? []).flatMap((a) =>
    a.actividades
      .filter((x) => x.finOriginal !== null && estaAbierta(x.estado) && !conAjustePendiente.has(x.id))
      .map((x) => ({ id: x.id, etiqueta: etiquetas[x.id] ?? "", descripcion: x.descripcion })),
  );
  const usuariosParaAjustes = pideAjustes ? await usuariosActivos() : [];
  const numerosDeCausa = (r: RondaDeDetalle): Record<number, number> => Object.fromEntries(r.causas.map((c) => [c.id, c.orden]));
  const decidirAjustes = ajustesEnCurso
    .filter((x) => x.puedeDecidir && h.cargaConfirmada)
    .map((x) => (
      <PasoDecidirAjuste
        key={`decidir-${x.id}`}
        ajusteId={x.id}
        cual={x.tipo === "agregar" || x.actividadId === null ? "una actividad nueva" : `la actividad ${etiquetas[x.actividadId] ?? ""}`}
        frase={fraseDeAjusteDeDetalle(x, etiquetas, etiquetasDeAccion)}
        detalle={rondaEnCurso ? lineasDeLoQueSeAnade(x, numerosDeCausa(rondaEnCurso)) : []}
        fechaPasada={fechaDelAjustePasada(x.cambio, hoy)}
        causa={x.causa}
        pedidoPor={x.pedidoPor}
        pedidoEn={fechaDeDia(fechaEnZona(x.pedidoEn, zona))}
        vence={x.venceEn ? fechaDeDia(fechaEnZona(x.venceEn, zona)) : null}
        hoy={hoy}
        confirmar={
          x.tipo === "cancelar"
            ? `Al aprobarlo, la actividad ${x.actividadId !== null ? (etiquetas[x.actividadId] ?? "") : ""} queda «Cancelada» y no se puede deshacer.`
            : null
        }
        accion={comoGerencia ? decidirAjusteGerenciaAccion : decidirAjusteAccion}
      />
    ));

  // Lo que la página pone bajo cada actividad de la ronda en curso: reasignar la de un responsable inactivo (Review Focus 2),
  // escalar a Gerencia una vencida (el Admin SGC, spec §10.7) y responder la escalada (Gerencia, una vez por escalada).
  const ultimoDeLaEscalada = (actividadId: number) =>
    h.eventos.findLast(
      (e) =>
        (e.tipo === "escalada" || e.tipo === "escalada_respondida") &&
        typeof e.detalle === "object" &&
        e.detalle !== null &&
        (e.detalle as Record<string, unknown>).actividadId === actividadId,
    )?.tipo ?? null;
  const escala = gestiona && h.cargaConfirmada && h.estado === "en_ejecucion";
  const responde = completo && !terminado && puede(sesion, "mejora.aprobar");
  const deActividad = (x: ActividadDeDetalle) => {
    // La regla de la pasada (`venceLaActividad`, que la lectura trae en `vence`): devuelta, la fecha para corregir.
    const vencida = x.finOriginal !== null && estaAbierta(x.estado) && x.vence < hoy;
    const etiqueta = etiquetas[x.id] ?? "";
    const controles = [
      reasignaAqui && sinResponsable.some((s) => s.id === x.id) ? (
        <DialogoReasignar
          key={`reasignar-${x.id}-${x.responsableId}`}
          actividadId={x.id}
          etiqueta={etiqueta}
          responsableId={x.responsableId}
          responsable={x.responsable}
          usuarios={usuariosParaReasignar}
          accion={reasignarActividadAccion}
        />
      ) : null,
      escala && vencida && x.gerenciaEn === null ? (
        <DialogoEscalar key={`escalar-${x.id}`} actividadId={x.id} etiqueta={etiqueta} accion={escalarAGerenciaAccion} />
      ) : null,
      responde && x.gerenciaEn !== null && ultimoDeLaEscalada(x.id) === "escalada" ? (
        <DialogoResponderEscalada key={`responder-${x.id}`} actividadId={x.id} etiqueta={etiqueta} hoy={hoy} accion={responderEscaladaAccion} />
      ) : null,
    ].filter((c) => c !== null);
    return controles.length > 0 ? <div className="flex flex-wrap justify-end gap-2">{controles}</div> : null;
  };

  // La respuesta al ente de un hallazgo externo (spec §13.4), a quien lo ve completo, desde que el plan de la ronda en vigor se
  // aprobó (o ya registrada): la registra el Admin SGC eligiendo el oficio entre los archivos del hallazgo subidos después de esa
  // aprobación (`oficiosPosibles`, la regla del acto, que el servidor repite) y la fecha de envío, entre esa aprobación y hoy.
  // Registrada, el oficio es el del evento. Un hallazgo que está en un plan se responde desde el plan (anexo 15B §3.8): la sección lo
  // dice, con enlace al plan solo a quien lo ve, y no ofrece ni la zona de carga ni el formulario; registrada desde el plan, el oficio
  // es un archivo del plan, que solo abre quien ve todo (a los demás, la fecha y quién la registró).
  const planEnVigorAprobado = rondaEnCurso?.estadoPlan === "aprobado";
  const conRespuestaAlEnte = completo && esExterno(h.origen) && (h.respuestaAlEnte !== null || planEnVigorAprobado);
  const enUnPlan = h.clasificacion.plan;
  const registraRespuesta = conRespuestaAlEnte && gestiona && h.respuestaAlEnte === null && planEnVigorAprobado && enUnPlan === null;
  const delPlan = h.respuestaAlEnte?.delPlan ?? null;
  const oficioRegistrado = (() => {
    const d = h.eventos.findLast((e) => e.tipo === "respuesta_ente")?.detalle;
    const id = typeof d === "object" && d !== null ? (d as Record<string, unknown>).oficioId : null;
    return typeof id === "number" ? id : null;
  })();
  const candidatos = registraRespuesta ? new Set(await oficiosPosibles(sqlArchivos, h.id)) : new Set<number>();
  const aprobacion = registraRespuesta ? await aprobacionEnVigor(sqlArchivos, h.id, zona) : null;
  const oficio = evidencias.filter((a) => (h.respuestaAlEnte ? a.id === oficioRegistrado : candidatos.has(a.id)));
  const seccionRespuesta = conRespuestaAlEnte ? (
    <SeccionRespuestaAlEnte
      fechaLimite={h.fechaLimiteEnte}
      respuesta={h.respuestaAlEnte}
      terminado={terminado}
      desdeElPlan={enUnPlan ? { codigo: enUnPlan.codigo, href: enUnPlan.enlace ? rutaDePlan(enUnPlan.id) : null } : null}
      oficio={
        delPlan ? (
          delPlan.oficio ? (
            <ArchivosDe archivos={[delPlan.oficio]} />
          ) : (
            <p className="text-sm text-muted-foreground">Se registró desde el plan: el oficio está entre los archivos del plan.</p>
          )
        ) : (
          <ArchivosDe
            archivos={oficio}
            quitables={registraRespuesta ? quitables.filter((id) => oficio.some((a) => a.id === id)) : []}
            direccionDeSubida={registraRespuesta && puedeSubirEvidencia ? `/api/mejoramiento/hallazgos/${h.id}/archivos` : null}
            nombre="Zona de carga del oficio de respuesta al ente"
            vacio={h.respuestaAlEnte ? "Sin el oficio adjunto." : "Aún no hay un archivo subido después de aprobar el plan."}
          />
        )
      }
    >
      {registraRespuesta && aprobacion ? (
        <PasoResponderAlEnte
          key={`ente-${clave}-${oficio.length}`}
          hallazgoId={h.id}
          hoy={hoy}
          desde={aprobacion.dia}
          candidatos={oficio.map((a) => ({ id: a.id, nombre: a.nombre }))}
          accion={registrarRespuestaAlEnteAccion}
        />
      ) : null}
    </SeccionRespuestaAlEnte>
  ) : null;

  // Verificar, evaluar y cerrar (spec §11.4 y §11.5): el formulario a quien puede dar el paso (`loQueSigue`, con `puedeVerificar`);
  // los archivos de la verificación y de la evaluación son de la ronda (rol `verificacion`).
  const duenoDeLaRonda = rondaEnCurso ? ({ contexto: "mejora_ronda", contextoId: rondaEnCurso.id } as const) : null;
  const deVerificacion =
    completo && duenoDeLaRonda ? (await archivosDe(sqlArchivos, sesion, duenoDeLaRonda)).filter((a) => a.rol === "verificacion") : [];
  const subeVerificacion =
    completo &&
    rondaEnCurso !== null &&
    (h.estado === "por_verificar" || h.estado === "en_espera") &&
    (await autorizarSubida(sesion, { contexto: "mejora_ronda", id: rondaEnCurso.id, rol: "verificacion" })).ok;
  const quitablesDeVerificacion = duenoDeLaRonda && subeVerificacion ? await archivosQuitables(sqlArchivos, sesion, deVerificacion, duenoDeLaRonda) : [];
  const archivosDeVerificacion =
    rondaEnCurso && subeVerificacion ? (
      <ArchivosDe
        archivos={deVerificacion}
        quitables={quitablesDeVerificacion}
        direccionDeSubida={`/api/mejoramiento/rondas/${rondaEnCurso.id}/archivos?rol=verificacion`}
        nombre="Zona de carga de la evidencia de la verificación"
        vacio="Sin archivos de la verificación."
      />
    ) : null;
  const verifica = completo && sigue.paso === "verificar" && sigue.puede && rondaEnCurso !== null;
  // Cada actividad terminada con su evidencia nombrada (sus archivos, que quien verifica abre; maqueta 7).
  const porVerificar = verifica
    ? await Promise.all(
        rondaEnCurso.acciones.flatMap((a) =>
          a.actividades
            .filter((x) => x.finOriginal !== null && x.estado === "terminada")
            .map(async (x) => ({
              id: x.id,
              etiqueta: `A${a.orden}.${x.orden}`,
              descripcion: x.descripcion,
              terminadaEn: x.terminadaEn ? fechaEnZona(x.terminadaEn, zona) : null,
              archivos: await archivosDe(sqlArchivos, sesion, { contexto: "mejora_actividad", contextoId: x.id }),
            })),
        ),
      )
    : [];
  const evalua = completo && sigue.paso === "evaluar" && sigue.puede;
  // Lo que se muestra para evaluar, y su huella, de exactamente lo que se pinta: se firma lo que se vio.
  // Si el hallazgo cambió entre la lectura y aquí (otra persona evaluó a la vez), no hay formulario: la página ya no lo ofrece.
  const datosEval = evalua
    ? await datosDeEvaluacion(sesion, h.id, { ahora }).catch((err: unknown) => {
        if (err instanceof ErrorMejora) return null;
        throw err;
      })
    : null;
  const cierra = completo && sigue.paso === "cerrar" && sigue.puede;
  const pasoVerificar = verifica ? (
    <PasoVerificar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      actividades={porVerificar}
      hoy={hoy}
      accion={verificarImplementacionAccion}
      respaldoGerencia={sesion.rol === "gerencia"}
    >
      {archivosDeVerificacion}
    </PasoVerificar>
  ) : null;
  const pasoEvaluar = datosEval ? (
    <PasoEvaluar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      ronda={h.ronda}
      datos={datosEval}
      criterioOtro={rondaEnCurso?.criterioOtro ?? null}
      vistoHuella={huellaDeLoVisto(datosEval)}
      hoy={hoy}
      cierra={puede(sesion, "mejora.gestionar")}
      pideCambios={cambiosPedidos(rondaEnCurso?.cambios) !== null}
      pideCodigo={sesion.totpActivo}
      accion={evaluarEficaciaAccion}
      derivar={puede(sesion, "mejora.registrar") ? `/mejoramiento/nuevo?derivado=${h.id}` : null}
      avisoCambio={avisoCambio}
    >
      {archivosDeVerificacion}
    </PasoEvaluar>
  ) : null;
  const pasoCerrar = cierra ? (
    <PasoCerrar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      cambios={cambiosPedidos(rondaEnCurso?.cambios)}
      pideCodigo={sesion.totpActivo}
      accion={cerrarHallazgoAccion}
    />
  ) : null;

  const formulario = formulaAqui ? (
    <Link href={rutaDeFormular(h.id)} className={claseBoton("primario")}>
      Formular el análisis y el plan
    </Link>
  ) : revisa && huellaDelEnvio ? (
    <PasoRevisar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      causasSinAccion={causasSinAccion}
      gerencia={razonDeGerencia(h, { requiereRecursos: false, elaboroAdmin })}
      huella={huellaDelEnvio}
      pideCodigo={sesion.totpActivo}
      firmar={firmarRevisionAccion}
      devolver={devolverPlanAccion}
    >
      <ParecidosDeOtrosProcesos parecidos={parecidosDeOtros} />
      {anteriorAlRevisar ? <LaVezPasada codigo={anteriorAlRevisar.codigo} causas={anteriorAlRevisar.causas} acciones={anteriorAlRevisar.acciones} /> : null}
    </PasoRevisar>
  ) : devuelveSinRevisor ? (
    <DevolverPlan
      key={`paso-${clave}`}
      hallazgoId={h.id}
      accion={devolverPlanAccion}
      texto="No hay otro Administrador del SGC activo que lo revise: devuélvalo y reenvíelo, y al reenviarlo pasa directo a Gerencia. Usted no firma la revisión de lo que elaboró."
    />
  ) : aprueba && huellaDelEnvio && rondaEnCurso ? (
    <PasoAprobar
      key={`paso-${clave}`}
      hallazgoId={h.id}
      gerencia={razonDeGerencia(h, { requiereRecursos: rondaEnCurso.requiereRecursos, elaboroAdmin })}
      notaRecursos={rondaEnCurso.notaRecursos}
      huella={huellaDelEnvio}
      pideCodigo={sesion.totpActivo}
      aprobar={aprobarPlanAccion}
      devolver={devolverPlanGerenciaAccion}
    />
  ) : verifica ? (
    <a href="#verificar" className={`${claseBoton("primario")} self-start`}>
      Ir a verificar
    </a>
  ) : datosEval ? (
    <a href="#evaluar" className={`${claseBoton("primario")} self-start`}>
      Ir a evaluar
    </a>
  ) : cierra ? (
    <a href="#cerrar" className={`${claseBoton("primario")} self-start`}>
      Ir a cerrar
    </a>
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
        acciones={
          // El SGC-FO-AC-01 y los formatos de sus análisis los imprime quien ve el hallazgo completo (spec §16.4).
          completo ? (
            <Link href={rutaDeImprimir(h.id)} className={claseBoton("secundario")}>
              <Printer aria-hidden="true" className="size-4" />
              Imprimir
            </Link>
          ) : null
        }
      />
      <Recorrido pasos={pasosConFechas(h, zona)} />
      {seccionCarga}
      {completo ? <BorradorDeLaEvaluacion key={`borrador-${clave}-${avisoCambio}`} hallazgoId={h.id} conAviso={avisoCambio} /> : null}
      <div className="grid grid-cols-1 min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <SeccionIdentificacion hallazgo={h} zona={zona} abierta={ESPERA_ACEPTACION.has(h.estado)} notas={notas}>
            {completo ? (
              <>
                <ArchivosDe
                  archivos={evidencias}
                  quitables={quitables}
                  direccionDeSubida={puedeSubirEvidencia ? `/api/mejoramiento/hallazgos/${h.id}/archivos` : null}
                  nombre="Zona de carga de las evidencias del hallazgo"
                  vacio="Sin evidencias adjuntas."
                />
                {delReporte.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Las que llegaron con el reporte</p>
                    <ArchivosDe archivos={delReporte} />
                  </div>
                ) : null}
              </>
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
              enlazada={h.correccionEnlazada}
            >
              {completo && h.correccionEnlazada === null ? (
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
          {/* La acción correctiva de la no conformidad de un hallazgo de verificación, requerida desde que nació (anexo 15B §7.2,
              maqueta 6), a quien ve el hallazgo completo. */}
          {completo && h.verificacionHallazgoId !== null ? <AccionCorrectivaRequerida decision={h.decision} zona={zona} /> : null}
          {await Promise.all(
            h.rondasAnteriores.map(async (r) => {
              // Los archivos de la ronda (solo a quien ve el hallazgo completo): los del análisis y los de su verificación y su
              // evaluación, en lectura (spec §8.7).
              const deLaRonda = completo ? await archivosDe(sqlArchivos, sesion, { contexto: "mejora_ronda", contextoId: r.id }) : [];
              const adjuntos = seccionesDeLaRonda(h, r).adjuntos ? deLaRonda.filter((a) => a.rol === "analisis") : [];
              const verificados = deLaRonda.filter((a) => a.rol === "verificacion");
              return (
                <RondaAnterior
                  key={`ronda-${r.id}`}
                  ronda={r}
                  indicador={await indicadorParaQuienLee(r, sesion)}
                  hoy={hoy}
                  zona={zona}
                  adjuntos={adjuntos.length > 0 ? <ArchivosDe archivos={adjuntos} nombre={`Adjuntos del análisis de la ronda ${r.numero}`} /> : null}
                  verificacion={
                    verificados.length > 0 ? (
                      <div className="flex flex-col gap-2 border-t border-linea-suave pt-3">
                        <h3 className="text-sm font-semibold">Archivos de la verificación y de la evaluación</h3>
                        <ArchivosDe archivos={verificados} nombre={`Archivos de la verificación de la ronda ${r.numero}`} />
                      </div>
                    ) : null
                  }
                >
                  {r.ajustes.length > 0 ? (
                    <AjustesDelPlan
                      ajustes={r.ajustes}
                      etiquetas={etiquetas}
                      acciones={etiquetasDeAccion}
                      causas={numerosDeCausa(r)}
                      zona={zona}
                      titulo={`Ajustes del plan (ronda ${r.numero})`}
                    />
                  ) : null}
                </RondaAnterior>
              );
            }),
          )}
          {rondaEnCurso
            ? await (async (r: RondaDeDetalle) => {
                // La causa raíz y el plan se leen en texto también por quien solo es responsable de una actividad (spec §6.3).
                const secciones = seccionesDeLaRonda(h, r);
                const conAnalisis = secciones.causaRaiz;
                const conPlan = secciones.plan;
                // Los adjuntos del análisis son de la ronda: quien revisa y quien aprueba los leen aquí; solo quien ve completo.
                const adjuntos = secciones.adjuntos
                  ? (await archivosDe(sqlArchivos, sesion, { contexto: "mejora_ronda", contextoId: r.id })).filter((a) => a.rol === "analisis")
                  : [];
                const evaluableDesde =
                  conPlan && r.estadoPlan !== "aprobado" && PLAN_SIN_APROBAR.has(h.estado)
                    ? (await examinarPlan(sqlArchivos, h.id, await contextoDeMejora(sqlArchivos, ahora))).evaluableDesde
                    : null;
                const conSeguimiento = r.estadoPlan === "aprobado" && (CON_SEGUIMIENTO.has(h.estado) || r.verificacion !== null);
                const conEficacia = h.estado === "en_espera" || r.evaluacion !== null;
                return (
                  <>
                    {conAnalisis ? (
                      <AnalisisEnLectura ronda={r} titulo="3. Causa raíz" abierta={h.estado === "por_formular"}>
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
                        titulo="4. Plan de acción"
                        abierta={EN_EL_PLAN.has(h.estado)}
                        indicador={await indicadorParaQuienLee(r, sesion)}
                        evaluableDesde={evaluableDesde}
                        hoy={hoy}
                        deActividad={deActividad}
                      />
                    ) : null}
                    {conPlan && r.estadoPlan === "aprobado" && (r.ajustes.length > 0 || pideAjustes) ? (
                      <AjustesDelPlan
                        ajustes={r.ajustes}
                        etiquetas={etiquetas}
                        acciones={etiquetasDeAccion}
                        causas={numerosDeCausa(r)}
                        zona={zona}
                        titulo="Ajustes del plan"
                      >
                        {pideAjustes ? (
                          <DialogoAjusteDelPlan
                            key={`ajuste-plan-${r.ajustes.length}`}
                            hallazgoId={h.id}
                            actividades={cancelables}
                            acciones={r.acciones.map((a) => ({ id: a.id, etiqueta: `A${a.orden}`, descripcion: a.descripcion }))}
                            causas={r.causas.map((c) => ({ id: c.id, orden: c.orden, texto: c.texto }))}
                            tipoPropuesto={tipoPropuesto(h.clase)}
                            usuarios={usuariosParaAjustes}
                            hoy={hoy}
                            accion={pedirAjusteAccion}
                          />
                        ) : null}
                      </AjustesDelPlan>
                    ) : null}
                    {conSeguimiento ? (
                      <SeccionVerificacion id="verificar" ronda={r} abierta={h.estado === "por_verificar"} zona={zona}>
                        {pasoVerificar ? <div className="border-t border-linea-suave pt-3">{pasoVerificar}</div> : null}
                        {!subeVerificacion && deVerificacion.length > 0 ? (
                          <div className="flex flex-col gap-2 border-t border-linea-suave pt-3">
                            <h3 className="text-sm font-semibold">Archivos de la verificación</h3>
                            <ArchivosDe archivos={deVerificacion} nombre="Archivos de la verificación" />
                          </div>
                        ) : null}
                      </SeccionVerificacion>
                    ) : null}
                    {conEficacia ? (
                      <SeccionEficacia
                        id="evaluar"
                        evaluacion={r.evaluacion}
                        evaluableDesde={h.fechas.evaluableDesde}
                        abierta={h.estado === "en_espera"}
                        zona={zona}
                      >
                        {pasoEvaluar ? <div className="border-t border-linea-suave pt-3">{pasoEvaluar}</div> : null}
                      </SeccionEficacia>
                    ) : null}
                  </>
                );
              })(rondaEnCurso)
            : null}
          {seccionRespuesta}
          {CON_CIERRE.has(h.estado) ? (
            <SeccionCierre
              id="cerrar"
              estado={h.estado}
              etiqueta={h.etiqueta}
              cierre={h.cierre}
              validacion={h.correccion.validadaPor && h.correccion.validadaEn ? { por: h.correccion.validadaPor, en: h.correccion.validadaEn } : null}
              abierta
              zona={zona}
            >
              {pasoCerrar ? <div className="border-t border-linea-suave pt-3">{pasoCerrar}</div> : null}
            </SeccionCierre>
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
          <LoQueSigue texto={sigue.turno} nota={sigue.nota}>
            {formulario || decidirAjustes.length > 0 ? (
              <>
                {formulario}
                {decidirAjustes}
              </>
            ) : null}
          </LoQueSigue>
          {envio?.elaboro && rondaEnCurso && contextoDelPlan ? (
            <PanelDeFirmas
              firmas={envio}
              elabora="Quien formula, con su clave, al enviar"
              sinRevision={envio.reviso === null && h.estado !== "en_revision"}
              nadieRevisa={nadieRevisa}
              gerencia={razonDeGerencia(h, { requiereRecursos: rondaEnCurso.requiereRecursos, elaboroAdmin })}
              enCurso={h.estado === "en_revision" ? "reviso" : h.estado === "en_aprobacion" ? "aprobo" : null}
              vence={h.vence}
              plazos={{ revisar: contextoDelPlan.config.plazos.revisar, aprobar: contextoDelPlan.config.plazos.aprobar }}
              contexto={contextoDelPlan}
            />
          ) : null}
          <FechasDelHallazgo fechas={h.fechas} zona={zona} />
          <EnlacesDelHallazgo enlaces={h.enlaces} />
          <SeccionClasificacion
            key={`clasificacion-${h.clasificacion.plan?.id ?? 0}-${h.clasificacion.objetivoId ?? 0}`}
            hallazgoId={h.id}
            codigo={h.codigo}
            clasificacion={h.clasificacion}
            cuenta={cuentaParaElPlan(h.estado)}
            planes={planesElegibles}
            objetivos={objetivosElegibles}
            acciones={
              h.clasificacion.puedeClasificar
                ? { poner: ponerEnPlanAccion, cambiar: cambiarDePlanAccion, sacar: sacarDelPlanAccion, objetivo: ponerObjetivoAccion }
                : undefined
            }
          />
          {completo ? (
            <Ocurrencias
              key={`ocurrencias-${h.ocurrencias.length}`}
              hallazgoId={h.id}
              ocurrencias={h.ocurrencias.map((o) => ({ ...o, reporte: o.reporteId !== null }))}
              archivos={archivosDeOcurrencias}
              puedeAnadir={!terminado && puede(sesion, "mejora.registrar")}
              hoy={hoy}
              accion={registrarOcurrenciaAccion}
            />
          ) : null}
          {completo ? <HistorialDelHallazgo eventos={h.eventos} zona={zona} etiquetasDeActividad={etiquetas} /> : null}
        </div>
      </div>
    </div>
  );
}
