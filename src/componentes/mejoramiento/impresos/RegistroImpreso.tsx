import type { SeguimientoDeActividad } from "@/db/consultas/mejoramiento/actividades";
import type { FirmaDelHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import type { EncabezadoDelFormato } from "@/db/consultas/mejoramiento/formatos";
import type { ActividadDeDetalle, DetalleDeHallazgo, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { leerCriterios } from "@/lib/mejoramiento/eficacia";
import { CORRECCION_EN_DISTRIBUCION } from "@/lib/mejoramiento/enganches";
import { fechaDeDia, fechaLargaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { ETIQUETA_ORIGEN } from "@/lib/mejoramiento/origenes";
import {
  esReprogramada,
  estadoDeActividadEnTexto,
  ETIQUETA_CLASE,
  ETIQUETA_CRITERIO,
  ETIQUETA_CRITICIDAD,
  ETIQUETA_ESTADO_AJUSTE,
  ETIQUETA_METODO_ANALISIS,
  ETIQUETA_METODO_VERIFICACION,
  ETIQUETA_TIPO_ACCION,
} from "@/lib/mejoramiento/textos";
import { estaAbierta, TERMINALES, type EstadoAjuste, type MetodoAnalisis, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { fraseDeAjusteDeDetalle, lineasDeLoQueSeAnade } from "../ajustes/AjustesDelPlan";
import { textoDelCriterio, type IndicadorEnLectura } from "../plan/PlanEnLectura";
import { ContenidoDePorques } from "./CincoPorquesImpreso";
import { EncabezadoDeFormato } from "./EncabezadoDeFormato";
import { ContenidoDeIshikawa } from "./IshikawaImpreso";
import { ContenidoDeOtroMetodo } from "./OtroMetodoImpreso";
import {
  Bloque,
  Cabecera,
  Campos,
  CasillaDeFirma,
  CasillaEnPapel,
  CausasRaiz,
  conPorcentajesUnidos,
  Firmas,
  firmasDelPlan,
  Hoja,
  MarcaDeCarga,
  Nota,
  pasoEnPapel,
  PieDeImpreso,
  porcentaje,
  preguntasDeCierre,
  SIN_REGISTRAR,
  Subtitulo,
  Tabla,
  TD,
  ultimaFirma,
  type Campo,
} from "./Partes";

const ESTADO_PLAN: Record<string, string> = { borrador: "plan en borrador", enviado: "plan enviado", aprobado: "plan aprobado" };

/** Lo que recibe el SGC-FO-AC-01: el hallazgo como lo ve quien lo ve completo y lo que la página leyó aparte. */
export type DatosDelRegistro = {
  hallazgo: DetalleDeHallazgo;
  /** El nombre de la entidad (`obtenerMarcaSegura`) y la dirección de su logo, o nula. */
  entidad: string;
  logo: string | null;
  /** El del documento elegido para el SGC-FO-AC-01 (`encabezadoDeFormato`), o nulo. */
  formato: EncabezadoDelFormato | null;
  /** Las firmas del hallazgo, en el orden en que se dieron (`firmasDeHallazgo`). */
  firmas: readonly FirmaDelHallazgo[];
  /** Los seguimientos de cada actividad, por su id (`seguimientosDelHallazgo`). */
  seguimientos: Readonly<Record<number, readonly SeguimientoDeActividad[]>>;
  /** Los líderes activos del proceso: el responsable del proceso. */
  lideres: readonly string[];
  /** El indicador del criterio de eficacia de cada ronda, por su id, ya decidido para quien imprime (`puedeVerIndicador`). */
  indicadores: Readonly<Record<number, IndicadorEnLectura>>;
  /** Los nombres de los archivos de evidencia de la corrección. */
  evidenciaDeCorreccion: readonly string[];
  impresoEn: Date;
  impresoPor: string;
  zona: string;
};

type Contexto = { d: DatosDelRegistro; rondas: RondaDeDetalle[]; etiquetas: Record<number, string>; hoy: string; dia: (d: Date) => string };

/** El texto que un evento guarda en esa clave de su detalle (la nota de una reclasificación). */
function textoDelEvento(e: DetalleDeHallazgo["eventos"][number], clave: string): string | null {
  const v = typeof e.detalle === "object" && e.detalle !== null ? (e.detalle as Record<string, unknown>)[clave] : null;
  return typeof v === "string" && v !== "" ? v : null;
}

function Identificacion({ c, id }: { c: Contexto; id: string }) {
  const { d, dia } = c;
  const h = d.hallazgo;
  const registrar = pasoEnPapel(h, "registrar");
  const notas = h.eventos.flatMap((e) => {
    const nota = e.tipo === "reclasificar" ? textoDelEvento(e, "nota") : null;
    return nota ? [{ termino: `Nota de la reclasificación del ${dia(e.cuando)}`, valor: nota }] : [];
  });
  const campos: Array<Campo | null> = [
    { termino: "Consecutivo", valor: h.codigo },
    { termino: "Fecha de registro", valor: registrar ? `${dia(registrar.cuando)} (en papel)` : fechaYHora(h.registradoEn, d.zona) },
    { termino: "Clasificación", valor: ETIQUETA_CLASE[h.clase] },
    h.criticidad ? { termino: "Criticidad", valor: ETIQUETA_CRITICIDAD[h.criticidad] } : null,
    { termino: "Proceso afectado", valor: h.proceso },
    { termino: "Responsable del proceso", valor: d.lideres.length > 0 ? d.lideres.join(", ") : "Sin líder activo" },
    { termino: "Fuente", valor: [ETIQUETA_ORIGEN[h.origen] ?? h.origen, h.fuente].filter(Boolean).join(" · ") },
    h.referenciaCaso ? { termino: "Referencia del caso", valor: h.referenciaCaso } : null,
    { termino: "Fecha en que se detectó", valor: fechaDeDia(h.detectadoEn) },
    { termino: "Requisito incumplido", valor: h.requisitoClausula ?? "Sin registrar" },
    h.riesgo ? { termino: "Riesgo asociado", valor: h.riesgo } : null,
    h.fechaLimiteEnte ? { termino: "Fecha límite de respuesta al ente", valor: fechaDeDia(h.fechaLimiteEnte) } : null,
    h.respuestaAlEnte
      ? { termino: "Respuesta al ente", valor: `Enviada el ${fechaDeDia(h.respuestaAlEnte.enviadaEn)}; la registró ${h.respuestaAlEnte.por}` }
      : null,
    { termino: "Lo registró", valor: registrar ? `Lo cargó ${h.registradoPor}, ${fechaYHora(h.registradoEn, d.zona)}` : h.registradoPor },
    h.naceDeUnReporte
      ? { termino: "Nació de un reporte", valor: h.reportadoPor ? `Reportado por ${h.reportadoPor}` : "Reportado por un funcionario" }
      : null,
    h.reincidenteDe && "id" in h.reincidenteDe ? { termino: "Reincidencia de", valor: `${h.reincidenteDe.codigo} · ${h.reincidenteDe.titulo}` } : null,
    { termino: "Título", valor: h.titulo },
    { termino: "Descripción", valor: h.descripcion },
    ...notas,
  ];
  return (
    <Bloque id={id} titulo="1. Identificación">
      <Campos nombre="Identificación del hallazgo" campos={campos} />
      {registrar ? (
        <Firmas nombre="El registro en papel">
          <CasillaEnPapel rol="Registró" quien={null} cuando={registrar.cuando} zona={d.zona} />
        </Firmas>
      ) : null}
    </Bloque>
  );
}

function Correccion({ c, id }: { c: Contexto; id: string }) {
  const { d } = c;
  const h = d.hallazgo;
  const x = h.correccion;
  const decision = h.decision;
  const corregir = pasoEnPapel(h, "corregir");
  const sinNada = x.requerida === null && decision.accionRequerida === null;
  // La de un hallazgo de verificación (Fase 15B, anexo §7.2): la corrección es la de ese hallazgo, a quien lo ve; a los demás, solo
  // que está en Distribución.
  const e = h.correccionEnlazada;
  const enlazada: Array<Campo | null> = !e
    ? []
    : e.visible
      ? [
          { termino: "Corrección", valor: `La del hallazgo de verificación de ${e.punto}` },
          { termino: "En qué va", valor: e.estado },
          { termino: "Qué se corrigió", valor: e.nota ?? "Aún no se registra la corrección en Distribución." },
          e.por ? { termino: "Quién", valor: e.por } : null,
          e.en ? { termino: "Cuándo", valor: fechaYHora(e.en, d.zona) } : null,
        ]
      : [{ termino: "Corrección", valor: CORRECCION_EN_DISTRIBUCION }];
  const campos: Array<Campo | null> = [
    ...enlazada,
    x.requerida === null ? null : { termino: "¿Requirió corrección o contención?", valor: x.requerida ? "Sí" : "No" },
    x.descripcion ? { termino: "Descripción", valor: x.descripcion } : null,
    x.responsable ? { termino: "Responsable", valor: x.responsable } : null,
    x.implementadaEn ? { termino: "Fecha de implementación", valor: fechaDeDia(x.implementadaEn) } : null,
    x.requerida
      ? { termino: "Evidencia", valor: d.evidenciaDeCorreccion.length > 0 ? d.evidenciaDeCorreccion.join(", ") : "Sin evidencia adjunta" }
      : null,
    x.registradaEn && !corregir ? { termino: "Se registró", valor: fechaYHora(x.registradaEn, d.zona) } : null,
    x.validadaPor && x.validadaEn ? { termino: "Validó", valor: `${x.validadaPor}, ${fechaYHora(x.validadaEn, d.zona)}` } : null,
    decision.accionRequerida === null
      ? null
      : {
          termino: "¿Requiere acción correctiva?",
          valor: `${decision.accionRequerida ? "Sí" : "No"}${decision.justificacion ? `: ${decision.justificacion}` : ""}`,
        },
    decision.decididaEn && !corregir ? { termino: "Se decidió", valor: fechaYHora(decision.decididaEn, d.zona) } : null,
  ];
  return (
    <Bloque id={id} titulo="2. Corrección o contención">
      {sinNada ? (
        <Nota>{h.clase === "no_conformidad" ? SIN_REGISTRAR : "No aplica: la corrección es solo de la no conformidad."}</Nota>
      ) : (
        <Campos nombre="La corrección o contención" campos={campos} />
      )}
      {corregir ? (
        <Firmas nombre="La corrección en papel">
          <CasillaEnPapel rol="Registró la corrección" quien={x.responsable} cuando={corregir.cuando} zona={d.zona} />
        </Firmas>
      ) : null}
    </Bloque>
  );
}

/** El contenido de un análisis en su método; el Pareto es de la 15C. */
function ContenidoDelAnalisis({ a, cargado, efecto }: { a: RondaDeDetalle["analisis"][number]; cargado: boolean; efecto: string }) {
  if (a.metodo === "cinco_porques") return <ContenidoDePorques a={a} cargado={cargado} nombre={`Los niveles del análisis ${a.orden}`} />;
  if (a.metodo === "ishikawa") return <ContenidoDeIshikawa a={a} cargado={cargado} efecto={efecto} nivel={4} />;
  if (a.metodo === "otro") return <ContenidoDeOtroMetodo a={a} cargado={cargado} />;
  return <Nota>El análisis de Pareto todavía no está disponible.</Nota>;
}

function CausaRaiz({ c, id }: { c: Contexto; id: string }) {
  const h = c.d.hallazgo;
  return (
    <Bloque id={id} titulo="3. Análisis de causa raíz">
      {c.rondas.map((r) => {
        const vacia = r.analisis.length === 0 && r.causas.length === 0 && r.similares === null && r.cambios === null;
        return (
          <div key={r.id} className="flex min-w-0 flex-col gap-2">
            <Subtitulo>{`Ronda ${r.numero}`}</Subtitulo>
            {vacia ? (
              <Nota>{SIN_REGISTRAR}</Nota>
            ) : (
              <>
                {r.analisis.map((a) => (
                  <div key={a.id} className="flex min-w-0 flex-col gap-1">
                    <p className="font-semibold">
                      {`Análisis ${a.orden}: ${ETIQUETA_METODO_ANALISIS[a.metodo as MetodoAnalisis] ?? a.metodo}`}
                      {a.equipo ? <span className="font-normal text-muted-foreground">{` · equipo: ${a.equipo}`}</span> : null}
                    </p>
                    <ContenidoDelAnalisis a={a} cargado={h.cargado} efecto={h.titulo} />
                    {a.observaciones ? <p className="whitespace-pre-line break-words">{`Observaciones: ${a.observaciones}`}</p> : null}
                  </div>
                ))}
                <Campos
                  nombre={`Conclusión del análisis de la ronda ${r.numero}`}
                  campos={[{ termino: "Causas raíz", valor: <CausasRaiz causas={r.causas} /> }, ...preguntasDeCierre(r)]}
                />
              </>
            )}
          </div>
        );
      })}
    </Bloque>
  );
}

/**
 * El estado de una actividad en texto (`estadoDeActividadEnTexto`, la regla del Excel): vencida solo con el plan aprobado, sin
 * terminar ni cancelar y, en una carga, desde su formato firmado (`venceLaActividad`, que la lectura trae en `vence`).
 */
function estadoDeActividad(x: ActividadDeDetalle, hoy: string, entregada: boolean): string {
  const vencida = entregada && x.finOriginal !== null && estaAbierta(x.estado) && x.vence < hoy;
  return estadoDeActividadEnTexto({
    estado: x.estado,
    verificacion: x.verificacion,
    reprogramada: esReprogramada(x),
    vencida: vencida ? { vence: x.vence, hoy } : null,
  });
}

function AjustesImpresos({ r, c }: { r: RondaDeDetalle; c: Contexto }) {
  const acciones = Object.fromEntries(r.acciones.map((a) => [a.id, `A${a.orden}`]));
  const causas = Object.fromEntries(r.causas.map((x) => [x.id, x.orden]));
  return (
    <>
      <Subtitulo nivel={4}>Ajustes del plan</Subtitulo>
      <Tabla nombre={`Ajustes del plan de la ronda ${r.numero}`} ancha>
        <Cabecera columnas={["Ajuste", "Causa", "Lo pidió", "Decisión"]} />
        <tbody>
          {r.ajustes.map((x) => (
            <tr key={x.id}>
              <td className={TD}>
                {fraseDeAjusteDeDetalle(x, c.etiquetas, acciones)}
                {lineasDeLoQueSeAnade(x, causas).map((linea, i) => (
                  <span key={i} className="block text-muted-foreground">
                    {linea}
                  </span>
                ))}
              </td>
              <td className={`${TD} whitespace-pre-line`}>{x.causa}</td>
              <td className={TD}>{`${x.pedidoPor}, ${c.dia(x.pedidoEn)}`}</td>
              <td className={TD}>
                {ETIQUETA_ESTADO_AJUSTE[x.estado as EstadoAjuste] ?? x.estado}
                {x.decididoPor && x.decididoEn ? ` · ${x.decididoPor}, ${c.dia(x.decididoEn)}` : ""}
                {x.nota ? <span className="block whitespace-pre-line">{`Nota: ${x.nota}`}</span> : null}
                {x.acta ? <span className="block">{`Acta del Comité: ${x.acta.numero}, del ${fechaDeDia(x.acta.fecha)}`}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </>
  );
}

/** Las firmas del plan de la ronda: las del sistema de su envío vigente o, aprobado en papel, quién lo aprobó y cuándo. */
function FirmasDelPlanImpresas({ r, c }: { r: RondaDeDetalle; c: Contexto }) {
  const zona = c.d.zona;
  if (r.aprobadoFuera && r.aprobadoEn) {
    return (
      <Firmas nombre={`Firmas del plan de la ronda ${r.numero}`}>
        <CasillaEnPapel rol="Aprobó" quien={r.aprobadoFuera} cuando={r.aprobadoEn} zona={zona} nota="Lo elaborado y revisado en papel está en el formato firmado de la carga." />
      </Firmas>
    );
  }
  if (r.estadoPlan === "borrador") return <Nota>Sin firmas: el plan está en borrador.</Nota>;
  const f = firmasDelPlan(c.d.firmas, r);
  const sinFirma = r.estadoPlan === "aprobado" ? "No aplica" : "Pendiente";
  return (
    <Firmas nombre={`Firmas del plan de la ronda ${r.numero}`}>
      <CasillaDeFirma rol="Elaboró" firma={f.elaboro} sinFirma="Pendiente" zona={zona} />
      <CasillaDeFirma rol="Revisó" firma={f.reviso} sinFirma={sinFirma} zona={zona} />
      <CasillaDeFirma rol="Aprobó" firma={f.aprobo} sinFirma={sinFirma} zona={zona} />
    </Firmas>
  );
}

function Plan({ c, id }: { c: Contexto; id: string }) {
  const { d, hoy } = c;
  return (
    <Bloque id={id} titulo="4. Plan de acción">
      {c.rondas.map((r) => {
        const actividades = r.acciones.flatMap((a) => a.actividades.map((x) => ({ x, etiqueta: `A${a.orden}.${x.orden}` })));
        const orden = new Map(r.causas.map((x) => [x.id, x.orden]));
        const sinPlan = r.acciones.length === 0 && leerCriterios(r.criterios).length === 0;
        return (
          <div key={r.id} className="flex min-w-0 flex-col gap-2">
            <Subtitulo>{`Ronda ${r.numero} · ${ESTADO_PLAN[r.estadoPlan] ?? r.estadoPlan}`}</Subtitulo>
            {sinPlan ? (
              <Nota>{SIN_REGISTRAR}</Nota>
            ) : (
              <>
                {r.acciones.length > 0 ? (
                  <Tabla nombre={`Acciones de la ronda ${r.numero}`} ancha>
                    <Cabecera columnas={["Acción", "Tipo", "Causas que ataca", "Recursos", "Indicador de cumplimiento", "Meta"]} />
                    <tbody>
                      {r.acciones.map((a) => {
                        const numeros = a.causaIds.flatMap((i) => (orden.has(i) ? [orden.get(i)!] : [])).sort((p, q) => p - q);
                        return (
                          <tr key={a.id}>
                            <td className={`${TD} whitespace-pre-line`}>{`A${a.orden}. ${a.descripcion}`}</td>
                            <td className={TD}>{ETIQUETA_TIPO_ACCION[a.tipo as TipoAccion] ?? a.tipo}</td>
                            <td className={TD}>{numeros.length > 0 ? numeros.join(", ") : "—"}</td>
                            <td className={TD}>{a.recursos ?? "—"}</td>
                            <td className={TD}>{a.indicadorCumplimiento ? conPorcentajesUnidos(a.indicadorCumplimiento) : "—"}</td>
                            <td className={TD}>{a.meta ? conPorcentajesUnidos(a.meta) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Tabla>
                ) : null}
                {actividades.length > 0 ? (
                  <Tabla nombre={`Actividades de la ronda ${r.numero}`} ancha>
                    <Cabecera columnas={["Actividad", "Responsable", "Inicio", "Fin original", "Fin vigente", "Avance", "Estado"]} />
                    <tbody>
                      {actividades.map(({ x, etiqueta }) => (
                        <tr key={x.id}>
                          <td className={`${TD} whitespace-pre-line`}>{`${etiqueta}. ${x.descripcion}`}</td>
                          <td className={TD}>{x.responsable}</td>
                          <td className={`${TD} whitespace-nowrap`}>{fechaDeDia(x.inicio)}</td>
                          <td className={`${TD} whitespace-nowrap`}>{x.finOriginal ? fechaDeDia(x.finOriginal) : "—"}</td>
                          <td className={`${TD} whitespace-nowrap`}>{fechaDeDia(x.fin)}</td>
                          <td className={`${TD} text-right tabular-nums`}>{x.finOriginal ? porcentaje(x.avance) : "—"}</td>
                          <td className={TD}>{estadoDeActividad(x, hoy, d.hallazgo.cargaConfirmada)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                ) : null}
                <Campos
                  nombre={`Criterio de eficacia de la ronda ${r.numero}`}
                  campos={[
                    { termino: "Criterio de eficacia", valor: textoDelCriterio(r, d.indicadores[r.id] ?? null) ?? "Sin definir" },
                    r.fechaEvaluacion ? { termino: "Fecha de evaluación", valor: fechaLargaDeDia(r.fechaEvaluacion) } : null,
                    r.cierrePrevisto ? { termino: "Cierre previsto", valor: c.dia(r.cierrePrevisto) } : null,
                    r.requiereRecursos
                      ? { termino: "Requiere recursos adicionales o tiene impacto institucional", valor: r.notaRecursos ?? "Sí" }
                      : null,
                  ]}
                />
                {r.ajustes.length > 0 ? <AjustesImpresos r={r} c={c} /> : null}
              </>
            )}
            <FirmasDelPlanImpresas r={r} c={c} />
          </div>
        );
      })}
    </Bloque>
  );
}

function Seguimiento({ c, id }: { c: Contexto; id: string }) {
  const { d, hoy } = c;
  return (
    <Bloque id={id} titulo="5. Seguimiento">
      {c.rondas.map((r) => {
        const aprobadas = r.acciones.flatMap((a) =>
          a.actividades.filter((x) => x.finOriginal !== null).map((x) => ({ x, etiqueta: `A${a.orden}.${x.orden}` })),
        );
        const verificadas = aprobadas.filter(({ x }) => x.verificacion !== null);
        const v = r.verificacion;
        return (
          <div key={r.id} className="flex min-w-0 flex-col gap-2">
            <Subtitulo>{`Ronda ${r.numero}`}</Subtitulo>
            {aprobadas.length === 0 ? (
              <Nota>{SIN_REGISTRAR}</Nota>
            ) : (
              <Tabla nombre={`Seguimientos de la ronda ${r.numero}`} ancha>
                <Cabecera columnas={["Fecha", "Actividades realizadas", "Avance", "Barreras", "Responsable"]} />
                {aprobadas.map(({ x, etiqueta }) => {
                  const seguimientos = d.seguimientos[x.id] ?? [];
                  const evidencias = x.evidencias === null ? null : `${x.evidencias} ${x.evidencias === 1 ? "archivo" : "archivos"} de evidencia`;
                  return (
                    <tbody key={x.id}>
                      <tr className="ficha-tramo">
                        <th scope="rowgroup" colSpan={5} className={`${TD} ficha-color-exacto bg-marca-tinte text-left font-semibold`}>
                          {[`${etiqueta}. ${x.descripcion}`, x.responsable, estadoDeActividad(x, hoy, d.hallazgo.cargaConfirmada), evidencias]
                            .filter(Boolean)
                            .join(" · ")}
                        </th>
                      </tr>
                      {seguimientos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className={`${TD} text-muted-foreground`}>
                            Sin seguimientos
                          </td>
                        </tr>
                      ) : (
                        seguimientos.map((s) => (
                          <tr key={s.id}>
                            <td className={`${TD} whitespace-nowrap`}>{fechaDeDia(s.fecha)}</td>
                            <td className={`${TD} whitespace-pre-line`}>{s.realizado}</td>
                            <td className={`${TD} text-right tabular-nums`}>{porcentaje(s.avance)}</td>
                            <td className={`${TD} whitespace-pre-line`}>{s.barreras ?? "—"}</td>
                            <td className={TD}>{s.quien}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  );
                })}
              </Tabla>
            )}
            {verificadas.length > 0 || v ? (
              <>
                <Subtitulo nivel={4}>Verificación de la implementación</Subtitulo>
                <Campos
                  nombre={`Verificación de la implementación de la ronda ${r.numero}`}
                  campos={[
                    ...verificadas.map(({ x, etiqueta }) => ({
                      termino: etiqueta,
                      valor: [
                        x.verificacion === "conforme" ? "Conforme" : "Devuelta",
                        x.verificacionNota,
                        x.verificacion === "devuelta" && x.corregirAntesDe ? `corregir a más tardar el ${fechaLargaDeDia(x.corregirAntesDe)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    })),
                    v ? { termino: "Cómo se verificó", valor: v.metodos.map((m) => ETIQUETA_METODO_VERIFICACION[m]).join(", ") || "—" } : null,
                    v ? { termino: "Verificó", valor: `${v.por}, ${fechaYHora(v.en, d.zona)}` } : null,
                    v?.nota ? { termino: "Nota de la verificación", valor: v.nota } : null,
                  ]}
                />
              </>
            ) : null}
          </div>
        );
      })}
    </Bloque>
  );
}

function Eficacia({ c, id }: { c: Contexto; id: string }) {
  const { d } = c;
  const h = d.hallazgo;
  return (
    <Bloque id={id} titulo="6. Verificación de eficacia">
      {c.rondas.map((r) => {
        const e = r.evaluacion;
        const esperando = r.numero === h.ronda && h.estado === "en_espera";
        return (
          <div key={r.id} className="flex min-w-0 flex-col gap-2">
            <Subtitulo>{`Ronda ${r.numero}`}</Subtitulo>
            {e ? (
              <>
                <Campos
                  nombre={`La evaluación de la eficacia de la ronda ${r.numero}`}
                  campos={[
                    { termino: "Resultado", valor: e.resultado === "eficaz" ? "Eficaz" : "No eficaz" },
                    { termino: "Criterios", valor: e.criterios.map((x) => ETIQUETA_CRITERIO[x]).join(", ") || "—" },
                    { termino: "Periodo evaluado", valor: e.desde && e.hasta ? `Del ${fechaDeDia(e.desde)} al ${fechaDeDia(e.hasta)}` : "—" },
                    { termino: "Evaluó", valor: `${e.por}, ${fechaYHora(e.en, d.zona)}` },
                    e.justificacion ? { termino: "Justificación", valor: e.justificacion } : null,
                  ]}
                />
                <Firmas nombre={`La firma de la evaluación de la ronda ${r.numero}`}>
                  <CasillaDeFirma rol="Verificó" firma={ultimaFirma(d.firmas, r.numero, "verifico")} sinFirma="Sin firma" zona={d.zona} />
                </Firmas>
              </>
            ) : (
              <Nota>
                {esperando
                  ? `Espera el momento de evaluar la eficacia${h.fechas.evaluableDesde ? `: desde el ${fechaLargaDeDia(h.fechas.evaluableDesde)}` : ""}.`
                  : SIN_REGISTRAR}
              </Nota>
            )}
          </div>
        );
      })}
    </Bloque>
  );
}

function Cierre({ c, id }: { c: Contexto; id: string }) {
  const { d } = c;
  const h = d.hallazgo;
  const terminado = TERMINALES.includes(h.estado);
  const reaperturas = c.rondas.filter((r) => r.evaluacion?.resultado === "no_eficaz");
  const cerro = ultimaFirma(d.firmas, h.ronda, "cerro");
  // En el camino corto (con corrección o sin acción) cierra la validación, sin firma «Cerró» (spec §8.5).
  const validoElCierre = h.estado === "cerrado" && h.cierre.resultado !== "eficaz" && h.correccion.validadaPor && h.correccion.validadaEn;
  return (
    <Bloque id={id} titulo="7. Cierre">
      {terminado ? (
        <Campos
          nombre="El cierre del hallazgo"
          campos={[
            { termino: "Decisión", valor: h.etiqueta },
            h.cierre.cerradoEn ? { termino: "Fecha", valor: fechaYHora(h.cierre.cerradoEn, d.zona) } : null,
            h.cierre.cerradoPor ? { termino: "Cerró", valor: h.cierre.cerradoPor } : null,
            validoElCierre ? { termino: "Validó el cierre", valor: `${h.correccion.validadaPor}, ${fechaYHora(h.correccion.validadaEn!, d.zona)}` } : null,
            h.cierre.lecciones ? { termino: "Lecciones aprendidas", valor: h.cierre.lecciones } : null,
            h.cierre.cambiosAtendidos ? { termino: "Cómo se atendieron los cambios", valor: h.cierre.cambiosAtendidos } : null,
            h.cierre.anuladoMotivo ? { termino: "Motivo de la anulación", valor: h.cierre.anuladoMotivo } : null,
          ]}
        />
      ) : (
        <Nota>{`Sin cerrar todavía: ${h.etiqueta}.`}</Nota>
      )}
      {reaperturas.length > 0 ? (
        <Campos
          nombre="Las reaperturas del hallazgo"
          campos={reaperturas.map((r) => ({
            termino: `Justificación de la reapertura (ronda ${r.numero})`,
            valor: r.evaluacion?.justificacion ?? "Sin justificación",
          }))}
        />
      ) : null}
      {cerro ? (
        <Firmas nombre="La firma del cierre">
          <CasillaDeFirma rol="Cerró" firma={cerro} sinFirma="Sin firma" zona={d.zona} />
        </Firmas>
      ) : null}
    </Bloque>
  );
}

/**
 * El impreso SGC-FO-AC-01 (spec 15 §16.4 y Apéndice A.2): el hallazgo completo en las siete secciones del formato y en su orden
 * (identificación; corrección o contención; análisis de causa raíz; plan de acción; seguimiento; verificación de eficacia; cierre),
 * con todas sus rondas (cada una en las secciones 3 a 6, con sus ajustes y sus propias firmas), y cada firma con quién, su cargo,
 * cuándo y su huella corta. Las etapas que no han llegado salen con un texto neutro. Un hallazgo cargado lleva su marca y, de cada
 * paso hecho en papel, quién (si se sabe) y cuándo, «hecho fuera de la plataforma», nunca como una firma del sistema. Lo imprime
 * quien ve el hallazgo completo: llega con todo lo de quien lo ve así. Los bloques se titulan con `h2`: el `h1` es el de la página.
 */
export function RegistroImpreso(d: DatosDelRegistro) {
  const zona = d.zona;
  const h = d.hallazgo;
  const rondas = [...h.rondas].sort((a, b) => a.numero - b.numero);
  const contexto: Contexto = {
    d,
    rondas,
    etiquetas: Object.fromEntries(rondas.flatMap((r) => r.acciones.flatMap((a) => a.actividades.map((x) => [x.id, `A${a.orden}.${x.orden}`])))),
    hoy: fechaEnZona(d.impresoEn, zona),
    dia: (instante: Date) => fechaDeDia(fechaEnZona(instante, zona)),
  };
  const id = (bloque: string) => `registro-impreso-${bloque}`;
  return (
    <Hoja titulo={id("titulo")}>
      <EncabezadoDeFormato
        entidad={d.entidad}
        logo={d.logo}
        titulo="Registro de no conformidad, corrección y acción correctiva"
        formato={d.formato}
        zona={zona}
        idTitulo={id("titulo")}
      />
      {h.cargado ? (
        <MarcaDeCarga />
      ) : null}
      <Identificacion c={contexto} id={id("identificacion")} />
      <Correccion c={contexto} id={id("correccion")} />
      <CausaRaiz c={contexto} id={id("causa-raiz")} />
      <Plan c={contexto} id={id("plan")} />
      <Seguimiento c={contexto} id={id("seguimiento")} />
      <Eficacia c={contexto} id={id("eficacia")} />
      <Cierre c={contexto} id={id("cierre")} />
      <PieDeImpreso impresoEn={d.impresoEn} impresoPor={d.impresoPor} zona={zona} />
    </Hoja>
  );
}
