/**
 * Las pantallas de «Mejoramiento» de la 15A que no tocan la base (spec 15 §16.1 y §16.2, maquetas 1 a 3): la lista, el
 * recorrido, el formulario de registro y «Lo que sigue». Con datos de mentira.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { SeccionRespuestaAlEnte } from "@/componentes/mejoramiento/SeccionRespuestaAlEnte";
import { PasoResponderAlEnte } from "@/componentes/mejoramiento/pasos/PasoResponderAlEnte";
import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import { DialogoReasignar } from "@/componentes/mejoramiento/actividad/DialogoReasignar";
import { FormularioSeguimiento, TerminarActividad, focoDeLaConfirmacion } from "@/componentes/mejoramiento/actividad/FormularioSeguimiento";
import { ListaDeSeguimientos } from "@/componentes/mejoramiento/actividad/ListaDeSeguimientos";
import { MisActividades } from "@/componentes/mejoramiento/actividad/MisActividades";
import { PaginaDeActividad } from "@/componentes/mejoramiento/actividad/PaginaDeActividad";
import { AjustesDelPlan } from "@/componentes/mejoramiento/ajustes/AjustesDelPlan";
import { DialogoAjusteDelPlan, DialogoPedirAjuste } from "@/componentes/mejoramiento/ajustes/DialogoPedirAjuste";
import { DialogoEscalar, DialogoResponderEscalada } from "@/componentes/mejoramiento/ajustes/DialogoEscalar";
import { PasoDecidirAjuste } from "@/componentes/mejoramiento/ajustes/PasoDecidirAjuste";
import { envioConConfirmacion } from "@/componentes/mejoramiento/ajustes/envio-confirmado";
import type { DetalleDeActividad } from "@/db/consultas/mejoramiento/actividades";
import type { AjusteDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { SeccionIdentificacion } from "@/componentes/mejoramiento/SeccionIdentificacion";
import { resolverPanelDeParecidos } from "@/lib/mejoramiento/parecidos-panel";
import { AnalisisEnLectura } from "@/componentes/mejoramiento/analisis/AnalisisEnLectura";
import { CriterioDeEficacia } from "@/componentes/mejoramiento/plan/CriterioDeEficacia";
import { FormularioPlan } from "@/componentes/mejoramiento/plan/FormularioPlan";
import { FaltasDelPlan, PlanEnLectura } from "@/componentes/mejoramiento/plan/PlanEnLectura";
import { TarjetaDeAccion, type AccionDelFormulario } from "@/componentes/mejoramiento/plan/TarjetaDeAccion";
import { CausasRaiz } from "@/componentes/mejoramiento/analisis/CausasRaiz";
import { LaVezPasada } from "@/componentes/mejoramiento/analisis/LaVezPasada";
import { PestanasDeMetodo } from "@/componentes/mejoramiento/analisis/PestanasDeMetodo";
import { PreguntasDeCierre } from "@/componentes/mejoramiento/analisis/PreguntasDeCierre";
import { FormularioCarga } from "@/componentes/mejoramiento/FormularioCarga";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { ListaDeHallazgos, textoDeVence } from "@/componentes/mejoramiento/ListaDeHallazgos";
import { LoQueSigue } from "@/componentes/mejoramiento/LoQueSigue";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { PasoAceptar } from "@/componentes/mejoramiento/pasos/PasoAceptar";
import { PasoArbitrar } from "@/componentes/mejoramiento/pasos/PasoArbitrar";
import { PasoCorregir } from "@/componentes/mejoramiento/pasos/PasoCorregir";
import { PasoDecidir } from "@/componentes/mejoramiento/pasos/PasoDecidir";
import { PasoTrasRechazo } from "@/componentes/mejoramiento/pasos/PasoTrasRechazo";
import { PasoValidar } from "@/componentes/mejoramiento/pasos/PasoValidar";
import { PanelDeFirmas, firmasDelEnvio } from "@/componentes/mejoramiento/plan/PanelDeFirmas";
import { ParecidosDeOtrosProcesos } from "@/componentes/mejoramiento/plan/ParecidosDeOtrosProcesos";
import { PasoAprobar } from "@/componentes/mejoramiento/plan/PasoAprobar";
import { PasoEnviar } from "@/componentes/mejoramiento/plan/PasoEnviar";
import { PasoRevisar } from "@/componentes/mejoramiento/plan/PasoRevisar";
import { razonDeGerencia } from "@/lib/mejoramiento/reglas";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { SeccionCorreccion } from "@/componentes/mejoramiento/SeccionCorreccion";
import { Recorrido } from "@/componentes/mejoramiento/Recorrido";
import type { FilaDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { SIN_AJUSTES } from "@/lib/dias-habiles";
import { fraseDeLoQueSigue } from "@/db/consultas/mejoramiento/lectura";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { filtroDeConsulta } from "@/lib/mejoramiento/filtro";
import { seccionesDeLaRonda } from "@/lib/mejoramiento/secciones";
import { AVISO_SIN_PACIENTES, esReprogramada, estadoDeActividadEnTexto, REPROGRAMADA } from "@/lib/mejoramiento/textos";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";
import { EnlacesDelHallazgo } from "@/componentes/mejoramiento/EnlacesDelHallazgo";
import { FechasDelHallazgo } from "@/componentes/mejoramiento/FechasDelHallazgo";
import { RondaAnterior } from "@/componentes/mejoramiento/RondaAnterior";
import { SeccionCierre } from "@/componentes/mejoramiento/SeccionCierre";
import { SeccionEficacia, SeccionVerificacion } from "@/componentes/mejoramiento/SeccionVerificacion";
import { PasoCerrar } from "@/componentes/mejoramiento/pasos/PasoCerrar";
import { PasoEvaluar } from "@/componentes/mejoramiento/pasos/PasoEvaluar";
import { PasoVerificar } from "@/componentes/mejoramiento/pasos/PasoVerificar";
import { TablaDelIndicador } from "@/componentes/mejoramiento/pasos/Partes";
import { camposDeLaVerificacion, decisionesDeLaVerificacion, idsDeLaVerificacion } from "@/lib/esquemas/mejoramiento";
import type { DetalleDeHallazgo, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import type { DatosDeEvaluacion } from "@/db/consultas/mejoramiento/verificacion";
import { etiquetasDeUsuarios } from "@/lib/mejoramiento/textos";
import {
  claveDelBorrador,
  guardarBorrador,
  quitarBorradoresDelHallazgo,
  sinAvisoDeCambio,
  tomarBorrador,
} from "@/lib/mejoramiento/borrador-evaluacion";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { ClasificarReporte } from "@/componentes/mejoramiento/reportes/ClasificarReporte";
import { FormularioReporte } from "@/componentes/mejoramiento/reportes/FormularioReporte";
import { MisReportes } from "@/componentes/mejoramiento/reportes/MisReportes";
import { ReportesRecibidos } from "@/componentes/mejoramiento/reportes/ReportesRecibidos";
import type { MiReporte, ReporteDeLaLista } from "@/db/consultas/mejoramiento/reportes";
import { etiquetaDeReporte, MAXIMO_POR_REPORTE } from "@/lib/mejoramiento/reportes";
import { Ocurrencias } from "@/componentes/mejoramiento/Ocurrencias";
import { adondeVaSinLista } from "@/lib/mejoramiento/rutas";

// La zona de carga de la evidencia (en la página de una actividad) pide el enrutador del cliente.
vi.mock("next/navigation", async (importar) => ({
  ...(await importar<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

// 18 de noviembre de 2026 (miércoles), 10:00 en Bogotá. El lunes 16 es festivo: del 11 al 18 hay cuatro días hábiles.
const AHORA = new Date("2026-11-18T15:00:00Z");
const CONTEXTO = { ahora: AHORA, zona: "America/Bogota", calendario: SIN_AJUSTES };
/** El texto de un HTML, sin sus etiquetas. */
const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, "");

const fila = (extra: Partial<FilaDeHallazgo>): FilaDeHallazgo => ({
  id: 14,
  codigo: "HZ-2026-014",
  titulo: "Dos turnos de noche sin registro de temperatura",
  clase: "no_conformidad",
  criticidad: "alta",
  origen: "auditoria_interna",
  proceso: "Farmacia",
  estado: "en_ejecucion",
  etiqueta: "En ejecución",
  marcas: [],
  turno: "Los responsables de las actividades",
  avance: 45,
  vence: new Date("2026-11-12T04:59:59Z"),
  prioridadAlta: false,
  ...extra,
});

describe("ListaDeHallazgos", () => {
  it("pinta el código, el título, el estado con texto, el turno y lo vencido", () => {
    const html = renderToStaticMarkup(<ListaDeHallazgos filas={[fila({})]} contexto={CONTEXTO} />);
    expect(html).toContain("HZ-2026-014");
    expect(html).toContain("Dos turnos de noche sin registro de temperatura");
    expect(html).toContain("En ejecución");
    expect(html).toContain("Los responsables de las actividades");
    expect(html).toContain("Vencida hace 4 días");
    expect(html).toContain('href="/mejoramiento/14"');
  });

  it("dice cuántos días hábiles quedan", () => {
    const html = renderToStaticMarkup(
      <ListaDeHallazgos filas={[fila({ vence: new Date("2026-11-26T04:59:59Z") })]} contexto={CONTEXTO} />,
    );
    expect(html).toContain("quedan 5 días hábiles");
  });

  it("una fila de prioridad alta lleva la insignia con texto", () => {
    const sin = renderToStaticMarkup(<ListaDeHallazgos filas={[fila({})]} contexto={CONTEXTO} />);
    expect(sin).not.toContain("Prioridad alta");
    const con = renderToStaticMarkup(
      <ListaDeHallazgos filas={[fila({ prioridadAlta: true, marcas: ["Prioridad alta"] })]} contexto={CONTEXTO} />,
    );
    expect(con).toContain("Prioridad alta");
  });

  it("sin filas, el estado vacío", () => {
    const html = renderToStaticMarkup(<ListaDeHallazgos filas={[]} contexto={CONTEXTO} />);
    expect(html).toContain("Aún no hay hallazgos");
  });
});

const base = (extra: Partial<HallazgoBase>): HallazgoBase => ({
  id: 1,
  codigo: "HZ-2026-001",
  clase: "no_conformidad",
  criticidad: "alta",
  origen: "auditoria_interna",
  estado: "en_ejecucion",
  ronda: 1,
  procesoId: 1,
  reincidenteDe: null,
  correccionRequerida: true,
  accionRequerida: true,
  resultadoCierre: null,
  registradoPor: 1,
  ...extra,
});

describe("Recorrido", () => {
  it("marca un solo paso como actual, los anteriores como hechos y no es un control", () => {
    const pasos = pasosDelRecorrido(base({}));
    const html = renderToStaticMarkup(<Recorrido pasos={pasos} />);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    const actual = pasos.findIndex((p) => p.estado === "actual");
    expect(actual).toBeGreaterThan(0);
    expect(html.match(/data-estado="hecho"/g)).toHaveLength(actual);
    expect(html).toContain("Ejecución");
    expect(html).not.toMatch(/<(button|a)[\s>]/);
  });

  it("dice el estado de cada paso con texto, no solo con color", () => {
    const html = renderToStaticMarkup(<Recorrido pasos={pasosDelRecorrido(base({}))} />);
    expect(html).toContain("Hecho");
    expect(html).toContain("En curso");
    expect(html).toContain("Falta");
  });
});

describe("FormularioHallazgo", () => {
  const props = { accion: vi.fn(async () => null), procesos: [{ id: 3, nombre: "Farmacia" }], hoy: "2026-11-18", diasParaAceptar: 3 };
  const pintar = (valores?: Record<string, string>) => renderToStaticMarkup(<FormularioHallazgo {...props} valores={valores} />);

  it("lleva el panel de parecidos del proceso y la salida elegida viaja en el formulario (distinto por omisión)", () => {
    const html = pintar();
    expect(html).toContain("Parecidos en Farmacia");
    const relacion = html.match(/<input[^>]*name="relacion"[^>]*>/)![0];
    expect(relacion).toContain('value="distinto"');
    expect(relacion).toContain('form="formulario-hallazgo"');
    expect(html).toContain('id="formulario-hallazgo"');
  });

  it("siempre muestra el aviso de datos de pacientes", () => {
    expect(pintar()).toContain(AVISO_SIN_PACIENTES);
  });

  it("la referencia del caso solo aparece en PQRSF y evento adverso", () => {
    expect(pintar()).not.toContain("Referencia del caso");
    expect(pintar({ origen: "pqrsf" })).toContain("Referencia del caso");
    expect(pintar({ origen: "evento_adverso" })).toContain("Referencia del caso");
  });

  it("la criticidad solo aparece en la no conformidad", () => {
    expect(pintar({ clase: "no_conformidad" })).toContain(">Criticidad<");
    expect(pintar({ clase: "observacion" })).not.toContain(">Criticidad<");
    expect(pintar({ clase: "oportunidad" })).not.toContain(">Criticidad<");
  });

  it("un origen externo pide la fecha límite al ente y avisa que no se rechaza y lo aprueba Gerencia", () => {
    expect(pintar()).not.toContain("Fecha límite de respuesta al ente");
    const html = pintar({ origen: "ente_control" });
    expect(html).toContain("Fecha límite de respuesta al ente");
    expect(html).toContain("Este hallazgo no se puede rechazar y lo aprobará Gerencia");
  });

  it("la criticidad alta avisa que lleva acción correctiva y la aprueba Gerencia", () => {
    expect(pintar({ clase: "no_conformidad", criticidad: "alta" })).toContain("Llevará acción correctiva y lo aprobará Gerencia");
    expect(pintar({ clase: "no_conformidad", criticidad: "baja" })).not.toContain("lo aprobará Gerencia");
  });

  it("ofrece solo los procesos que recibe y los orígenes", () => {
    const html = pintar();
    expect(html).toContain("Farmacia");
    expect(html).toContain("Ente de control");
    expect(html).toContain("Auditoría interna");
  });

  it("en una no conformidad ofrece norma y documento y no obliga a escribir la cláusula (basta uno de los tres)", () => {
    const html = renderToStaticMarkup(
      <FormularioHallazgo
        {...props}
        normas={[{ id: 9, nombre: "Resolución 3100 de 2019", titulo: "Habilitación" }]}
        documentos={[{ id: 4, codigo: "FAR-PR-04", titulo: "Cadena de frío" }]}
        valores={{ clase: "no_conformidad", requisitoNormaId: "9" }}
      />,
    );
    expect(html).toContain("Resolución 3100 de 2019");
    expect(html).toContain("FAR-PR-04");
    expect(html).toContain("Indique al menos uno");
    const clausula = html.match(/<input[^>]*name="requisitoClausula"[^>]*>/)![0];
    expect(clausula).not.toContain("required");
  });

  it("repuebla lo escrito tras un rechazo", () => {
    expect(pintar({ titulo: "Un título escrito", descripcion: "Descripción larga escrita" })).toContain("Un título escrito");
  });
});

describe("LoQueSigue", () => {
  it("a quien no tiene el turno le dice quién lo tiene y no ofrece botones", () => {
    const html = renderToStaticMarkup(<LoQueSigue texto="Tiene el turno: la líder del proceso, para aceptar el hallazgo o rechazarlo." />);
    expect(html).toContain("Tiene el turno: la líder del proceso");
    expect(html).not.toMatch(/<(button|a)[\s>]/);
  });

  it("donde iría el botón, la línea de por qué no puede dar el paso, sin botones (recorrido de cierre, D3)", () => {
    const nota = "No puede verificarlo: participó en la corrección o en la ejecución del plan.";
    const html = renderToStaticMarkup(<LoQueSigue texto="Tiene el turno: quien puede verificar, para verificar la implementación." nota={nota} />);
    expect(html).toContain(`<p class="mt-3 text-sm">${nota}</p>`);
    expect(html).not.toMatch(/<(button|a)[\s>]/);
  });
});

describe("fraseDeLoQueSigue (el armador real)", () => {
  it("el turno va en minúscula tras los dos puntos", () => {
    const h = { estado: "por_aceptar" as const, resultadoCierre: null, correccionRequerida: null };
    expect(fraseDeLoQueSigue(h, "La líder del proceso", false)).toBe("Tiene el turno: la líder del proceso, para aceptar el hallazgo o rechazarlo.");
    expect(fraseDeLoQueSigue(h, "La líder del proceso", true)).toBe("A usted le toca aceptar el hallazgo o rechazarlo.");
  });
});

describe("PestanasMejoramiento", () => {
  it("ofrece «Hallazgos» a quien los ve, «Reportes recibidos» a los roles de control y «Mis actividades» y «Mis reportes» a toda sesión", () => {
    expect(pestanasVisibles({ rol: "consulta" }, { veHallazgos: true })).toEqual(["hallazgos", "actividades", "mis-reportes"]);
    expect(pestanasVisibles({ rol: "consulta" }, { veHallazgos: false })).toEqual(["actividades", "mis-reportes"]);
    expect(pestanasVisibles({ rol: "lider_proceso" }, { veHallazgos: true })).toEqual(["hallazgos", "actividades", "mis-reportes"]);
    // Quien registra o ve todo se queda en la lista aunque esté vacía (Tarea 18, ronda 1, ruling 3): su pestaña está.
    expect(pestanasVisibles({ rol: "lider_proceso" }, { veHallazgos: false })).toEqual(["hallazgos", "actividades", "mis-reportes"]);
    expect(pestanasVisibles({ rol: "gerencia" }, { veHallazgos: false })).toEqual(["hallazgos", "reportes", "actividades", "mis-reportes"]);
    expect(pestanasVisibles({ rol: "gerencia" }, { veHallazgos: true })).toEqual(["hallazgos", "reportes", "actividades", "mis-reportes"]);
    // «Planes» (Fase 15B, anexo §3.6): quien crea planes (`mejora.planes`) siempre; los demás, si ven alguno.
    for (const rol of ["admin_sgc", "control_interno"] as const) {
      expect(pestanasVisibles({ rol }, { veHallazgos: true })).toEqual(["hallazgos", "reportes", "actividades", "planes", "mis-reportes"]);
    }
    expect(pestanasVisibles({ rol: "gerencia" }, { veHallazgos: true, vePlanes: true })).toEqual([
      "hallazgos",
      "reportes",
      "actividades",
      "planes",
      "mis-reportes",
    ]);
    expect(pestanasVisibles({ rol: "lider_proceso" }, { veHallazgos: true, vePlanes: true })).toContain("planes");
    expect(pestanasVisibles({ rol: "lider_proceso" }, { veHallazgos: true, vePlanes: false })).not.toContain("planes");
    const enlaces = renderToStaticMarkup(
      <PestanasMejoramiento activa="mis-reportes" visibles={["reportes", "mis-reportes"]} numeros={{ reportes: 2 }} />,
    );
    expect(enlaces).toContain('href="/mejoramiento/reportes?vista=recibidos"');
    expect(enlaces).toContain("Reportes recibidos · 2");
    const mis = enlaces.match(/<a[^>]*>Mis reportes<\/a>/)![0];
    expect(mis).toContain('href="/mejoramiento/reportes"');
    expect(mis).toContain('aria-current="page"');
    const html = renderToStaticMarkup(<PestanasMejoramiento activa="hallazgos" visibles={["hallazgos"]} />);
    expect(html).toContain("Hallazgos");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("border-mod-planes");
  });
});

describe("filtroDeConsulta", () => {
  it("ignora lo que no entiende y lee lo que sí", () => {
    expect(filtroDeConsulta({ origen: "inventado", clase: "observacion", proceso: "abc", vencidos: "1", estado: "abiertos" })).toEqual({
      clase: "observacion",
      soloVencidos: true,
      estado: "abiertos",
    });
  });
});

describe("el panel de parecidos", () => {
  const p = { id: 7, codigo: "HZ-2026-007", titulo: "Algo", etiqueta: "Por aceptar", abierto: true, cuando: "2026-11-17T15:00:00Z" };
  const previa = { consulta: "proceso=3&q=uno", procesoId: "3", parecidos: [p], error: false };

  it("la elección sobrevive a una búsqueda en curso y dice que busca", () => {
    const r = resolverPanelDeParecidos({ consulta: "proceso=3&q=dos", procesoId: "3", respuesta: previa, relacion: "ocurrencia:7" });
    expect(r).toMatchObject({ vigente: "ocurrencia:7", buscando: true, error: false });
    expect(r.parecidos).toEqual([p]);
  });

  it("cuando llega una respuesta que excluye el hallazgo, la elección vuelve a «distinto»", () => {
    const r = resolverPanelDeParecidos({
      consulta: "proceso=3&q=dos",
      procesoId: "3",
      respuesta: { consulta: "proceso=3&q=dos", procesoId: "3", parecidos: [], error: false },
      relacion: "ocurrencia:7",
    });
    expect(r).toMatchObject({ vigente: "distinto", buscando: false, parecidos: [] });
  });

  it("una respuesta no OK dice el error y conserva lo anterior; otro proceso no hereda resultados", () => {
    const r = resolverPanelDeParecidos({
      consulta: "proceso=3&q=dos",
      procesoId: "3",
      respuesta: { ...previa, consulta: "proceso=3&q=dos", error: true },
      relacion: "ocurrencia:7",
    });
    expect(r).toMatchObject({ error: true, buscando: false, vigente: "ocurrencia:7" });
    const otro = resolverPanelDeParecidos({ consulta: "proceso=4&q=uno", procesoId: "4", respuesta: previa, relacion: "ocurrencia:7" });
    expect(otro.parecidos).toEqual([]);
    expect(otro.vigente).toBe("distinto");
  });

  it("sin consulta no hay nada que buscar", () => {
    expect(resolverPanelDeParecidos({ consulta: null, procesoId: "3", respuesta: previa, relacion: "distinto" })).toMatchObject({
      parecidos: [], buscando: false, error: false, vigente: "distinto",
    });
  });
});

describe("la justificación, la nota y el motivo se ven", () => {
  const evento = (id: number, tipo: string, detalle: Record<string, unknown>) => ({
    id, tipo, ronda: 1, quien: "Ana", cuando: new Date("2026-11-18T15:00:00Z"), detalle,
  });

  it("el historial muestra bajo cada evento lo que trae su detalle", () => {
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        eventos={[
          evento(1, "reclasificar", { justificacion: "Se corrige la clasificación", nota: "Es una oportunidad" }),
          evento(2, "anular", { justificacion: "Se registró por error" }),
          evento(3, "aceptar", { estado: { antes: "por_aceptar", despues: "por_corregir" } }),
        ]}
      />,
    );
    expect(html).toContain("Justificación: Se corrige la clasificación");
    expect(html).toContain("Nota: Es una oportunidad");
    expect(html).toContain("Justificación: Se registró por error");
    expect(html).not.toContain("Justificación: undefined");
  });

  it("la identificación muestra las notas de reclasificación con su fecha", () => {
    const h = {
      clase: "oportunidad", origen: "otro", fuente: null, referenciaCaso: null, detectadoEn: "2026-11-10", proceso: "Farmacia",
      requisitoClausula: null, riesgo: null, descripcion: "Descripción original del hallazgo", registradoPor: "Ana",
      registradoEn: new Date("2026-11-10T15:00:00Z"), fechaLimiteEnte: null, reincidenteDe: null,
    } as const;
    const html = renderToStaticMarkup(
      <SeccionIdentificacion hallazgo={h} zona="America/Bogota" abierta notas={[{ cuando: new Date("2026-11-18T15:00:00Z"), nota: "Es una oportunidad" }]} />,
    );
    expect(html).toContain("Nota del 18 de nov de 2026: Es una oportunidad");
    const sin = renderToStaticMarkup(<SeccionIdentificacion hallazgo={h} zona="America/Bogota" abierta />);
    expect(sin).not.toContain("Nota del");
  });
});

describe("FormularioHallazgo en edición", () => {
  it("guarda los cambios, lleva el id del hallazgo y no ofrece parecidos", () => {
    const html = renderToStaticMarkup(
      <FormularioHallazgo
        accion={vi.fn(async () => null)}
        procesos={[{ id: 3, nombre: "Farmacia" }]}
        hoy="2026-11-18"
        diasParaAceptar={3}
        valores={{ titulo: "Un título" }}
        edicion={{ hallazgoId: 41 }}
      />,
    );
    expect(html).toContain("Guardar los cambios");
    expect(html).toMatch(/<input[^>]*name="hallazgoId"[^>]*value="41"/);
    expect(html).not.toContain('name="relacion"');
    expect(html).not.toContain("Parecidos en");
  });
});

describe("los pasos del recorrido hasta el plan (Tarea 10)", () => {
  const accion = vi.fn(async () => null);
  const aviso = (html: string) => html.split(AVISO_SIN_PACIENTES).length - 1;

  it("cada formulario con texto libre lleva el aviso de datos de pacientes", () => {
    expect(aviso(renderToStaticMarkup(<PasoAceptar hallazgoId={7} puedeRechazar aceptar={accion} rechazar={accion} />))).toBe(1);
    expect(
      aviso(renderToStaticMarkup(<PasoTrasRechazo hallazgoId={7} justificacion="No es" enSuLugar={false} retirar={accion} sostener={accion} />)),
    ).toBe(1);
    expect(aviso(renderToStaticMarkup(<PasoArbitrar hallazgoId={7} justificacion={null} replica={null} hoy="2026-11-18" accion={accion} />))).toBe(1);
    expect(aviso(renderToStaticMarkup(<PasoCorregir hallazgoId={7} usuarios={[]} hoy="2026-11-18" accion={accion} />))).toBe(1);
    expect(aviso(renderToStaticMarkup(<PasoDecidir hallazgoId={7} hoy="2026-11-18" accion={accion} />))).toBe(1);
    const validar = renderToStaticMarkup(
      <PasoValidar hallazgoId={7} sinAccion={false} puedeValidar puedeExigir hoy="2026-11-18" validar={accion} devolver={accion} exigir={accion} />,
    );
    // Devolver con su nota y exigir con su justificación: dos textos libres.
    expect(aviso(validar)).toBe(2);
  });

  it("aceptar sin poder rechazar no ofrece el rechazo; con él, pide la justificación", () => {
    const solo = renderToStaticMarkup(<PasoAceptar hallazgoId={7} puedeRechazar={false} aceptar={accion} rechazar={accion} />);
    expect(solo).toContain("Aceptar el hallazgo");
    expect(solo).not.toContain("Rechazar el hallazgo");
    const con = renderToStaticMarkup(<PasoAceptar hallazgoId={7} puedeRechazar aceptar={accion} rechazar={accion} />);
    expect(con).toMatch(/<textarea(?=[^>]*name="justificacion")(?=[^>]*minLength="10")/);
  });

  it("el arbitraje muestra las dos razones y su acta es opcional", () => {
    const html = renderToStaticMarkup(
      <PasoArbitrar hallazgoId={7} justificacion="No es del proceso" replica="Sí lo es" hoy="2026-11-18" accion={accion} />,
    );
    expect(html).toContain("Por qué se rechazó:</span> No es del proceso");
    expect(html).toContain("Réplica de quien lo registró:</span> Sí lo es");
    expect(html).toContain('name="actaNumero"');
    expect(html).not.toMatch(/<input[^>]*name="actaNumero"[^>]*required/);
  });

  it("validar dice si es la corrección o el cierre sin acción, y exigir manda «sí»", () => {
    const sin = renderToStaticMarkup(
      <PasoValidar hallazgoId={7} sinAccion puedeValidar puedeExigir={false} hoy="2026-11-18" validar={accion} devolver={accion} exigir={accion} />,
    );
    expect(sin).toContain("Validar el cierre sin acción");
    expect(sin).not.toContain("Exigir la acción correctiva");
    const exigir = renderToStaticMarkup(
      <PasoValidar hallazgoId={7} sinAccion={false} puedeValidar={false} puedeExigir hoy="2026-11-18" validar={accion} devolver={accion} exigir={accion} />,
    );
    expect(exigir).not.toContain("Validar la corrección");
    expect(exigir).toMatch(/<input[^>]*name="requiere"[^>]*value="si"/);
  });

  it("«2. Corrección» resume lo hecho y la decisión; el historial muestra la réplica y el acta", () => {
    const correccion = {
      requerida: true, descripcion: "Se reubicaron 40 dosis", responsable: "M. Cuéllar", implementadaEn: "2026-11-05",
      registradaEn: new Date("2026-11-05T15:00:00Z"), validadaPor: null, validadaEn: null,
    };
    const html = renderToStaticMarkup(
      <SeccionCorreccion
        correccion={correccion}
        decision={{ accionRequerida: false, justificacion: "Hecho aislado", decididaEn: new Date("2026-11-06T15:00:00Z") }}
        zona="America/Bogota"
        abierta={false}
        archivos={1}
      />,
    );
    expect(html).toContain("2. Corrección");
    expect(html).toContain("Se reubicaron 40 dosis · M. Cuéllar, 5 de nov de 2026 · 1 archivo");
    expect(html).toContain("Hecho aislado");
    const sinCorreccion = renderToStaticMarkup(
      <SeccionCorreccion
        correccion={{ ...correccion, requerida: false, descripcion: "Nada que contener" }}
        decision={{ accionRequerida: null, justificacion: null, decididaEn: null }}
        zona="America/Bogota"
        abierta
        archivos={0}
      />,
    );
    expect(sinCorreccion).toContain("No requirió corrección inmediata");
    expect(sinCorreccion).not.toContain("M. Cuéllar");
    // A quien no ve los archivos no se le cuentan; una descripción larga no desborda la línea del resumen.
    const larga = "Se revisó la cadena de frío de la nevera de vacunas y se reubicaron las dosis en la nevera de respaldo del servicio";
    const actividad = renderToStaticMarkup(
      <SeccionCorreccion
        correccion={{ ...correccion, descripcion: larga }}
        decision={{ accionRequerida: null, justificacion: null, decididaEn: null }}
        zona="America/Bogota"
        abierta={false}
        archivos={null}
      />,
    );
    expect(actividad).not.toMatch(/\d archivos?/);
    expect(actividad).toContain("Se revisó la cadena de frío de la nevera de vacunas y se reubicaron las dosis en la… · M. Cuéllar");
    expect(actividad).toContain(larga);

    const historial = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        eventos={[
          { id: 1, tipo: "sostener", ronda: 1, quien: "Ana", cuando: new Date("2026-11-18T15:00:00Z"), detalle: { replica: "Sí corresponde" } },
          {
            id: 2, tipo: "confirmar_hallazgo", ronda: 1, quien: "Luis", cuando: new Date("2026-11-19T15:00:00Z"),
            detalle: { nota: "Se confirma", acta: { numero: "12", fecha: "2026-11-19" } },
          },
          { id: 3, tipo: "validar_correccion", ronda: 1, quien: "Eva", cuando: new Date("2026-11-20T15:00:00Z"), detalle: { resultado: "sin_accion" } },
        ]}
      />,
    );
    expect(historial).toContain("Sostuvo el hallazgo ante el rechazo");
    expect(historial).toContain("Réplica: Sí corresponde");
    expect(historial).toContain("Acta del Comité: 12, del 19 de nov de 2026");
    expect(historial).toContain("Validó el cierre sin acción");
  });
});

describe("el análisis de causa raíz (maqueta 4)", () => {
  const accion = async () => null;
  const guardado = { id: 7, metodo: "ishikawa", equipo: "Enfermería", observaciones: null, contenido: { causas: [{ categoria: "metodo", texto: "No hay lista de chequeo", confirmada: true, impacto: "alto", requiereAccion: true }] } };

  it("una pestaña por análisis, con el aviso de pacientes y las seis categorías de Ishikawa", () => {
    const vacio = renderToStaticMarkup(<PestanasDeMetodo hallazgoId={1} analisis={[]} guardar={accion} quitar={accion} />);
    expect(vacio).toContain("5 porqués · sin guardar");
    expect(vacio).toContain("No siempre hacen falta los cinco porqués");
    expect(vacio).toContain("Añadir otro análisis");
    expect(vacio).toContain(AVISO_SIN_PACIENTES);
    const conIshikawa = renderToStaticMarkup(<PestanasDeMetodo hallazgoId={1} analisis={[guardado]} guardar={accion} quitar={accion} />);
    for (const categoria of ["Mano de obra", "Método", "Máquina o equipo", "Material", "Medición", "Medio ambiente"]) {
      expect(conIshikawa).toContain(categoria);
    }
    expect(conIshikawa).toContain("Quitar este análisis");
    expect(conIshikawa).toContain("No hay lista de chequeo");
  });

  it("las causas y las dos preguntas llevan su aviso; la vez pasada y la lectura muestran lo guardado", () => {
    expect(renderToStaticMarkup(<CausasRaiz hallazgoId={1} causas={[]} guardar={accion} />)).toContain(AVISO_SIN_PACIENTES);
    const preguntas = renderToStaticMarkup(
      <PreguntasDeCierre hallazgoId={1} respuestas={{ similares: true, similaresDetalle: "Urgencias", cambios: null }} guardar={accion} />,
    );
    expect(preguntas).toContain("¿Hay no conformidades similares en otros procesos?");
    expect(preguntas).toContain("¿Se requieren cambios en documentos, riesgos o controles?");
    expect(preguntas).toContain("Urgencias");
    const vez = renderToStaticMarkup(<LaVezPasada codigo="HZ-2026-003" causas={["Sin lista de chequeo"]} acciones={[]} />);
    expect(vez).toContain("La vez pasada (HZ-2026-003)");
    expect(vez).toContain("Sin lista de chequeo");
    const ronda = {
      id: 1, numero: 1, estadoPlan: "borrador", formularAntesDe: null, enviadoEn: null, aprobadoEn: null, aprobadoRol: null,
      fechaEvaluacion: null, cierrePrevisto: null, resultado: null, similares: true, similaresDetalle: "Urgencias",
      cambios: { documentos: true, riesgos: false, controles: false, descripcion: "Actualizar el procedimiento" },
      analisis: [guardado], causas: [{ id: 1, orden: 1, texto: "No hay lista de chequeo", sinAccionPorque: null }], acciones: [], ajustes: [],
    } as unknown as Parameters<typeof AnalisisEnLectura>[0]["ronda"];
    const lectura = renderToStaticMarkup(<AnalisisEnLectura ronda={ronda} abierta />);
    expect(lectura).toContain("3. Causa raíz");
    expect(lectura).toContain("Confirmada · impacto alto · requiere acción");
    expect(lectura).toContain("Sí: Urgencias");
    expect(lectura).toContain("Sí (documentos): Actualizar el procedimiento");
  });

  it("todos los paneles quedan montados (los inactivos, ocultos) y cada pestaña apunta al suyo", () => {
    const otro = { id: 8, metodo: "otro", equipo: null, observaciones: null, contenido: { nombre: "Lluvia de ideas", descripcion: "Con el equipo" } };
    const html = renderToStaticMarkup(
      <PestanasDeMetodo hallazgoId={1} analisis={[guardado, otro]} guardar={accion} quitar={accion} adjuntos={<p>ADJUNTOS DE LA RONDA</p>} />,
    );
    expect(html).toContain('id="panel-a-7"');
    expect(html).toContain('id="panel-a-8"');
    expect(html).toContain("Lluvia de ideas");
    expect(html).toContain("No hay lista de chequeo");
    expect(html).toMatch(/id="panel-a-7"[^>]*hidden/);
    expect(html).toContain('aria-controls="panel-a-7"');
    expect(html).toContain('tabindex="-1"');
    // Los adjuntos de la ronda están siempre a la vista, no solo dentro de una pestaña «otro».
    expect((html.match(/ADJUNTOS DE LA RONDA/g) ?? []).length).toBe(1);
    expect(html).toContain("Añadir un análisis de 5 porqués");
    expect(html).toContain("Añadir un análisis de Ishikawa (6M)");
    expect(html).toContain("Añadir un análisis con otro método");
    const soloIshikawa = renderToStaticMarkup(
      <PestanasDeMetodo hallazgoId={1} analisis={[guardado]} guardar={accion} quitar={accion} adjuntos={<p>ADJUNTOS DE LA RONDA</p>} />,
    );
    expect(soloIshikawa).toContain("ADJUNTOS DE LA RONDA");
  });

  it("el Ishikawa da a cada control un nombre distinto, el análisis se quita con confirmación y las causas se pueden vaciar", () => {
    const html = renderToStaticMarkup(<PestanasDeMetodo hallazgoId={1} analisis={[guardado]} guardar={accion} quitar={accion} />);
    expect(html).toContain("Causa 1 de Método");
    expect(html).toContain("Confirmada<span class=\"sr-only\"> (causa 1 de Método)</span>");
    expect(html).toContain("Impacto<span class=\"sr-only\"> (causa 1 de Método)</span>");
    expect(html).toContain("Requiere acción<span class=\"sr-only\"> (causa 1 de Método)</span>");
    expect(html).toContain("Quitar la causa 1 de Método");
    expect(html).toContain("Se quitará el análisis de Ishikawa (6M) de esta ronda.");
    expect(renderToStaticMarkup(<CausasRaiz hallazgoId={1} causas={[{ id: 4, texto: "Una", sinAccionPorque: null }]} guardar={accion} />)).toContain(
      "Quitar la causa 1",
    );
    // Cada «Si no requiere acción…» con su nombre propio para un lector de pantalla: el de su causa (recorrido de cierre, D7).
    const dos = renderToStaticMarkup(
      <CausasRaiz hallazgoId={1} causas={[{ id: 4, texto: "Una", sinAccionPorque: null }, { id: 5, texto: "Otra", sinAccionPorque: null }]} guardar={accion} />,
    );
    const nombres = [...dos.matchAll(/<label for="causa-sin-(\d+)"[^>]*>([\s\S]*?)<\/label>/g)].map((m) => sinEtiquetas(m[2]));
    expect(nombres).toEqual([
      "Si no requiere acción, diga por qué (opcional ahora; se pide al enviar el plan) (causa raíz 1)",
      "Si no requiere acción, diga por qué (opcional ahora; se pide al enviar el plan) (causa raíz 2)",
    ]);
  });

  it("la lectura no confía en lo guardado: un contenido que no pasa su esquema no rompe la página", () => {
    const ronda = {
      id: 1, numero: 1, similares: null, similaresDetalle: null, cambios: { raro: true },
      analisis: [{ id: 9, orden: 1, metodo: "ishikawa", equipo: null, observaciones: null, contenido: { causas: "no es una lista" } }],
      causas: [],
    } as unknown as Parameters<typeof AnalisisEnLectura>[0]["ronda"];
    const html = renderToStaticMarkup(<AnalisisEnLectura ronda={ronda} abierta />);
    expect(html).toContain("No se pudo leer este análisis");
  });

  it("la sección «3. Causa raíz» lista los adjuntos de su ronda", () => {
    const ronda = {
      id: 1, numero: 1, similares: null, similaresDetalle: null, cambios: null, analisis: [], causas: [],
    } as unknown as Parameters<typeof AnalisisEnLectura>[0]["ronda"];
    const html = renderToStaticMarkup(
      <AnalisisEnLectura ronda={ronda} abierta>
        <p>acta-de-la-reunion.pdf</p>
      </AnalisisEnLectura>,
    );
    expect(html).toContain("acta-de-la-reunion.pdf");
  });
});

describe("el plan de acción (maqueta 5)", () => {
  const accion = async () => null;
  const causas = [{ id: 11, orden: 1, texto: "El procedimiento no asigna el registro al turno de noche" }];
  const usuarios = [
    { id: 7, nombre: "L. Rojas", cargo: "Regente de farmacia" },
    { id: 8, nombre: "J. Perdomo", cargo: null },
  ];
  const guardada: AccionDelFormulario = {
    id: 3,
    orden: 1,
    tipo: "correctiva",
    descripcion: "Actualizar el procedimiento de cadena de frío",
    causaIds: [11],
    recursos: "",
    indicadorCumplimiento: "Procedimiento publicado y socializado",
    meta: "100 % de los auxiliares",
    actividades: [
      { id: 21, descripcion: "Pedir el cambio documental de FAR-PR-04", responsableId: 7, inicio: "2026-11-14", fin: "2026-11-20" },
      { id: 22, descripcion: "Socializar la versión nueva", responsableId: 9, inicio: "2026-11-21", fin: "2026-12-05" },
    ],
  };

  it("una tarjeta por acción: actividades en filas con nombres distintos, el aviso de pacientes y quitar con confirmación", () => {
    const html = renderToStaticMarkup(
      <TarjetaDeAccion
        hallazgoId={1}
        accion={guardada}
        causas={causas}
        usuarios={usuarios}
        inactivos={[{ id: 9, nombre: "M. Cuéllar" }]}
        guardar={accion}
        quitar={accion}
      />,
    );
    expect(html).toContain("Acción A1");
    expect(html).toContain("1. El procedimiento no asigna el registro al turno de noche");
    expect(html).toMatch(/name="causaIds" checked="" value="11"/);
    expect(html).toContain("Actividad A1.1");
    expect(html).toContain('Responsable<span class="sr-only"> de la actividad A1.2</span>');
    expect(html).toContain('Fin<span class="sr-only"> de la actividad A1.2</span>');
    expect(html).toContain('Quitar<span class="sr-only"> la actividad A1.1</span>');
    expect(html).toContain("Añadir otra actividad");
    expect(html).toContain("L. Rojas · Regente de farmacia");
    // Un responsable guardado que ya no está activo se nombra, no se pierde.
    expect(html).toContain("M. Cuéllar (ya no está activo)");
    expect(html).toContain(AVISO_SIN_PACIENTES);
    expect(html).toContain("Quitar esta acción");
    expect(html).toContain("Se quitará la acción A1 del plan, con sus 2 actividades.");
    // Las actividades viajan como JSON con su id.
    expect(html).toContain("&quot;id&quot;:21");
    // Quitar una fila lleva el foco a «Añadir otra actividad»; volver a montar la tarjeta, a su «Guardar».
    expect(html).toContain('id="accion-3-anadir-actividad"');
    expect(html).toContain('id="accion-3-guardar"');
  });

  it("sin acciones abre una vacía con el tipo que propone la clase; se descarta sin confirmar", () => {
    const html = renderToStaticMarkup(
      <FormularioPlan hallazgoId={1} tipoPropuesto="preventiva" acciones={[]} causas={[]} usuarios={usuarios} guardar={accion} quitar={accion} />,
    );
    expect(html).toContain("Acción A1 (sin guardar)");
    expect(html).toMatch(/<option value="preventiva" selected="">Preventiva<\/option>/);
    expect(html).toContain("Descartar esta acción");
    expect(html).not.toContain("Quitar esta acción");
    expect(html).toContain("Añadir otra acción");
    // Descartar o quitar una acción lleva el foco a «Añadir otra acción».
    expect(html).toContain('id="plan-anadir-accion"');
    expect(html).toContain("se escriben en la pestaña «Causa raíz»");
    const conUna = renderToStaticMarkup(
      <FormularioPlan hallazgoId={1} tipoPropuesto="correctiva" acciones={[guardada]} causas={causas} usuarios={usuarios} guardar={accion} quitar={accion} />,
    );
    expect(conUna).not.toContain("(sin guardar)");
  });

  it("el criterio de eficacia: la fecha que calcula el servidor, el indicador con su periodicidad y la fecha de evaluación solo fuera de la no conformidad", () => {
    const indicadores = [{ id: 5, codigo: "FAR-ID-002", nombre: "Registros de temperatura completos", periodicidad: "mensual" as const }];
    const nc = renderToStaticMarkup(
      <CriterioDeEficacia
        hallazgoId={1}
        clase="no_conformidad"
        criterios={["mejora_indicador"]}
        criterioOtro={null}
        indicadorId={5}
        fechaEvaluacion={null}
        indicadores={indicadores}
        evaluableDesde="2027-03-01"
        guardar={accion}
      />,
    );
    for (const c of ["No recurrencia", "Mejora del indicador asociado", "Reducción de PQRS o eventos", "Otro"]) expect(nc).toContain(c);
    expect(nc).toContain("Con este plan la eficacia se podrá evaluar desde el <strong>1 de marzo de 2027</strong>.");
    expect(nc).toContain("FAR-ID-002 Registros de temperatura completos · mensual");
    expect(nc).not.toContain("Fecha de evaluación");
    expect(nc).toContain(AVISO_SIN_PACIENTES);
    const obs = renderToStaticMarkup(
      <CriterioDeEficacia
        hallazgoId={1}
        clase="observacion"
        criterios={["otro"]}
        criterioOtro="Auditoría de seguimiento"
        indicadorId={99}
        fechaEvaluacion="2027-01-15"
        indicadores={indicadores}
        evaluableDesde={null}
        guardar={accion}
      />,
    );
    expect(obs).toContain("Fecha de evaluación");
    expect(obs).toContain('value="2027-01-15"');
    expect(obs).toContain("Auditoría de seguimiento");
    expect(obs).toContain("aparece cuando el plan tenga actividades guardadas");
    // Un indicador guardado que ya no se puede elegir: lo dice y no queda ninguno elegido.
    const noElegible = renderToStaticMarkup(
      <CriterioDeEficacia
        hallazgoId={1}
        clase="no_conformidad"
        criterios={["mejora_indicador"]}
        criterioOtro={null}
        indicadorId={99}
        fechaEvaluacion={null}
        indicadores={indicadores}
        evaluableDesde={null}
        guardar={accion}
      />,
    );
    expect(noElegible).toContain("El indicador elegido ya no se puede enlazar");
    expect(noElegible).toContain('<option value="" selected="">Elija el indicador</option>');
    expect(noElegible).not.toMatch(/<option value="5" selected="">/);
  });

  it("quien ve el hallazgo por una actividad lee «3. Causa raíz» y «4. Plan de acción», sin los adjuntos del análisis", () => {
    const ronda = { numero: 1, analisis: [{}], causas: [{}], similares: false, acciones: [{}], criterios: ["no_recurrencia"] };
    expect(seccionesDeLaRonda({ ve: "actividad", estado: "en_ejecucion", ronda: 1 }, ronda)).toEqual({ causaRaiz: true, plan: true, adjuntos: false });
    expect(seccionesDeLaRonda({ ve: "completo", estado: "en_ejecucion", ronda: 1 }, ronda)).toEqual({ causaRaiz: true, plan: true, adjuntos: true });
    // Una ronda en curso «Por formular» y vacía muestra las dos secciones; una anterior vacía, ninguna.
    const vacia = { numero: 1, analisis: [], causas: [], similares: null, acciones: [], criterios: [] };
    expect(seccionesDeLaRonda({ ve: "completo", estado: "por_formular", ronda: 1 }, vacia)).toEqual({ causaRaiz: true, plan: true, adjuntos: true });
    expect(seccionesDeLaRonda({ ve: "completo", estado: "por_formular", ronda: 2 }, vacia)).toEqual({ causaRaiz: false, plan: false, adjuntos: false });
  });

  it("«4. Plan de acción» en lectura: acción, actividades, responsable, fin, avance y estado; el indicador solo a quien lo ve", () => {
    const ronda = {
      id: 1, numero: 1, estadoPlan: "aprobado", fechaEvaluacion: null, criterios: ["mejora_indicador", "otro"], criterioOtro: "Auditoría de seguimiento",
      indicadorEficaciaId: 5,
      causas: [{ id: 11, orden: 1, texto: "El procedimiento no asigna el registro", sinAccionPorque: null }],
      acciones: [
        {
          id: 3, orden: 1, tipo: "correctiva", descripcion: "Actualizar el procedimiento de cadena de frío", recursos: null,
          indicadorCumplimiento: "Procedimiento publicado", meta: null, causaIds: [11],
          actividades: [
            { id: 21, orden: 1, descripcion: "Pedir el cambio documental", responsableId: 7, responsable: "L. Rojas", responsableActivo: true,
              inicio: "2026-11-14", finOriginal: "2026-11-20", fin: "2026-11-20", vence: "2026-11-20", avance: 60, estado: "en_proceso", reprogramaciones: 0 },
            { id: 22, orden: 2, descripcion: "Comprar e instalar el equipo", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
              inicio: "2026-11-01", finOriginal: "2026-11-14", fin: "2026-11-14", vence: "2026-11-14", avance: 30, estado: "en_proceso", reprogramaciones: 0 },
          ],
        },
      ],
      ajustes: [],
    } as unknown as Parameters<typeof PlanEnLectura>[0]["ronda"];
    const visible = { visible: true as const, codigo: "FAR-ID-002", nombre: "Registros de temperatura completos", periodicidad: "mensual" as const };
    const html = renderToStaticMarkup(<PlanEnLectura ronda={ronda} abierta hoy="2026-11-18" indicador={visible} />);
    expect(html).toContain("4. Plan de acción");
    expect(html).toContain("Aprobado");
    expect(html).toContain("A1 · Correctiva.");
    expect(html).toContain("Ataca la causa 1 · indicador de cumplimiento: Procedimiento publicado");
    expect(html).toContain("A1.1");
    expect(html).toContain("L. Rojas");
    expect(html).toContain("60 %");
    expect(html).toContain("En proceso");
    expect(html).toContain("Vencida hace 4 días");
    expect(html).toContain("mejora del indicador FAR-ID-002 «Registros de temperatura completos» (mensual), otro: Auditoría de seguimiento");
    const oculto = renderToStaticMarkup(<PlanEnLectura ronda={ronda} abierta hoy="2026-11-18" indicador={{ visible: false }} />);
    expect(oculto).toContain("mejora de un indicador");
    expect(oculto).not.toContain("FAR-ID-002");
    expect(oculto).not.toContain("Registros de temperatura");
  });

  it("lo que le falta al plan se lista antes de enviar; el historial nombra la acción por su etiqueta", () => {
    const con = renderToStaticMarkup(<FaltasDelPlan faltas={["Falta el análisis de causa raíz", "Defina el criterio de eficacia"]} />);
    expect(con).toContain("Para enviar a revisión");
    expect(con).toContain("Faltan 2 cosas:");
    expect(con).toContain("Defina el criterio de eficacia");
    expect(renderToStaticMarkup(<FaltasDelPlan faltas={[]} />)).toContain("tienen todo lo que se pide para enviarse");
    const cuando = new Date("2026-11-18T15:00:00Z");
    const historial = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        eventos={[
          { id: 1, tipo: "accion_guardada", ronda: 1, quien: "L. Rojas", cuando, detalle: { accion: "A1", accionId: 3, actividades: 2 } },
          { id: 2, tipo: "accion_quitada", ronda: 1, quien: "L. Rojas", cuando, detalle: { accion: "A2", accionId: 4, actividades: 1 } },
          { id: 3, tipo: "criterio_guardado", ronda: 1, quien: "L. Rojas", cuando, detalle: { criterios: ["no_recurrencia"] } },
        ]}
      />,
    );
    expect(historial).toContain("Guardó la acción A1 del plan");
    expect(historial).toContain("Quitó la acción A2 del plan");
    expect(historial).toContain("Guardó el criterio de eficacia");
  });
});

describe("las firmas del plan (maqueta 5)", () => {
  const accion = vi.fn(async () => null);
  const aviso = (html: string) => html.split(AVISO_SIN_PACIENTES).length - 1;
  const HUELLA = "ab12" + "0".repeat(56) + "cd34";
  const firmada = (nombre: string, cuando: string) => ({ nombre, cargo: "Regente de farmacia", cuando: new Date(cuando) });
  const deLaBase = (firma: "elaboro" | "reviso" | "aprobo", cuando: string, ronda = 1) => ({
    firma,
    ronda,
    nombre: `Quien firmó ${firma}`,
    cargo: null,
    cuando: new Date(cuando),
    huella: HUELLA,
  });

  it("firmasDelEnvio: las del último envío de la ronda; con el plan otra vez en borrador, ninguna", () => {
    const firmas = [
      deLaBase("elaboro", "2026-11-10T15:00:00Z"),
      deLaBase("reviso", "2026-11-11T15:00:00Z"),
      deLaBase("elaboro", "2026-11-13T15:00:00Z"),
      deLaBase("elaboro", "2026-11-14T15:00:00Z", 2),
    ];
    const vigente = firmasDelEnvio(firmas, 1, "enviado");
    expect(vigente.elaboro?.cuando.toISOString()).toBe("2026-11-13T15:00:00.000Z");
    // La «Revisó» de antes de la devolución no es de este envío.
    expect(vigente.reviso).toBeNull();
    expect(firmasDelEnvio(firmas, 1, "borrador")).toEqual({ elaboro: null, reviso: null, aprobo: null });
    expect(firmasDelEnvio(firmas, 3, "enviado")).toEqual({ elaboro: null, reviso: null, aprobo: null });
  });

  it("razonDeGerencia dice la primera de las cuatro condiciones, o nada si la revisión vale como aprobación", () => {
    const nc = { clase: "no_conformidad" as const, criticidad: "media" as const, origen: "auditoria_interna" as const };
    expect(razonDeGerencia(nc, { requiereRecursos: false, elaboroAdmin: false })).toBeNull();
    // Cada razón se lee tras «porque» (recorrido de cierre, D2): «Le toca a Gerencia porque la criticidad es alta».
    expect(razonDeGerencia({ ...nc, criticidad: "alta" }, { requiereRecursos: false, elaboroAdmin: false })).toBe("la criticidad es alta");
    expect(razonDeGerencia({ ...nc, origen: "ente_control" }, { requiereRecursos: false, elaboroAdmin: false })).toBe("el origen es externo");
    expect(razonDeGerencia(nc, { requiereRecursos: true, elaboroAdmin: false })).toBe("requiere recursos adicionales o tiene impacto institucional");
    expect(razonDeGerencia(nc, { requiereRecursos: false, elaboroAdmin: true })).toBe("lo elaboró el Administrador del SGC");
  });

  it("el panel: cada firma con su estado en texto y su plazo; Gerencia dice por qué aplica", () => {
    const vence = new Date("2026-11-24T04:59:59Z");
    const html = renderToStaticMarkup(
      <PanelDeFirmas
        firmas={{ elaboro: null, reviso: null, aprobo: null }}
        elabora="Usted, con su clave, al enviar"
        sinRevision={false}
        gerencia="la criticidad es alta"
        enCurso="elaboro"
        vence={vence}
        plazos={{ revisar: 3, aprobar: 3 }}
        contexto={CONTEXTO}
      />,
    );
    for (const t of ["Elaboró", "Revisó", "Aprobó"]) expect(html).toContain(t);
    expect(html).toContain("Usted, con su clave, al enviar");
    expect(html).toContain("Administrador del SGC · 3 días hábiles");
    expect(html).toContain("Gerencia · aplica: la criticidad es alta · 3 días hábiles");
    expect(html.split(">Pendiente<").length - 1).toBe(3);
    const t = textoDeVence(vence, CONTEXTO)!;
    expect(html).toContain(`Vence el ${t.fecha} · ${t.plazo}`);
    // Sin ninguna condición fija, Gerencia depende de la revisión.
    const depende = renderToStaticMarkup(
      <PanelDeFirmas
        firmas={{ elaboro: null, reviso: null, aprobo: null }}
        elabora="Usted, con su clave, al enviar"
        sinRevision={false}
        gerencia={null}
        enCurso="elaboro"
        vence={null}
        plazos={{ revisar: 3, aprobar: 3 }}
        contexto={CONTEXTO}
      />,
    );
    expect(depende).toContain("Gerencia · solo si la revisión marca recursos adicionales o impacto institucional");
  });

  it("las firmadas dicen quién y cuándo; sin revisión, o sin Gerencia tras la revisión, «No aplica» con su porqué", () => {
    const elaboro = firmada("L. Rojas", "2026-11-18T15:00:00Z");
    const reviso = firmada("M. Díaz", "2026-11-19T15:00:00Z");
    const aprobada = renderToStaticMarkup(
      <PanelDeFirmas
        firmas={{ elaboro, reviso, aprobo: null }}
        elabora="La líder del proceso"
        sinRevision={false}
        gerencia={null}
        enCurso={null}
        vence={null}
        plazos={{ revisar: 3, aprobar: 3 }}
        contexto={CONTEXTO}
      />,
    );
    expect(aprobada.split(">Firmada<").length - 1).toBe(2);
    expect(aprobada).toContain("L. Rojas · Regente de farmacia");
    expect(aprobada).toContain(fechaYHora(elaboro.cuando, "America/Bogota"));
    expect(aprobada).toContain(">No aplica<");
    expect(aprobada).toContain("La revisión valió como aprobación");
    const sinRevision = renderToStaticMarkup(
      <PanelDeFirmas
        firmas={{ elaboro, reviso: null, aprobo: null }}
        elabora="La líder del proceso"
        sinRevision
        gerencia="lo elaboró el Administrador del SGC"
        enCurso="aprobo"
        vence={new Date("2026-11-24T04:59:59Z")}
        plazos={{ revisar: 3, aprobar: 3 }}
        contexto={CONTEXTO}
      />,
    );
    expect(sinRevision).toContain("No hay otro Administrador del SGC activo: nadie firma «Revisó» sobre lo que elaboró");
    expect(sinRevision).toContain("Gerencia · aplica: lo elaboró el Administrador del SGC");
  });

  it("enviar: con faltas no ofrece la firma; sin ellas, «Enviar a revisión» (o a aprobación) y las observaciones de la devolución", () => {
    const comun = { hallazgoId: 7, huella: HUELLA, pideCodigo: false, accion };
    const con = renderToStaticMarkup(<PasoEnviar {...comun} faltas={2} saltaRevision={false} devuelto={null} />);
    expect(con).not.toContain("Enviar a revisión");
    expect(con).toContain("Complete lo que falta para enviar el análisis y el plan.");
    const sin = renderToStaticMarkup(<PasoEnviar {...comun} faltas={0} saltaRevision={false} devuelto="Falta decir quién verifica el registro" />);
    expect(sin).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Enviar a revisión<\/button>/);
    expect(sin).toContain("Falta decir quién verifica el registro");
    const directo = renderToStaticMarkup(<PasoEnviar {...comun} faltas={0} saltaRevision devuelto={null} />);
    expect(directo).toContain(">Enviar a aprobación<");
  });

  it("revisar: las causas sin acción, la casilla de recursos con su nota, devolver con observaciones y firmar la revisión", () => {
    const html = renderToStaticMarkup(
      <PasoRevisar
        hallazgoId={7}
        causasSinAccion={[{ orden: 2, texto: "No hay registrador en el turno de noche", porque: "Se compró uno el mes pasado" }]}
        gerencia={null}
        huella={HUELLA}
        pideCodigo={false}
        firmar={accion}
        devolver={accion}
      >
        <p>Los parecidos</p>
      </PasoRevisar>,
    );
    expect(html).toContain("Causas sin acción");
    expect(html).toContain("No hay registrador en el turno de noche");
    expect(html).toContain("Se compró uno el mes pasado");
    expect(html).toContain("<p>Los parecidos</p>");
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).toContain("Requiere recursos adicionales o tiene impacto institucional");
    // Sin la casilla, la nota no se edita y su rótulo dice que se usa solo con ella.
    expect(html).toMatch(/<textarea(?=[^>]*name="notaRecursos")(?=[^>]*disabled="")/);
    expect(html).toContain("se usa solo si marca la casilla");
    expect(html).not.toContain("opacity");
    // La nota de los recursos y las observaciones de la devolución: dos textos libres.
    expect(aviso(html)).toBe(2);
    expect(html).toContain("Devolver con observaciones");
    expect(html).toMatch(/<textarea(?=[^>]*name="observaciones")(?=[^>]*minLength="10")/);
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Firmar la revisión<\/button>/);
    expect(html).toContain("su revisión vale como aprobación");
    const aGerencia = renderToStaticMarkup(
      <PasoRevisar hallazgoId={7} causasSinAccion={[]} gerencia="la criticidad es alta" huella={HUELLA} pideCodigo={false} firmar={accion} devolver={accion} />,
    );
    expect(aGerencia).toContain("el plan pasa a Gerencia para su aprobación (la criticidad es alta)");
    expect(aGerencia).toContain("Todas las causas tienen al menos una acción.");
  });

  it("aprobar: la firma «Aprobó», devolver con observaciones, por qué le toca a Gerencia y la nota del revisor", () => {
    const html = renderToStaticMarkup(
      <PasoAprobar
        hallazgoId={7}
        gerencia="requiere recursos adicionales o tiene impacto institucional"
        notaRecursos="Hay que comprar un registrador de temperatura"
        huella={HUELLA}
        pideCodigo={false}
        aprobar={accion}
        devolver={accion}
      />,
    );
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Aprobar el plan<\/button>/);
    expect(html).toContain("Devolver con observaciones");
    expect(html).toContain("Le toca a Gerencia porque requiere recursos adicionales o tiene impacto institucional.");
    expect(html).toContain("Hay que comprar un registrador de temperatura");
    expect(aviso(html)).toBe(1);
  });

  it("la frase de por qué aprueba Gerencia es gramatical con cada razón (recorrido de cierre, D2)", () => {
    const nc = { clase: "no_conformidad" as const, criticidad: "alta" as const, origen: "auditoria_interna" as const };
    const frase = (h: typeof nc | { clase: "no_conformidad"; criticidad: "media"; origen: "ente_control" }) =>
      renderToStaticMarkup(
        <PasoAprobar
          hallazgoId={7}
          gerencia={razonDeGerencia(h, { requiereRecursos: false, elaboroAdmin: false })}
          notaRecursos={null}
          huella={HUELLA}
          pideCodigo={false}
          aprobar={accion}
          devolver={accion}
        />,
      );
    expect(frase(nc)).toContain("Le toca a Gerencia porque la criticidad es alta.");
    expect(frase({ clase: "no_conformidad", criticidad: "media", origen: "ente_control" })).toContain("Le toca a Gerencia porque el origen es externo.");
  });

  it("el historial muestra lo que dijo quien devolvió el plan y la nota de recursos de la revisión", () => {
    const cuando = new Date("2026-11-18T15:00:00Z");
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        eventos={[
          { id: 1, tipo: "devolver_plan", ronda: 1, quien: "M. Díaz", cuando, detalle: { observaciones: "Falta decir quién verifica el registro" } },
          { id: 2, tipo: "revisar_plan", ronda: 1, quien: "M. Díaz", cuando, detalle: { requiereRecursos: true, notaRecursos: "Un registrador nuevo" } },
        ]}
      />,
    );
    expect(html).toContain("Devolvió el plan");
    expect(html).toContain("Observaciones: Falta decir quién verifica el registro");
    expect(html).toContain("Recursos o impacto institucional: Un registrador nuevo");
  });

  it("los parecidos de otros procesos: el código enlaza al hallazgo, con su estado en texto y su proceso; sin ellos, lo dice", () => {
    const html = renderToStaticMarkup(
      <ParecidosDeOtrosProcesos
        parecidos={[
          {
            id: 31,
            codigo: "HZ-2026-031",
            titulo: "Neveras de urgencias sin registro de temperatura",
            etiqueta: "En ejecución",
            abierto: true,
            cuando: new Date("2026-10-02T15:00:00Z"),
            proceso: "Urgencias",
          },
        ]}
      />,
    );
    expect(html).toContain('href="/mejoramiento/31"');
    expect(html).toContain("HZ-2026-031");
    expect(html).toContain("En ejecución");
    expect(html).toContain("Urgencias");
    expect(renderToStaticMarkup(<ParecidosDeOtrosProcesos parecidos={[]} />)).toContain("No hay hallazgos parecidos en otros procesos.");
  });
});

describe("las actividades (maqueta 6)", () => {
  const accion = vi.fn(async () => null);
  const aviso = (html: string) => html.split(AVISO_SIN_PACIENTES).length - 1;

  const actividad = (extra?: Partial<DetalleDeActividad>): DetalleDeActividad => ({
    id: 22,
    etiqueta: "A2.1",
    descripcion: "Comprar e instalar el equipo",
    responsableId: 8,
    responsable: "J. Perdomo",
    responsableActivo: true,
    inicio: "2026-11-01",
    finOriginal: "2026-11-14",
    fin: "2026-11-14",
    vence: "2026-11-14",
    avance: 30,
    estado: "en_proceso",
    reprogramaciones: 0,
    terminadaEn: null,
    terminadaPor: null,
    verificacion: null,
    verificacionNota: null,
    corregirAntesDe: null,
    vencida: true,
    accion: { id: 5, etiqueta: "A2", tipo: "correctiva", descripcion: "Instalar un termómetro con registro automático" },
    hallazgo: { id: 14, codigo: "HZ-2026-014", titulo: "Dos turnos sin registro", proceso: "Farmacia", estado: "en_ejecucion", etiqueta: "En ejecución", ronda: 1, ve: "actividad" },
    seguimientos: [
      { id: 2, fecha: "2026-11-10", realizado: "Se pidieron tres cotizaciones.", avance: 30, barreras: "Sin existencias del equipo", quien: "J. Perdomo", creadoEn: new Date("2026-11-10T15:00:00Z") },
      { id: 1, fecha: "2026-11-06", realizado: "Se definieron las especificaciones con la regente.", avance: 10, barreras: null, quien: "J. Perdomo", creadoEn: new Date("2026-11-06T15:00:00Z") },
    ],
    archivos: [],
    esResponsable: true,
    puedeSeguir: true,
    puedeReasignar: false,
    avanceMinimo: 30,
    ajustePendiente: null,
    puedePedirAjuste: false,
    gerenciaEn: null,
    ajustes: [],
    ...extra,
  });

  const pagina = (a: DetalleDeActividad, x?: { subida?: string | null }) =>
    renderToStaticMarkup(
      <PaginaDeActividad
        actividad={a}
        hoy="2026-11-18"
        usuarios={[{ id: 8, nombre: "J. Perdomo" }, { id: 9, nombre: "M. Cuéllar" }]}
        subida={x?.subida ?? null}
        quitables={[]}
        acciones={{ seguimiento: accion, terminar: accion, reasignar: accion, pedirAjuste: accion }}
      />,
    );

  it("la actividad con una reprogramación aprobada lleva la marca «Reprogramada» junto a su fecha original (recorrido de cierre, D4)", () => {
    const reprogramada = pagina(actividad({ fin: "2026-12-08", vence: "2026-12-08", vencida: false, reprogramaciones: 1 }));
    expect(sinEtiquetas(reprogramada)).toContain(`Fin: ${fechaDeDia("2026-12-08")}original: ${fechaDeDia("2026-11-14")}${REPROGRAMADA}`);
    expect(reprogramada).toMatch(new RegExp(`<span[^>]*data-variante="neutra"[^>]*>${REPROGRAMADA}</span>`));
    expect(pagina(actividad())).not.toContain(REPROGRAMADA);
    // La misma regla y el mismo texto que el impreso y el Excel.
    expect(estadoDeActividadEnTexto({ estado: "en_proceso", verificacion: null, reprogramada: esReprogramada({ reprogramaciones: 1 }), vencida: null })).toBe(
      `En proceso · ${REPROGRAMADA}`,
    );
    expect(esReprogramada({ reprogramaciones: 0 })).toBe(false);
  });

  it("el formulario de seguimiento lleva el aviso de pacientes, la fecha hasta hoy y el avance desde el del anterior", () => {
    const html = renderToStaticMarkup(<FormularioSeguimiento actividadId={22} hoy="2026-11-18" avanceActual={30} avanceMinimo={30} accion={accion} />);
    expect(aviso(html)).toBe(1);
    expect(html).toContain('name="actividadId" value="22"');
    expect(html).toContain('name="realizado"');
    expect(html).toMatch(/name="avance"[^>]*min="30"[^>]*max="100"|min="30"[^>]*max="100"[^>]*name="avance"/);
    expect(html).toMatch(/type="date"[^>]*max="2026-11-18"/);
    expect(html).toContain('name="barreras"');
    expect(html).toContain("No puede ser menor que 30 %, el del seguimiento anterior.");
    expect(html).toContain("Guardar seguimiento");
  });

  it("terminar dice lo que falta y pide confirmarlo", () => {
    const html = renderToStaticMarkup(
      <TerminarActividad actividadId={22} faltan={["el avance en 100 %", "al menos un archivo de evidencia"]} accion={accion} />,
    );
    expect(html).toContain("Para terminar hace falta el avance en 100 % y al menos un archivo de evidencia.");
    expect(html).toContain("Terminar");
    const lista = renderToStaticMarkup(<TerminarActividad actividadId={22} faltan={[]} accion={accion} />);
    expect(lista).not.toContain("Para terminar hace falta");
  });

  it("el foco de «Terminar»: al abrir la confirmación va a «Sí, terminarla»; al cancelarla vuelve a «Terminar»; al montar, a ninguno", () => {
    expect(focoDeLaConfirmacion(true, false)).toBe("confirmar");
    expect(focoDeLaConfirmacion(false, true)).toBe("terminar");
    expect(focoDeLaConfirmacion(false, false)).toBeNull();
  });

  it("los seguimientos, del más reciente al más antiguo, con quién, cuánto y las barreras", () => {
    const html = renderToStaticMarkup(<ListaDeSeguimientos seguimientos={actividad().seguimientos} />);
    expect(html.indexOf("tres cotizaciones")).toBeLessThan(html.indexOf("especificaciones"));
    expect(html).toContain("J. Perdomo");
    expect(html).toContain("30 %");
    expect(html).toContain("Barreras: Sin existencias del equipo");
    expect(renderToStaticMarkup(<ListaDeSeguimientos seguimientos={[]} />)).toContain("Aún no hay seguimientos.");
  });

  it("la página: qué hacer, de qué acción y hallazgo, el avance, el formulario, la evidencia y terminar", () => {
    const html = pagina(actividad(), { subida: "/api/mejoramiento/actividades/22/archivos" });
    expect(html).toContain("Vencida hace 4 días");
    expect(html).toContain(`Fin: ${fechaDeDia("2026-11-14")}`);
    expect(html).toContain("Acción A2 · Correctiva");
    expect(html).toContain("Instalar un termómetro con registro automático");
    expect(html).toContain("HZ-2026-014");
    expect(html).toContain('href="/mejoramiento/14"');
    expect(html).toContain("Ver el hallazgo");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain(`último seguimiento: ${fechaDeDia("2026-11-10")}`);
    expect(html).toContain("Registrar seguimiento");
    expect(aviso(html)).toBe(1);
    expect(html).toContain("Zona de carga de la evidencia de la actividad");
    expect(html).toContain("Para terminar hace falta el avance en 100 % y al menos un archivo de evidencia.");
    expect(html).toContain("Seguimientos");
    expect(html).not.toContain("Reasignar");
  });

  it("quien solo la lee no ve el formulario ni terminar; una terminada dice cuándo y quién", () => {
    const html = pagina(
      actividad({ estado: "terminada", vencida: false, avance: 100, puedeSeguir: false, esResponsable: false, terminadaEn: new Date("2026-11-16T15:00:00Z"), terminadaPor: "J. Perdomo" }),
    );
    expect(html).not.toContain("Registrar seguimiento");
    expect(html).not.toContain("Para terminar");
    expect(html).toContain("Terminada");
    expect(html).toContain(`Terminada el ${fechaDeDia("2026-11-16")} por J. Perdomo`);
  });

  it("una actividad devuelta muestra la nota de quien verificó y la fecha para corregir", () => {
    const html = pagina(actividad({ verificacion: "devuelta", verificacionNota: "Falta la foto del registrador instalado", corregirAntesDe: "2026-11-25", avanceMinimo: 0 }));
    expect(html).toContain("Devuelta en la verificación");
    expect(html).toContain("Falta la foto del registrador instalado");
    expect(html).toContain(`Corríjala antes del ${fechaDeDia("2026-11-25")}`);
  });

  it("un responsable inactivo se dice con texto, y quien puede la reasigna (con el aviso de pacientes)", () => {
    const html = pagina(actividad({ responsableActivo: false, esResponsable: false, puedeSeguir: false, puedeReasignar: true, hallazgo: { ...actividad().hallazgo, ve: "completo" } }));
    expect(html).toContain("Responsable inactivo");
    expect(html).toContain("Reasignar");
    expect(aviso(html)).toBe(1);
    // Una terminada ya no necesita a su responsable: no lo marca.
    const terminada = pagina(actividad({ estado: "terminada", vencida: false, responsableActivo: false, esResponsable: false, puedeSeguir: false }));
    expect(terminada).not.toContain("Responsable inactivo");
    const dialogo = renderToStaticMarkup(
      <DialogoReasignar actividadId={22} etiqueta="A2.1" responsableId={8} responsable="J. Perdomo" usuarios={[{ id: 8, nombre: "J. Perdomo" }, { id: 9, nombre: "M. Cuéllar" }]} accion={accion} />,
    );
    expect(dialogo).toContain('name="responsableId"');
    expect(dialogo).toContain("M. Cuéllar");
    expect(dialogo).not.toContain('value="8"');
    expect(dialogo).toContain('name="motivo"');
    expect(dialogo).toContain('minLength="10"');
    expect(aviso(dialogo)).toBe(1);
  });

  it("«Mis actividades»: cada una enlaza a la suya, con el hallazgo, el fin, el avance y el estado en texto", () => {
    const html = renderToStaticMarkup(
      <MisActividades
        hoy="2026-11-18"
        actividades={[
          { id: 22, descripcion: "Comprar e instalar el equipo", hallazgoId: 14, hallazgoCodigo: "HZ-2026-014", etiqueta: "A2.1", fin: "2026-11-14", vence: "2026-11-14", avance: 30, estado: "en_proceso", vencida: true, devuelta: false },
          { id: 23, descripcion: "Capacitar al turno de noche", hallazgoId: 14, hallazgoCodigo: "HZ-2026-014", etiqueta: "A2.2", fin: "2026-12-01", vence: "2026-12-01", avance: 0, estado: "abierta", vencida: false, devuelta: true },
          { id: 24, descripcion: "Pedir el cambio documental", hallazgoId: 14, hallazgoCodigo: "HZ-2026-014", etiqueta: "A1.1", fin: "2026-11-10", vence: "2026-11-10", avance: 100, estado: "terminada", vencida: false, devuelta: false },
        ]}
      />,
    );
    expect(html).toContain('href="/mejoramiento/actividades/22"');
    expect(html).toContain("HZ-2026-014 · A2.1");
    expect(html).toContain("Vencida hace 4 días");
    expect(html).toContain("Devuelta");
    expect(html).toContain("Abierta");
    expect(html).toContain("Terminada");
    expect(html).toContain("30 %");
    expect(html.indexOf("Comprar e instalar")).toBeLessThan(html.indexOf("Pedir el cambio documental"));
    expect(renderToStaticMarkup(<MisActividades hoy="2026-11-18" actividades={[]} />)).toContain("No tiene actividades a su cargo");
  });

  it("el historial dice el seguimiento, la actividad terminada y la reasignación con su motivo, sin el texto del seguimiento", () => {
    const evento = (id: number, tipo: string, detalle: Record<string, unknown>) => ({
      id, tipo, ronda: 1, quien: "Ana", cuando: new Date("2026-11-18T15:00:00Z"), detalle,
    });
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        etiquetasDeActividad={{ 22: "A2.1" }}
        eventos={[
          evento(1, "seguimiento", { actividadId: 22, actividad: "A2.1", seguimientoId: 3, avance: { antes: 10, despues: 30 } }),
          evento(2, "actividad_terminada", { actividadId: 22, actividad: "A2.1", archivos: 1 }),
          { ...evento(3, "reasignada", { actividadId: 22, antes: 8, despues: 9, motivo: "Cambió de servicio y ya no atiende" }), personas: { de: "J. Perdomo", a: "M. Cuéllar" } },
          evento(4, "reasignada", { actividadId: 99, antes: 8, despues: 9, motivo: "Salió de vacaciones largas" }),
        ]}
      />,
    );
    expect(html).toContain("Registró un seguimiento de la actividad A2.1 (30 %)");
    expect(html).toContain("Terminó la actividad A2.1");
    expect(html).toContain("Reasignó la actividad A2.1 de J. Perdomo a M. Cuéllar");
    expect(html).toContain("Motivo: Cambió de servicio y ya no atiende");
    expect(html).toContain("Reasignó una actividad");
  });

  it("«4. Plan de acción» enlaza las actividades que quien mira abre, con el avance de la acción y el responsable inactivo", () => {
    const ronda = {
      id: 1, numero: 1, estadoPlan: "aprobado", fechaEvaluacion: null, criterios: ["no_recurrencia"], criterioOtro: null, indicadorEficaciaId: null,
      causas: [],
      acciones: [
        {
          id: 3, orden: 1, tipo: "correctiva", descripcion: "Actualizar el procedimiento", recursos: null, indicadorCumplimiento: null, meta: null,
          causaIds: [], avance: 45,
          actividades: [
            { id: 21, orden: 1, descripcion: "Pedir el cambio documental", responsableId: 7, responsable: "L. Rojas", responsableActivo: false,
              inicio: "2026-11-14", finOriginal: "2026-11-20", fin: "2026-11-20", vence: "2026-11-20", avance: 60, estado: "en_proceso", reprogramaciones: 0, seAbre: true },
            { id: 22, orden: 2, descripcion: "Comprar e instalar el equipo", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
              inicio: "2026-11-01", finOriginal: "2026-11-30", fin: "2026-11-30", vence: "2026-11-30", avance: 30, estado: "en_proceso", reprogramaciones: 0, seAbre: false },
          ],
        },
      ],
      ajustes: [],
    } as unknown as Parameters<typeof PlanEnLectura>[0]["ronda"];
    const html = renderToStaticMarkup(
      <PlanEnLectura ronda={ronda} abierta hoy="2026-11-18" indicador={null} deActividad={(x) => (x.id === 21 ? <span>Reasignar A1.1</span> : null)} />,
    );
    expect(html).toContain('href="/mejoramiento/actividades/21"');
    expect(html).not.toContain('href="/mejoramiento/actividades/22"');
    expect(html).toContain("Avance de la acción: 45 %");
    expect(html).toContain("Responsable inactivo");
    expect(html.split("Responsable inactivo").length - 1).toBe(1);
    expect(html).toContain("Reasignar A1.1");
  });
});

describe("los ajustes al plan y la escalada a Gerencia (maquetas 2 y 6)", () => {
  const accion = vi.fn(async () => null);
  const aviso = (html: string) => html.split(AVISO_SIN_PACIENTES).length - 1;
  const pedido = new Date("2026-11-18T15:00:00Z");

  it("«Pedir ajuste de fecha»: la fecha original se conserva, la nueva desde hoy, la causa con el aviso y la nota de que sigue vencida", () => {
    const html = renderToStaticMarkup(
      <DialogoPedirAjuste hallazgoId={14} actividadId={22} etiqueta="A2.1" fin="2026-11-14" finOriginal="2026-11-14" hoy="2026-11-18" accion={accion} />,
    );
    expect(html).toContain("Pedir ajuste de fecha");
    expect(html).toContain('name="hallazgoId" value="14"');
    expect(html).toContain('name="tipo" value="reprogramar"');
    expect(html).toContain('name="actividadId" value="22"');
    expect(html).toMatch(/min="2026-11-18"[^>]*name="finNuevo"/);
    expect(html).toContain(`${fechaDeDia("2026-11-14")} (se conserva siempre)`);
    expect(html).toContain('name="causa"');
    expect(html).toContain('minLength="10"');
    expect(html).toContain("Mientras se decide, la actividad sigue contando como vencida.");
    expect(html).not.toContain("Corregir antes del");
    // Una devuelta: la fecha que rige es la de corregir, y es la que se mueve (revisión final, I1).
    const devuelta = renderToStaticMarkup(
      <DialogoPedirAjuste hallazgoId={14} actividadId={22} etiqueta="A2.1" fin="2026-12-15" finOriginal="2026-12-15" corregirAntesDe="2026-11-20" hoy="2026-11-18" accion={accion} />,
    );
    expect(sinEtiquetas(devuelta)).toContain(`Corregir antes del${fechaDeDia("2026-11-20")} (la fecha que se mueve)`);
    expect(aviso(html)).toBe(1);
  });

  it("«Pedir un ajuste» del plan: añadir (en una acción del plan o en una nueva, con sus causas) o cancelar una actividad sin terminar", () => {
    const html = renderToStaticMarkup(
      <DialogoAjusteDelPlan
        hallazgoId={14}
        actividades={[{ id: 22, etiqueta: "A2.1", descripcion: "Comprar e instalar el equipo" }]}
        acciones={[{ id: 5, etiqueta: "A2", descripcion: "Instalar un termómetro con registro automático" }]}
        causas={[{ id: 3, orden: 1, texto: "El procedimiento no asigna el registro al turno de noche" }]}
        tipoPropuesto="correctiva"
        usuarios={[{ id: 8, nombre: "J. Perdomo" }, { id: 9, nombre: "M. Cuéllar" }]}
        hoy="2026-11-18"
        accion={accion}
      />,
    );
    expect(html).toContain("Pedir un ajuste");
    expect(html).toContain('name="hallazgoId" value="14"');
    expect(html).toContain("Añadir una actividad");
    expect(html).toContain("Cancelar una actividad");
    expect(html).toContain('value="agregar"');
    expect(html).toContain('value="cancelar"');
    // Añadir: en una acción del plan o en una nueva (con su tipo, su descripción y las causas que ataca).
    expect(html).toContain('name="accionId"');
    expect(html).toContain("A2 · Instalar un termómetro");
    expect(html).toContain('value="nueva"');
    expect(html).toContain('name="accionTipo"');
    expect(html).toContain('name="accionDescripcion"');
    expect(html).toContain('name="causaIds"');
    expect(html).toContain("El procedimiento no asigna el registro");
    expect(html).toContain('name="descripcion"');
    expect(html).toContain('name="responsableId"');
    expect(html).toContain("M. Cuéllar");
    expect(html).toMatch(/min="2026-11-18"[^>]*name="fin"/);
    // Cancelar: una de las actividades sin terminar, por su etiqueta.
    expect(html).toContain('name="actividadId"');
    expect(html).toContain("A2.1 · Comprar e instalar el equipo");
    expect(html).toContain('name="causa"');
    expect(html).toContain("Lo decide quien aprobó el plan.");
    // Un solo aviso de pacientes para los textos libres del formulario.
    expect(aviso(html)).toBe(1);
    // Sin actividades sin terminar no se ofrece cancelar.
    const sinCancelar = renderToStaticMarkup(
      <DialogoAjusteDelPlan hallazgoId={14} actividades={[]} acciones={[]} causas={[]} tipoPropuesto="mejora" usuarios={[]} hoy="2026-11-18" accion={accion} />,
    );
    expect(sinCancelar).not.toContain('value="cancelar"');
  });

  const paso = (extra?: Partial<Parameters<typeof PasoDecidirAjuste>[0]>) =>
    renderToStaticMarkup(
      <PasoDecidirAjuste
        ajusteId={9}
        cual="la actividad A2.1"
        frase="Reprogramar la actividad A2.1 del 14 nov 2026 al 28 nov 2026."
        causa="El proveedor no tiene existencias hasta el 24."
        pedidoPor="J. Perdomo"
        pedidoEn="18 nov 2026"
        vence="23 nov 2026"
        hoy="2026-11-18"
        accion={accion}
        {...extra}
      />,
    );

  it("«Lo que sigue» de quien decide: qué se pidió, la causa, aprobar con nota opcional y negar con nota, los dos con el acta", () => {
    const html = paso();
    // Con varios por decidir, cada bloque dice de qué actividad es.
    expect(html).toContain("Decidir el ajuste de la actividad A2.1");
    expect(html).toContain("Reprogramar la actividad A2.1 del 14 nov 2026 al 28 nov 2026.");
    expect(html).toContain("El proveedor no tiene existencias hasta el 24.");
    expect(html).toContain("Lo pidió J. Perdomo el 18 nov 2026 · vence el 23 nov 2026");
    expect(html).toContain("Aprobar el ajuste");
    expect(html).toContain("Negar el ajuste");
    expect(html).toContain('name="aprueba" value="si"');
    expect(html).toContain('name="aprueba" value="no"');
    expect(html.split('name="ajusteId" value="9"').length - 1).toBe(2);
    expect(html.split('name="actaNumero"').length - 1).toBe(2);
    expect(aviso(html)).toBe(2);
    expect(html).not.toContain("Sí, aprobarlo");
  });

  it("quien decide un «agregar» ve lo que aprueba: la acción nueva (tipo, descripción y causas) y la actividad", () => {
    const html = paso({
      cual: "una actividad nueva",
      frase: "Añadir una actividad en una acción nueva del plan, con fin el 1 dic 2026.",
      detalle: ["Acción nueva: Correctiva · «Instalar un termómetro» · ataca la causa 1", "Actividad: «Comprar el equipo» · responsable: M. Cuéllar · del 18 nov 2026 al 1 dic 2026"],
    });
    expect(html).toContain("Decidir el ajuste de una actividad nueva");
    expect(html).toContain("Acción nueva: Correctiva · «Instalar un termómetro» · ataca la causa 1");
    expect(html).toContain("Actividad: «Comprar el equipo» · responsable: M. Cuéllar");
  });

  it("con la fecha nueva ya pasada lo advierte y solo ofrece negarlo", () => {
    const html = paso({ fechaPasada: true });
    expect(html).toContain("La fecha nueva ya pasó: niegue el ajuste para que se pida otro");
    expect(html).not.toContain("Aprobar el ajuste");
    expect(html).toContain("Negar el ajuste");
  });

  it("aprobar una cancelación se confirma en un diálogo, y el botón que la envía no existe hasta abrirlo", () => {
    const html = paso({
      cual: "la actividad A1.1",
      frase: "Cancelar la actividad A1.1.",
      confirmar: "Al aprobarlo, la actividad A1.1 queda «Cancelada» y no se puede deshacer.",
    });
    expect(html).toMatch(/<button type="button"[^>]*aria-haspopup="dialog"[^>]*>Aprobar el ajuste<\/button>/);
    expect(html).toContain("<dialog");
    expect(html).not.toContain("Sí, aprobarlo");
  });

  it("el envío del formulario de aprobar: sin confirmar (Enter en un campo) no llega a la acción y abre el diálogo", () => {
    const enviar = vi.fn();
    const abrir = vi.fn();
    const marca = { current: false };
    const confirmado = () => marca.current;
    const gastar = () => {
      marca.current = false;
    };
    const evento = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>;
    const alEnviar = envioConConfirmacion({ pide: true, confirmado, gastar, abrir, enviar });
    const sinConfirmar = evento();
    alEnviar(sinConfirmar);
    expect(sinConfirmar.preventDefault).toHaveBeenCalled();
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(enviar).not.toHaveBeenCalled();
    // «Sí, aprobarlo» marca la confirmación: ese envío sí llega, y la marca se gasta.
    marca.current = true;
    const confirmadoAhora = evento();
    alEnviar(confirmadoAhora);
    expect(enviar).toHaveBeenCalledWith(confirmadoAhora);
    expect(marca.current).toBe(false);
    alEnviar(evento());
    expect(enviar).toHaveBeenCalledTimes(1);
    // Lo que no pide confirmación se envía directo.
    const directo = evento();
    envioConConfirmacion({ pide: false, confirmado: () => false, gastar: () => {}, abrir, enviar })(directo);
    expect(enviar).toHaveBeenCalledWith(directo);
  });

  it("«Ajustes del plan»: qué se pidió, por qué, quién lo pidió y quién lo decidió, con su nota y su acta", () => {
    const ajustes: AjusteDeDetalle[] = [
      {
        id: 1, tipo: "reprogramar", estado: "pendiente", actividadId: 22, causa: "El proveedor no tiene existencias",
        cambio: { tipo: "reprogramar", finAntes: "2026-11-14", finNuevo: "2026-11-28" }, responsableNuevo: null,
        pedidoPor: "J. Perdomo", pedidoEn: pedido, venceEn: new Date("2026-11-24T04:59:59.999Z"), decididoPor: null, decididoEn: null,
        nota: null, acta: null, puedeDecidir: false,
      },
      {
        id: 2, tipo: "agregar", estado: "aprobado", actividadId: 30, causa: "Hace falta capacitar al turno de noche",
        cambio: { tipo: "agregar", accionId: 5, accion: null, descripcion: "Capacitar al turno de noche", responsableId: 9, inicio: "2026-11-18", fin: "2026-12-01" },
        responsableNuevo: "M. Cuéllar", pedidoPor: "L. Rojas", pedidoEn: pedido, venceEn: null, decididoPor: "El Gerente", decididoEn: pedido,
        nota: "De acuerdo con el Comité", acta: { numero: "07-2026", fecha: "2026-11-18" }, puedeDecidir: false,
      },
      {
        id: 3, tipo: "cancelar", estado: "negado", actividadId: 21, causa: "Ya no hace falta pedir el cambio",
        cambio: { tipo: "cancelar", estadoAntes: "en_proceso" }, responsableNuevo: null, pedidoPor: "L. Rojas", pedidoEn: pedido, venceEn: null,
        decididoPor: "El Gerente", decididoEn: pedido, nota: "Hace falta para la eficacia", acta: null, puedeDecidir: false,
      },
    ];
    const html = renderToStaticMarkup(
      <AjustesDelPlan ajustes={ajustes} etiquetas={{ 22: "A2.1", 21: "A1.1", 30: "A2.2" }} acciones={{ 5: "A2" }} zona="America/Bogota" />,
    );
    expect(html).toContain("Ajustes del plan");
    expect(html).toContain(`Reprogramar la actividad A2.1 del ${fechaDeDia("2026-11-14")} al ${fechaDeDia("2026-11-28")}.`);
    expect(html).toContain("Por decidir");
    expect(html).toContain("Aprobado");
    expect(html).toContain("Negado");
    expect(html).toContain("Causa: El proveedor no tiene existencias");
    expect(html).toContain(`Lo pidió J. Perdomo el ${fechaDeDia("2026-11-18")}`);
    expect(html).toContain("Añadir una actividad a la acción A2");
    expect(html).toContain("Capacitar al turno de noche");
    expect(html).toContain("M. Cuéllar");
    expect(html).toContain(`Lo aprobó El Gerente el ${fechaDeDia("2026-11-18")}`);
    expect(html).toContain("Nota: De acuerdo con el Comité");
    expect(html).toContain(`Acta del Comité: 07-2026, del ${fechaDeDia("2026-11-18")}`);
    expect(html).toContain("Cancelar la actividad A1.1.");
    expect(html).toContain(`Lo negó El Gerente el ${fechaDeDia("2026-11-18")}`);
    expect(renderToStaticMarkup(<AjustesDelPlan ajustes={[]} etiquetas={{}} acciones={{}} zona="America/Bogota" />)).toContain(
      "Aún no se ha pedido ningún ajuste.",
    );
    // Uno que añade en una acción nueva dice la acción: su tipo, su descripción y las causas que ataca, por su número.
    const enUnaNueva = renderToStaticMarkup(
      <AjustesDelPlan
        ajustes={[
          {
            ...ajustes[1],
            id: 4,
            estado: "pendiente",
            actividadId: null,
            cambio: {
              tipo: "agregar", accionId: null, accion: { tipo: "correctiva", descripcion: "Instalar un termómetro con registro automático", causaIds: [3, 4] },
              descripcion: "Comprar e instalar el equipo", responsableId: 9, inicio: "2026-11-18", fin: "2026-12-01",
            },
            decididoPor: null, decididoEn: null, nota: null, acta: null,
          },
        ]}
        etiquetas={{}}
        acciones={{}}
        causas={{ 3: 1, 4: 2 }}
        zona="America/Bogota"
      />,
    );
    expect(enUnaNueva).toContain("Acción nueva: Correctiva · «Instalar un termómetro con registro automático» · ataca las causas 1 y 2");
    expect(enUnaNueva).toContain(`Actividad: «Comprar e instalar el equipo» · responsable: M. Cuéllar · del ${fechaDeDia("2026-11-18")} al ${fechaDeDia("2026-12-01")}`);
  });

  it("escalar a Gerencia y responder la escalada: una nota con el aviso de pacientes, y el acta en la respuesta", () => {
    const escalar = renderToStaticMarkup(<DialogoEscalar actividadId={22} etiqueta="A2.1" accion={accion} />);
    expect(escalar).toContain("Escalar a Gerencia");
    expect(escalar).toContain('name="actividadId" value="22"');
    expect(escalar).toContain('name="nota"');
    expect(escalar).toContain('minLength="10"');
    expect(aviso(escalar)).toBe(1);
    const responder = renderToStaticMarkup(<DialogoResponderEscalada actividadId={22} etiqueta="A2.1" hoy="2026-11-18" accion={accion} />);
    expect(responder).toContain("Responder la escalada");
    expect(responder).toContain('name="nota"');
    expect(responder).toContain('name="actaNumero"');
    expect(aviso(responder)).toBe(1);
  });

  it("la página de la actividad: «Pedir ajuste de fecha» a quien puede, el ajuste por decidir y la marca de la escalada", () => {
    const base: DetalleDeActividad = {
      id: 22, etiqueta: "A2.1", descripcion: "Comprar e instalar el equipo", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
      inicio: "2026-11-01", finOriginal: "2026-11-14", fin: "2026-11-14", vence: "2026-11-14", avance: 30, estado: "en_proceso", reprogramaciones: 0,
      terminadaEn: null, terminadaPor: null, verificacion: null, verificacionNota: null, corregirAntesDe: null, vencida: true,
      accion: { id: 5, etiqueta: "A2", tipo: "correctiva", descripcion: "Instalar un termómetro" },
      hallazgo: { id: 14, codigo: "HZ-2026-014", titulo: "Dos turnos sin registro", proceso: "Farmacia", estado: "en_ejecucion", etiqueta: "En ejecución", ronda: 1, ve: "actividad" },
      seguimientos: [], archivos: [], esResponsable: true, puedeSeguir: true, puedeReasignar: false, avanceMinimo: 0,
      ajustePendiente: null, puedePedirAjuste: true, gerenciaEn: null, ajustes: [],
    };
    const pagina = (a: DetalleDeActividad) =>
      renderToStaticMarkup(
        <PaginaDeActividad
          actividad={a}
          hoy="2026-11-18"
          usuarios={[]}
          subida={null}
          quitables={[]}
          acciones={{ seguimiento: accion, terminar: accion, reasignar: accion, pedirAjuste: accion }}
        />,
      );
    expect(pagina(base)).toContain("Pedir ajuste de fecha");
    expect(pagina({ ...base, puedePedirAjuste: false })).not.toContain("Pedir ajuste de fecha");
    const pendiente = pagina({ ...base, puedePedirAjuste: false, ajustePendiente: { id: 4, tipo: "reprogramar", pedidoEn: pedido, finNuevo: "2026-11-28" } });
    expect(pendiente).toContain(`Hay un ajuste de fecha por decidir: al ${fechaDeDia("2026-11-28")}, pedido el ${fechaDeDia("2026-11-18")}.`);
    expect(pendiente).toContain("Mientras se decide, la actividad sigue contando como vencida.");
    const escalada = pagina({ ...base, gerenciaEn: pedido });
    expect(escalada).toContain(`Escalada a Gerencia el ${fechaDeDia("2026-11-18")}`);
    // Los ajustes de esta actividad, con su causa: quien la ve por ser su responsable no los lee en la página del hallazgo.
    expect(pagina(base)).not.toContain("Ajustes de la actividad");
    const conAjustes = pagina({
      ...base,
      ajustes: [
        {
          id: 4, tipo: "reprogramar", estado: "negado", actividadId: 22, causa: "El proveedor no tiene existencias",
          cambio: { tipo: "reprogramar", finAntes: "2026-11-14", finNuevo: "2026-11-28" }, responsableNuevo: null, pedidoPor: "J. Perdomo",
          pedidoEn: pedido, venceEn: null, decididoPor: "El Gerente", decididoEn: pedido, nota: "Hace falta en esta fecha", acta: null, puedeDecidir: false,
        },
      ],
    });
    expect(conAjustes).toContain("Ajustes de la actividad");
    expect(conAjustes).toContain(`Reprogramar la actividad A2.1 del ${fechaDeDia("2026-11-14")} al ${fechaDeDia("2026-11-28")}.`);
    expect(conAjustes).toContain("Causa: El proveedor no tiene existencias");
    expect(conAjustes).toContain("Nota: Hace falta en esta fecha");
  });

  it("«4. Plan de acción» dice la escalada y el ajuste por decidir de cada actividad", () => {
    const ronda = {
      id: 1, numero: 1, estadoPlan: "aprobado", fechaEvaluacion: null, criterios: ["no_recurrencia"], criterioOtro: null, indicadorEficaciaId: null,
      causas: [],
      acciones: [
        {
          id: 3, orden: 2, tipo: "correctiva", descripcion: "Instalar un termómetro", recursos: null, indicadorCumplimiento: null, meta: null,
          causaIds: [], avance: 30,
          actividades: [
            { id: 22, orden: 1, descripcion: "Comprar e instalar el equipo", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
              inicio: "2026-11-01", finOriginal: "2026-11-14", fin: "2026-11-14", vence: "2026-11-14", avance: 30, estado: "en_proceso", reprogramaciones: 0, seAbre: true,
              gerenciaEn: pedido },
            { id: 23, orden: 2, descripcion: "Capacitar al turno de noche", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
              inicio: "2026-11-01", finOriginal: "2026-12-01", fin: "2026-12-01", vence: "2026-12-01", avance: 0, estado: "abierta", reprogramaciones: 0, seAbre: true,
              gerenciaEn: null },
          ],
        },
      ],
      ajustes: [
        { id: 9, tipo: "reprogramar", estado: "pendiente", actividadId: 22, causa: "Sin existencias", cambio: { tipo: "reprogramar", finAntes: "2026-11-14", finNuevo: "2026-11-28" } },
        { id: 10, tipo: "cancelar", estado: "pendiente", actividadId: 23, causa: "Ya no hace falta", cambio: { tipo: "cancelar", estadoAntes: "abierta" } },
      ],
    } as unknown as Parameters<typeof PlanEnLectura>[0]["ronda"];
    const html = renderToStaticMarkup(<PlanEnLectura ronda={ronda} abierta hoy="2026-11-18" indicador={null} />);
    expect(html).not.toContain(REPROGRAMADA);
    // Con una reprogramación aprobada, la marca va en la página del hallazgo como en el impreso (recorrido de cierre, D4).
    const conReprogramada = structuredClone(ronda);
    Object.assign(conReprogramada.acciones[0].actividades[1], { fin: "2026-12-08", vence: "2026-12-08", reprogramaciones: 1 });
    const marcada = sinEtiquetas(renderToStaticMarkup(<PlanEnLectura ronda={conReprogramada} abierta hoy="2026-11-18" indicador={null} />));
    expect(marcada).toContain(`${fechaDeDia("2026-12-08")}original: ${fechaDeDia("2026-12-01")}${REPROGRAMADA}`);
    expect(html).toContain(`Escalada a Gerencia el ${fechaDeDia("2026-11-18")}`);
    expect(html).toContain(`Pidió ajuste al ${fechaDeDia("2026-11-28")} · por decidir`);
    expect(html).toContain("Pidió cancelarla · por decidir");
  });

  it("el historial dice qué se pidió, qué se aprobó o negó y la escalada con su nota y su acta, sin la causa", () => {
    const evento = (id: number, tipo: string, detalle: Record<string, unknown>) => ({ id, tipo, ronda: 1, quien: "Ana", cuando: pedido, detalle });
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        etiquetasDeActividad={{ 22: "A2.1", 21: "A1.1" }}
        eventos={[
          evento(1, "ajuste_pedido", { ajusteId: 9, tipo: "reprogramar", actividadId: 22, actividad: "A2.1", finAntes: "2026-11-14", finNuevo: "2026-11-28" }),
          evento(2, "ajustar", {
            ajusteId: 9, tipo: "reprogramar", actividadId: 22, actividad: "A2.1", finAntes: "2026-11-14", finNuevo: "2026-11-28",
            estado: { antes: "en_ejecucion", despues: "en_ejecucion" },
          }),
          evento(3, "ajuste_negado", { ajusteId: 10, tipo: "cancelar", actividadId: 21, actividad: "A1.1" }),
          evento(4, "ajuste_pedido", { ajusteId: 11, tipo: "agregar", accion: "A1", finNuevo: "2026-12-01" }),
          evento(5, "escalada", { actividadId: 22, actividad: "A2.1", nota: "Lleva un mes vencida" }),
          evento(6, "escalada_respondida", { actividadId: 22, actividad: "A2.1", nota: "Se autoriza otro proveedor", acta: { numero: "12-2026", fecha: "2026-11-18" } }),
        ]}
      />,
    );
    expect(html).toContain(`Pidió reprogramar la actividad A2.1 al ${fechaDeDia("2026-11-28")}`);
    expect(html).toContain(`Aprobó reprogramar la actividad A2.1 al ${fechaDeDia("2026-11-28")}`);
    expect(html).toContain("Negó cancelar la actividad A1.1");
    expect(html).toContain("Pidió añadir una actividad a la acción A1");
    expect(html).toContain("Escaló a Gerencia la actividad A2.1");
    expect(html).toContain("Nota: Lleva un mes vencida");
    expect(html).toContain("Respondió la escalada de la actividad A2.1");
    expect(html).toContain("Nota: Se autoriza otro proveedor");
    expect(html).toContain(`Acta del Comité: 12-2026, del ${fechaDeDia("2026-11-18")}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verificar, evaluar y cerrar; las rondas anteriores, las fechas y los enlaces (Tarea 17, maquetas 2 y 7)
// ─────────────────────────────────────────────────────────────────────────────

describe("verificar la implementación, evaluar la eficacia y cerrar (maqueta 7)", () => {
  const accion = vi.fn(async () => null);
  const aviso = (html: string) => html.split(AVISO_SIN_PACIENTES).length - 1;
  const actividades = [
    { id: 31, etiqueta: "A1.1", descripcion: "Pedir el cambio documental", terminadaEn: "2026-11-19", archivos: null },
    { id: 32, etiqueta: "A1.2", descripcion: "Socializar la versión nueva", terminadaEn: "2026-12-04", archivos: null },
  ];

  it("PasoVerificar: una fila por actividad con «Conforme» y «Devolver»; al devolver, la nota y la fecha; los cuatro métodos", () => {
    const sinDecidir = renderToStaticMarkup(<PasoVerificar hallazgoId={14} actividades={actividades} hoy="2026-12-07" accion={accion} />);
    for (const id of [31, 32]) {
      expect(sinDecidir).toMatch(new RegExp(`<input[^>]*type="radio"[^>]*name="decision_${id}"[^>]*value="conforme"`));
      expect(sinDecidir).toMatch(new RegExp(`<input[^>]*type="radio"[^>]*name="decision_${id}"[^>]*value="devuelta"`));
      expect(sinDecidir).toMatch(new RegExp(`<input[^>]*type="hidden"[^>]*name="actividad"[^>]*value="${id}"`));
    }
    expect(sinDecidir).toContain("Conforme");
    expect(sinDecidir).toContain("Devolver");
    expect(sinDecidir).toContain("A1.1");
    expect(sinDecidir).toContain("Pedir el cambio documental");
    expect(sinDecidir).not.toContain('name="nota_31"');
    expect(sinDecidir).not.toContain('name="corregir_32"');
    const metodos = [...sinDecidir.matchAll(/<input[^>]*type="checkbox"[^>]*name="metodos"[^>]*value="([a-z]+)"/g)].map((m) => m[1]);
    expect(metodos).toEqual(["evidencias", "observacion", "auditoria", "entrevista"]);
    for (const m of ["Revisión de evidencias", "Observación en sitio", "Auditoría de seguimiento", "Entrevista"]) expect(sinDecidir).toContain(m);
    // La nota general de la verificación lleva el aviso de pacientes.
    expect(aviso(sinDecidir)).toBe(1);

    const devuelta = renderToStaticMarkup(
      <PasoVerificar hallazgoId={14} actividades={actividades} hoy="2026-12-07" accion={accion} inicial={{ 32: "devuelta" }} />,
    );
    expect(devuelta).toMatch(/<textarea(?=[^>]*name="nota_32")(?=[^>]*minLength="10")/);
    expect(devuelta).toMatch(/<input(?=[^>]*type="date")(?=[^>]*name="corregir_32")(?=[^>]*min="2026-12-07")/);
    expect(devuelta).not.toContain('name="nota_31"');
    // Cada nota de una devuelta lleva su aviso, además del de la nota general.
    expect(aviso(devuelta)).toBe(2);
  });

  it("PasoVerificar: los archivos de la verificación van fuera de su formulario (cada «Quitar» es un formulario propio)", () => {
    const html = renderToStaticMarkup(
      <PasoVerificar hallazgoId={14} actividades={actividades} hoy="2026-12-07" accion={accion}>
        <form id="hijo-archivos" />
      </PasoVerificar>,
    );
    const formulario = html.slice(html.indexOf("<form"), html.indexOf("</form>") + "</form>".length);
    expect(formulario).not.toContain("hijo-archivos");
    expect(html).toContain('id="hijo-archivos"');
    // «Guardar la verificación» envía el formulario de la verificación aunque quede fuera de él.
    const id = formulario.match(/^<form[^>]*id="([^"]+)"/)![1];
    expect(html).toMatch(new RegExp(`<button(?=[^>]*type="submit")(?=[^>]*form="${id}")[^>]*>Guardar la verificación</button>`));
  });

  const datos = (extra?: Partial<DatosDeEvaluacion>): DatosDeEvaluacion => ({
    minima: "2027-03-01",
    r: "2026-12-05",
    yaSePuede: false,
    criterios: ["mejora_indicador"],
    indicador: {
      codigo: "FAR-ID-002",
      nombre: "Registros de temperatura completos",
      filas: [
        { periodo: "2026-10", etiqueta: "Octubre 2026", resultado: "93 %", semaforo: "atencion", noAplica: false, momento: "antes" },
        { periodo: "2026-12", etiqueta: "Diciembre 2026", resultado: "97 %", semaforo: "atencion", noAplica: false, momento: "durante" },
        { periodo: "2027-01", etiqueta: "Enero 2027", resultado: "100 %", semaforo: "bien", noAplica: false, momento: "despues" },
        { periodo: "2027-02", etiqueta: "Febrero 2027", resultado: null, semaforo: null, noAplica: false, momento: "despues" },
      ],
    },
    indicadorRetirado: false,
    ocurrencias: [{ fecha: "2026-12-20", descripcion: "Un turno de diciembre quedó sin el registro" }],
    ...extra,
  });
  const evaluar = (x?: { datos?: DatosDeEvaluacion; cierra?: boolean; derivar?: string | null }) =>
    renderToStaticMarkup(
      <PasoEvaluar
        hallazgoId={14}
        ronda={1}
        datos={x?.datos ?? datos()}
        criterioOtro={null}
        vistoHuella={"a".repeat(64)}
        hoy="2026-12-28"
        cierra={x?.cierra ?? false}
        pideCambios={false}
        pideCodigo={false}
        accion={accion}
        derivar={x && "derivar" in x ? (x.derivar ?? null) : "/mejoramiento/nuevo?derivado=14"}
      />,
    );

  it("PasoEvaluar: antes de la fecha mínima «Eficaz» está deshabilitado y lo dice; «No eficaz» está disponible", () => {
    const html = evaluar();
    const eficaz = html.match(/<input[^>]*value="eficaz"[^>]*>/)![0];
    const noEficaz = html.match(/<input[^>]*value="no_eficaz"[^>]*>/)![0];
    expect(eficaz).toContain('disabled=""');
    expect(noEficaz).not.toContain('disabled=""');
    expect(html).toContain(`Se puede registrar desde el ${fechaLargaDeDia("2027-03-01")}`);
    // Ninguno de los dos viene elegido.
    expect(eficaz).not.toContain("checked");
    expect(noEficaz).not.toContain("checked");
    // Sin `opacity` para atenuar lo deshabilitado (F12-D41).
    expect(html).not.toMatch(/opacity-/);
    const ya = evaluar({ datos: datos({ yaSePuede: true }) });
    expect(ya.match(/<input[^>]*value="eficaz"[^>]*>/)![0]).not.toContain('disabled=""');
    expect(ya).not.toContain("Se puede registrar desde el");
  });

  it("PasoEvaluar: la tabla del indicador dice «antes», «durante» y «después» como texto; las ocurrencias piden confirmarlo; lleva el aviso", () => {
    const html = evaluar();
    expect(html).toContain("FAR-ID-002");
    expect(html).toContain("Registros de temperatura completos");
    expect(html).toMatch(/<td[^>]*>antes<\/td>/);
    expect(html).toMatch(/<td[^>]*>durante<\/td>/);
    expect(html).toMatch(/<td[^>]*>después<\/td>/);
    expect(html).toContain("Atención");
    expect(html).toContain("Sin dato");
    expect(html).toContain("Un turno de diciembre quedó sin el registro");
    expect(html).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*id="confirma-ocurrencias-14")/);
    expect(html).toContain("1 ocurrencia posterior");
    expect(aviso(html)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('href="/mejoramiento/nuevo?derivado=14"');
    expect(html).toContain("Registrar un hallazgo distinto");
    // Sin ocurrencias posteriores, no hay nada que confirmar.
    expect(evaluar({ datos: datos({ ocurrencias: [] }) })).not.toContain('id="confirma-ocurrencias-14"');
    // Quien no ve el indicador lee «un indicador», sin código ni cifras.
    const oculto = evaluar({ datos: datos({ indicador: { codigo: "", nombre: "un indicador", filas: [] } }) });
    expect(oculto).toContain("un indicador");
    expect(oculto).not.toContain("FAR-ID-002");
    expect(oculto).not.toContain("<td");
    // Sin `mejora.registrar`, no se ofrece registrar otro hallazgo.
    expect(evaluar({ derivar: null })).not.toContain("Registrar un hallazgo distinto");
  });

  it("PasoEvaluar: para un Admin SGC pide además las lecciones aprendidas; para Control Interno, no", () => {
    const admin = evaluar({ cierra: true });
    expect(admin).toContain("Lecciones aprendidas");
    expect(admin).toMatch(/<textarea[^>]*id="lecciones-14"/);
    const control = evaluar({ cierra: false });
    expect(control).not.toContain("Lecciones aprendidas");
    expect(control).not.toMatch(/id="lecciones-14"/);
  });

  it("PasoCerrar: las lecciones con el aviso; si el análisis pidió cambios, cómo se atendieron; firma «Cerró»", () => {
    const sin = renderToStaticMarkup(<PasoCerrar hallazgoId={14} cambios={null} pideCodigo={false} accion={accion} />);
    expect(sin).toContain("Lecciones aprendidas");
    expect(sin).not.toContain("Cómo se atendieron");
    expect(aviso(sin)).toBe(1);
    expect(sin).toContain("Cerrar el hallazgo");
    const con = renderToStaticMarkup(<PasoCerrar hallazgoId={14} cambios="documentos, matriz de riesgos" pideCodigo={false} accion={accion} />);
    expect(con).toContain("Cómo se atendieron los cambios");
    expect(con).toContain("documentos, matriz de riesgos");
    expect(aviso(con)).toBe(2);
  });

  const rondaNoEficaz = {
    id: 5,
    numero: 1,
    estadoPlan: "aprobado",
    fechaEvaluacion: null,
    criterios: ["no_recurrencia"],
    criterioOtro: null,
    indicadorEficaciaId: null,
    similares: false,
    similaresDetalle: null,
    cambios: { documentos: false, riesgos: false, controles: false, descripcion: null },
    analisis: [],
    causas: [{ id: 11, orden: 1, texto: "El procedimiento no asigna el registro al turno de noche", sinAccionPorque: null }],
    acciones: [
      {
        id: 3, orden: 1, tipo: "correctiva", descripcion: "Actualizar el procedimiento de cadena de frío", recursos: null,
        indicadorCumplimiento: null, meta: null, causaIds: [11], avance: 100,
        actividades: [
          { id: 21, orden: 1, descripcion: "Pedir el cambio documental", responsableId: 7, responsable: "L. Rojas", responsableActivo: true,
            inicio: "2026-11-14", finOriginal: "2026-11-20", fin: "2026-11-20", vence: "2026-11-20", avance: 100, estado: "terminada", reprogramaciones: 0,
            terminadaEn: new Date("2026-11-19T15:00:00Z"), verificacion: "conforme", verificacionNota: null, corregirAntesDe: null, seAbre: true,
            gerenciaEn: null, evidencias: 1 },
        ],
      },
    ],
    ajustes: [],
    resultado: "no_eficaz",
    verificacion: { por: "Control Interno", en: new Date("2026-12-07T15:00:00Z"), metodos: ["evidencias", "observacion"], nota: null },
    evaluacion: {
      resultado: "no_eficaz",
      por: "Control Interno",
      en: new Date("2026-12-10T15:00:00Z"),
      criterios: ["no_recurrencia"],
      desde: "2026-12-05",
      hasta: "2026-12-10",
      justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre",
      visto: { minima: "2027-02-05", r: "2026-12-05", indicador: null, ocurrencias: [{ fecha: "2026-12-09", descripcion: "Otro turno sin registro" }] },
    },
  } as unknown as RondaDeDetalle;

  it("RondaAnterior: «Ronda 1 · no eficaz», plegada, con su causa, su plan y su evaluación en lectura", () => {
    const html = renderToStaticMarkup(<RondaAnterior ronda={rondaNoEficaz} indicador={null} hoy="2026-12-28" zona="America/Bogota" />);
    expect(html).toContain("Ronda 1 · no eficaz");
    const primera = html.match(/<details[^>]*>/)![0];
    expect(primera).not.toContain("open");
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain("3. Causa raíz");
    expect(html).toContain("El procedimiento no asigna el registro al turno de noche");
    expect(html).toContain("4. Plan de acción");
    expect(html).toContain("Actualizar el procedimiento de cadena de frío");
    expect(html).toContain("6. Verificación de eficacia");
    expect(html).toContain("No eficaz");
    expect(html).toContain("El hecho se repitió en el turno de noche del 9 de diciembre");
    expect(html).toContain("Otro turno sin registro");
    // Sin controles: lo de una ronda anterior es solo lectura.
    expect(html).not.toMatch(/<(button|form|input|textarea|select)[\s>]/);
  });

  it("la verificación y la eficacia en lectura: métodos, la devuelta con su nota, «antes/durante/después» como texto y «un indicador»", () => {
    const ronda = {
      ...rondaNoEficaz,
      acciones: [
        {
          ...rondaNoEficaz.acciones[0],
          actividades: [
            { ...rondaNoEficaz.acciones[0].actividades[0], verificacion: "devuelta", verificacionNota: "Faltan 2 auxiliares de noche", corregirAntesDe: "2026-12-12", estado: "en_proceso" },
          ],
        },
      ],
      verificacion: null,
    } as unknown as RondaDeDetalle;
    const verif = renderToStaticMarkup(<SeccionVerificacion ronda={ronda} abierta zona="America/Bogota" />);
    expect(verif).toContain("5. Seguimiento y verificación");
    expect(verif).toContain("Devuelta");
    expect(verif).toContain("Faltan 2 auxiliares de noche");
    expect(verif).toContain(fechaLargaDeDia("2026-12-12"));
    const hecha = renderToStaticMarkup(<SeccionVerificacion ronda={rondaNoEficaz} abierta={false} zona="America/Bogota" />);
    expect(hecha).toContain("Revisión de evidencias, observación en sitio");
    expect(hecha).toContain("Control Interno");

    const visto = (indicador: unknown) =>
      renderToStaticMarkup(
        <SeccionEficacia
          evaluacion={{ ...(rondaNoEficaz.evaluacion as NonNullable<RondaDeDetalle["evaluacion"]>), visto: { minima: "2027-03-01", r: "2026-12-05", indicador, ocurrencias: [] } as never }}
          evaluableDesde={null}
          abierta
          zona="America/Bogota"
        />,
      );
    const conIndicador = visto({
      visible: true,
      codigo: "FAR-ID-002",
      nombre: "Registros de temperatura completos",
      filas: [{ periodo: "2026-11", etiqueta: "Noviembre 2026", resultado: "90 %", semaforo: "atencion", noAplica: false, momento: "antes" }],
    });
    expect(conIndicador).toMatch(/<td[^>]*>antes<\/td>/);
    expect(conIndicador).toContain("FAR-ID-002");
    const oculto = visto({ visible: false });
    expect(oculto).toContain("un indicador");
    expect(oculto).not.toContain("FAR-ID-002");
    expect(oculto).not.toContain("<td");
    // En espera, sin evaluar: dice desde cuándo.
    const espera = renderToStaticMarkup(<SeccionEficacia evaluacion={null} evaluableDesde="2027-03-01" abierta zona="America/Bogota" />);
    expect(espera).toContain(fechaLargaDeDia("2027-03-01"));
  });

  it("«7. Cierre»: el resultado, quién cerró, las lecciones y cómo se atendieron los cambios", () => {
    const html = renderToStaticMarkup(
      <SeccionCierre
        estado="cerrado"
        etiqueta="Cerrado · eficaz"
        cierre={{
          resultado: "eficaz",
          cerradoEn: new Date("2027-03-02T15:00:00Z"),
          cerradoPor: "Ana Admin",
          lecciones: "Asignar el registro a cada turno evita perderlo",
          cambiosAtendidos: null,
          anuladoMotivo: null,
        }}
        validacion={null}
        abierta
        zona="America/Bogota"
      />,
    );
    expect(html).toContain("7. Cierre");
    expect(html).toContain("Cerrado · eficaz");
    expect(html).toContain("Ana Admin");
    expect(html).toContain("Asignar el registro a cada turno evita perderlo");
  });

  it("EnlacesDelHallazgo: un indicador que la persona no ve sale como «un indicador», sin código, sin nombre y sin enlace", () => {
    const html = renderToStaticMarkup(
      <EnlacesDelHallazgo
        enlaces={[
          { visible: true, clase: "hallazgo", rotulo: "Reincidencia de", codigo: "HZ-2025-031", nombre: "Planilla sin diligenciar", href: "/mejoramiento/3" },
          { visible: true, clase: "documento", rotulo: "Documento", codigo: "FAR-PR-04", nombre: "Cadena de frío", href: "/documentos/FAR-PR-04" },
          { visible: false, clase: "indicador", rotulo: "Indicador" },
          { visible: false, clase: "documento", rotulo: "Requisito incumplido" },
        ]}
      />,
    );
    expect(html).toContain("Enlaces");
    expect(html).toContain('href="/mejoramiento/3"');
    expect(html).toContain("HZ-2025-031");
    expect(html).toContain('href="/documentos/FAR-PR-04"');
    expect(html).toContain("un indicador");
    expect(html).toContain("un documento restringido");
    expect(html.match(/<a[\s>]/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<EnlacesDelHallazgo enlaces={[]} />)).toBe("");
  });

  it("FechasDelHallazgo: plan formulado a tiempo o no, cierre previsto, desde cuándo se evalúa y las reprogramaciones", () => {
    const fechas: DetalleDeHallazgo["fechas"] = {
      planFormulado: { cuando: new Date("2026-11-10T15:00:00Z"), aTiempo: true },
      cierrePrevisto: new Date("2027-03-08T15:00:00Z"),
      evaluableDesde: "2027-03-01",
      reprogramaciones: { aprobadas: 0, pedidas: 1 },
    };
    const html = renderToStaticMarkup(<FechasDelHallazgo fechas={fechas} zona="America/Bogota" />);
    expect(html).toContain("Plan formulado");
    expect(html).toContain("a tiempo");
    expect(html).toContain("Cierre previsto");
    expect(html).toContain(fechaLargaDeDia("2027-03-01"));
    expect(html).toContain("0 aprobadas · 1 pedida");
    const tarde = renderToStaticMarkup(
      <FechasDelHallazgo fechas={{ ...fechas, planFormulado: { cuando: new Date("2026-11-30T15:00:00Z"), aTiempo: false } }} zona="America/Bogota" />,
    );
    expect(tarde).toContain("fuera de plazo");
  });
});

describe("los retoques de la página del hallazgo (puntos de control)", () => {
  const accion = vi.fn(async () => null);
  const h = (estado: HallazgoBase["estado"]) => ({ estado, resultadoCierre: null, correccionRequerida: null });

  it("a. el turno nombra los roles con su mayúscula y su artículo", () => {
    expect(fraseDeLoQueSigue(h("por_decidir"), "Administrador del SGC", false)).toBe(
      "Tiene el turno: el Administrador del SGC, para decidir si lleva acción correctiva.",
    );
    expect(fraseDeLoQueSigue(h("en_aprobacion"), "Gerencia", false)).toBe("Tiene el turno: Gerencia, para aprobar el plan.");
    expect(fraseDeLoQueSigue(h("por_aceptar"), "La líder del proceso", false)).toBe(
      "Tiene el turno: la líder del proceso, para aceptar el hallazgo o rechazarlo.",
    );
    expect(fraseDeLoQueSigue(h("por_verificar"), "Quien puede verificar", false)).toBe(
      "Tiene el turno: quien puede verificar, para verificar la implementación.",
    );
  });

  it("b. el recorrido no parte una palabra: las etiquetas cortan entre palabras y la lista pasa a otra fila", () => {
    const html = renderToStaticMarkup(<Recorrido pasos={pasosDelRecorrido(base({}))} />);
    expect(html).not.toMatch(/break-words|break-all|\[overflow-wrap:anywhere\]/);
    expect(html.match(/<ol[^>]*>/)![0]).toContain("flex-wrap");
    // Ninguna columna fija que obligue a encoger una palabra por debajo de su ancho.
    expect(html).not.toMatch(/grid-cols-10/);
  });

  it("c. «2. Corrección» sin registrar no repite «Aún no se registra la corrección»", () => {
    const html = renderToStaticMarkup(
      <SeccionCorreccion
        correccion={{ requerida: null, descripcion: null, responsable: null, implementadaEn: null, registradaEn: null, validadaPor: null, validadaEn: null }}
        decision={{ accionRequerida: null, justificacion: null, decididaEn: null }}
        zona="America/Bogota"
        abierta
        archivos={0}
      />,
    );
    expect(html.split("Aún no se registra la corrección").length - 1).toBe(1);
  });

  it("d. sin nadie que revise el plan enviado, las firmas lo dicen en lugar de «Administrador del SGC»", () => {
    const html = renderToStaticMarkup(
      <PanelDeFirmas
        firmas={{ elaboro: { nombre: "Ana", cargo: null, cuando: new Date("2026-11-10T15:00:00Z") }, reviso: null, aprobo: null }}
        elabora="Quien formula"
        sinRevision={false}
        nadieRevisa
        gerencia={null}
        enCurso="reviso"
        vence={null}
        plazos={{ revisar: 3, aprobar: 3 }}
        contexto={CONTEXTO}
      />,
    );
    expect(html).toContain("Nadie puede revisarlo: lo devuelve quien lo elaboró");
    expect(html).not.toContain("Administrador del SGC · 3 días hábiles");
  });

  it("e. «4. Plan de acción» muestra «—» como avance antes de aprobarse el plan", () => {
    const ronda = {
      id: 1, numero: 1, estadoPlan: "enviado", fechaEvaluacion: null, criterios: [], criterioOtro: null, indicadorEficaciaId: null,
      causas: [],
      acciones: [
        {
          id: 3, orden: 1, tipo: "correctiva", descripcion: "Actualizar el procedimiento", recursos: null, indicadorCumplimiento: null,
          meta: null, causaIds: [], avance: null,
          actividades: [
            { id: 21, orden: 1, descripcion: "Pedir el cambio documental", responsableId: 7, responsable: "L. Rojas", responsableActivo: true,
              inicio: "2026-11-14", finOriginal: null, fin: "2026-11-20", vence: "2026-11-20", avance: 0, estado: "abierta", reprogramaciones: 0 },
          ],
        },
      ],
      ajustes: [],
    } as unknown as RondaDeDetalle;
    const html = renderToStaticMarkup(<PlanEnLectura ronda={ronda} abierta hoy="2026-11-18" indicador={null} />);
    expect(html).toContain("—");
    expect(html).not.toContain("0 %");
  });

  it("g. el selector de responsables distingue a dos homónimos con su usuario", () => {
    const etiquetas = etiquetasDeUsuarios([
      { id: 1, nombre: "Laura Rojas", cargo: "Auxiliar de farmacia", usuario: "lrojas" },
      { id: 2, nombre: "Laura Rojas", cargo: "Auxiliar de farmacia", usuario: "lrojas2" },
      { id: 3, nombre: "Laura Rojas", cargo: "Regente", usuario: "laurar" },
      { id: 4, nombre: "Juan Perdomo", cargo: null, usuario: "jperdomo" },
    ]);
    expect(etiquetas.get(1)).toBe("Laura Rojas · Auxiliar de farmacia (lrojas)");
    expect(etiquetas.get(2)).toBe("Laura Rojas · Auxiliar de farmacia (lrojas2)");
    expect(etiquetas.get(3)).toBe("Laura Rojas · Regente");
    expect(etiquetas.get(4)).toBe("Juan Perdomo");
    const html = renderToStaticMarkup(
      <FormularioPlan
        hallazgoId={1}
        tipoPropuesto="correctiva"
        acciones={[]}
        causas={[]}
        usuarios={[
          { id: 1, nombre: "Laura Rojas", cargo: "Auxiliar de farmacia", etiqueta: "Laura Rojas · Auxiliar de farmacia (lrojas)" },
          { id: 2, nombre: "Laura Rojas", cargo: "Auxiliar de farmacia", etiqueta: "Laura Rojas · Auxiliar de farmacia (lrojas2)" },
        ]}
        guardar={accion}
        quitar={accion}
      />,
    );
    expect(html).toContain("Laura Rojas · Auxiliar de farmacia (lrojas)");
    expect(html).toContain("Laura Rojas · Auxiliar de farmacia (lrojas2)");
  });
});

describe("Tarea 17, ronda 1: verificar y evaluar en ancho y lo que quedó por decir", () => {
  const accion = vi.fn(async () => null);
  const archivo = (id: number, nombre: string) => ({ id, nombre, mime: "application/pdf", tamano: 2048 });
  const actividades = [
    { id: 31, etiqueta: "A1.1", descripcion: "Pedir el cambio documental", terminadaEn: "2026-11-19", archivos: [archivo(71, "acta-de-publicacion.pdf")] },
    { id: 32, etiqueta: "A1.2", descripcion: "Socializar la versión nueva", terminadaEn: "2026-12-04", archivos: [] },
  ];
  const datos = (extra?: Partial<DatosDeEvaluacion>): DatosDeEvaluacion => ({
    minima: "2027-03-01",
    r: "2026-12-05",
    yaSePuede: false,
    criterios: ["mejora_indicador", "otro"],
    indicador: null,
    indicadorRetirado: false,
    ocurrencias: [],
    ...extra,
  });
  const evaluar = (x?: { datos?: DatosDeEvaluacion; criterioOtro?: string | null; avisoCambio?: boolean; cierra?: boolean }) =>
    renderToStaticMarkup(
      <PasoEvaluar
        hallazgoId={14}
        ronda={1}
        datos={x?.datos ?? datos()}
        criterioOtro={x?.criterioOtro ?? null}
        vistoHuella={"a".repeat(64)}
        hoy="2026-12-28"
        cierra={x?.cierra ?? false}
        pideCambios
        pideCodigo={false}
        accion={accion}
        derivar={null}
        avisoCambio={x?.avisoCambio}
      />,
    );

  it("2. PasoVerificar nombra la evidencia de cada actividad (sus archivos) y la rejilla nota/fecha se apila por su contenedor", () => {
    const html = renderToStaticMarkup(
      <PasoVerificar hallazgoId={14} actividades={actividades} hoy="2026-12-07" accion={accion} inicial={{ 31: "devuelta" }} />,
    );
    expect(html).toContain("acta-de-publicacion.pdf");
    expect(html).toContain('href="/mejoramiento/archivos/71/acta-de-publicacion.pdf"');
    expect(html).toContain("Sin evidencia adjunta");
    // Sin variantes de ventana (`sm:`) dentro de la columna: la rejilla responde al ancho de su contenedor.
    expect(html).not.toMatch(/\bsm:grid-cols/);
    expect(html).toContain("@container");
  });

  it("12. la nota al pie de verificar dice el respaldo de Gerencia cuando aplica", () => {
    const comun = renderToStaticMarkup(<PasoVerificar hallazgoId={14} actividades={actividades} hoy="2026-12-07" accion={accion} />);
    expect(comun).not.toContain("Gerencia");
    const gerencia = renderToStaticMarkup(<PasoVerificar hallazgoId={14} actividades={actividades} hoy="2026-12-07" accion={accion} respaldoGerencia />);
    expect(gerencia).toContain("verifica Gerencia");
  });

  it("3. una ronda anterior deja a la vista los archivos de su verificación, en lectura", () => {
    const ronda = {
      id: 5, numero: 1, estadoPlan: "aprobado", fechaEvaluacion: null, criterios: [], criterioOtro: null, indicadorEficaciaId: null,
      similares: null, similaresDetalle: null, cambios: null, analisis: [], causas: [], acciones: [], ajustes: [], resultado: "no_eficaz",
      verificacion: null, evaluacion: null,
    } as unknown as RondaDeDetalle;
    const html = renderToStaticMarkup(
      <RondaAnterior ronda={ronda} indicador={null} hoy="2026-12-28" zona="America/Bogota" verificacion={<p>archivo-de-la-verificacion.pdf</p>} />,
    );
    expect(html).toContain("archivo-de-la-verificacion.pdf");
  });

  it("5. tras «Cambió lo que se muestra», el formulario de evaluar lo explica antes de pedir otra vez la firma", () => {
    expect(evaluar()).not.toContain("Cambió lo que se muestra para evaluar");
    const aviso = evaluar({ avisoCambio: true });
    expect(aviso).toContain("Cambió lo que se muestra para evaluar: revíselo antes de registrar la evaluación.");
    expect(aviso).toMatch(/role="alert"/);
  });

  it("8. los controles fuera de un formulario no prometen validaciones que no se cumplen", () => {
    const html = evaluar({ cierra: true });
    for (const control of html.match(/<(textarea|input)[^>]*>/g) ?? []) {
      expect(control).not.toMatch(/\srequired=""|\sminLength=/);
    }
    for (const control of renderToStaticMarkup(<PasoCerrar hallazgoId={14} cambios="documentos" pideCodigo={false} accion={accion} />).match(/<(textarea|input)[^>]*>/g) ?? []) {
      expect(control).not.toMatch(/\srequired=""|\sminLength=/);
    }
  });

  it("9. la tabla del indicador se recorre con el teclado", () => {
    const html = renderToStaticMarkup(
      <SeccionEficacia
        evaluacion={null}
        evaluableDesde="2027-03-01"
        abierta
        zona="America/Bogota"
      >
        <TablaDelIndicador codigo="FAR-ID-002" nombre="Registros" filas={[{ periodo: "2026-10", etiqueta: "Octubre 2026", resultado: "93 %", semaforo: "atencion", noAplica: false, momento: "antes" }]} />
      </SeccionEficacia>,
    );
    expect(html).toMatch(/<div(?=[^>]*tabindex="0")(?=[^>]*role="region")(?=[^>]*aria-label="[^"]+")/);
  });

  it("11. el formulario de evaluar dice el criterio completo del plan: la descripción de «Otro» y por qué no se marca el indicador", () => {
    const html = evaluar({ criterioOtro: "Auditoría de seguimiento al turno de noche" });
    expect(html).toContain("Auditoría de seguimiento al turno de noche");
    expect(html).toContain("El plan no enlazó un indicador");
    const retirado = evaluar({ datos: datos({ indicadorRetirado: true, indicador: { codigo: "FAR-ID-002", nombre: "Registros", filas: [] } }) });
    expect(retirado).toContain("El indicador se retiró");
  });

  it("13. el historial de una verificación que devolvió actividades lo dice, con sus etiquetas", () => {
    const evento = (id: number, devueltas: string[]) => ({
      id, tipo: "verificar_implementacion", ronda: 1, quien: "Control Interno", cuando: new Date("2026-12-07T15:00:00Z"),
      detalle: { metodos: ["evidencias"], conformes: [], devueltas },
    });
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo zona="America/Bogota" eventos={[evento(1, ["A1.2"]), evento(2, ["A1.2", "A2.1"]), evento(3, [])]} />,
    );
    expect(html).toContain("Verificó la implementación y devolvió la actividad A1.2");
    expect(html).toContain("Verificó la implementación y devolvió las actividades A1.2 y A2.1");
    expect(html.split("Verificó la implementación").length - 1).toBe(3);
  });

  it("4. la traducción de `decision_<id>` al dominio: cada fila con su decisión, su nota y su fecha; lo demás no se decide", () => {
    const datos = new FormData();
    for (const [k, v] of [
      ["hallazgoId", "14"], ["actividad", "31"], ["actividad", "32"], ["actividad", "33"], ["actividad", "../x"],
      ["decision_31", "conforme"], ["decision_32", "devuelta"], ["nota_32", "  Faltan dos auxiliares  "], ["corregir_32", "2026-12-12"],
      ["decision_33", "otra"], ["metodos", "evidencias"],
    ]) datos.append(k, v);
    expect(idsDeLaVerificacion(datos)).toEqual(["31", "32", "33"]);
    expect(camposDeLaVerificacion(["31", "32"])).toEqual(["decision_31", "nota_31", "corregir_31", "decision_32", "nota_32", "corregir_32"]);
    expect(decisionesDeLaVerificacion(datos, ["31", "32", "33"])).toEqual([
      { id: 31, conforme: true, nota: null, corregirAntesDe: null },
      { id: 32, conforme: false, nota: "  Faltan dos auxiliares  ", corregirAntesDe: "2026-12-12" },
      // Sin una decisión válida, `conforme` no llega: el dominio responde «Marque cada actividad como conforme o devuélvala».
      { id: 33, conforme: undefined, nota: null, corregirAntesDe: null },
    ]);
  });
});

describe("Tarea 17, ronda 2: el borrador de la evaluación vive en la pestaña y se borra", () => {
  /** Un almacén de pestaña de mentira (la forma de `sessionStorage`). */
  const almacen = (inicial: Record<string, string> = {}) => {
    const m = new Map(Object.entries(inicial));
    return {
      m,
      get length() {
        return m.size;
      },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const roto = {
    length: 0,
    key: () => null,
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("bloqueado");
    },
    removeItem: () => {
      throw new Error("bloqueado");
    },
  };

  it("la clave lleva el hallazgo y la ronda", () => {
    expect(claveDelBorrador(14, 1)).not.toBe(claveDelBorrador(14, 2));
    expect(claveDelBorrador(14, 1)).not.toBe(claveDelBorrador(15, 1));
    expect(claveDelBorrador(14, 2)).toContain("14");
  });

  it("se escribe al enviar y se toma una vez, solo con el aviso de cambio: después ya no está", () => {
    const a = almacen();
    expect(guardarBorrador(a, claveDelBorrador(14, 1), { justificacion: "El indicador no bajó en enero" })).toBe(true);
    expect(tomarBorrador(a, claveDelBorrador(14, 1))).toEqual({ disponible: true, borrador: { justificacion: "El indicador no bajó en enero" } });
    expect(a.m.size).toBe(0);
    expect(tomarBorrador(a, claveDelBorrador(14, 1))).toEqual({ disponible: true, borrador: null });
    // Sin almacén (privado, bloqueado): nada se rompe y lo dice.
    expect(guardarBorrador(roto, claveDelBorrador(14, 1), { justificacion: "x" })).toBe(false);
    expect(tomarBorrador(roto, claveDelBorrador(14, 1))).toEqual({ disponible: false, borrador: null });
    expect(tomarBorrador(null, claveDelBorrador(14, 1))).toEqual({ disponible: false, borrador: null });
  });

  it("una carga sin el aviso de cambio borra los borradores de ese hallazgo (todas sus rondas) y deja los de otros", () => {
    const a = almacen({ [claveDelBorrador(14, 1)]: "{}", [claveDelBorrador(14, 2)]: "{}", [claveDelBorrador(140, 1)]: "{}", otra: "x" });
    quitarBorradoresDelHallazgo(a, 14);
    expect([...a.m.keys()].sort()).toEqual([claveDelBorrador(140, 1), "otra"].sort());
    expect(() => quitarBorradoresDelHallazgo(roto, 14)).not.toThrow();
  });

  it("después de mostrar el aviso, la dirección pierde `visto=cambio` (recargar no lo repite)", () => {
    expect(sinAvisoDeCambio("/mejoramiento/14?visto=cambio#evaluar")).toBe("/mejoramiento/14#evaluar");
    expect(sinAvisoDeCambio("/mejoramiento/14?a=1&visto=cambio")).toBe("/mejoramiento/14?a=1");
    expect(sinAvisoDeCambio("/mejoramiento/14")).toBe("/mejoramiento/14");
  });

  it("el formulario de evaluar no usa `localStorage` ni escribe el borrador al teclear", () => {
    const fuente = readFileSync(path.resolve(import.meta.dirname, "../src/componentes/mejoramiento/pasos/PasoEvaluar.tsx"), "utf8");
    expect(fuente).not.toContain("localStorage");
    expect(fuente).not.toMatch(/onChange=\{[^}]*guardar/);
    expect(fuente).toContain("alEnviar=");
  });
});

describe("Tarea 18: los reportes de funcionarios", () => {
  const ZONA = "America/Bogota";
  const accion = vi.fn(async () => null);

  it("la etiqueta de quien reportó: recibido, en trámite, cerrado (también rechazado o anulado) y descartado", () => {
    expect(etiquetaDeReporte("recibido", null)).toBe("Recibido");
    expect(etiquetaDeReporte("convertido", "por_aceptar")).toBe("En trámite");
    expect(etiquetaDeReporte("sumado", "en_espera")).toBe("En trámite");
    for (const terminal of ["cerrado", "rechazado", "anulado"]) expect(etiquetaDeReporte("convertido", terminal)).toBe("Cerrado");
    expect(etiquetaDeReporte("descartado", null)).toBe("Descartado");
  });

  it("el formulario de reportar lleva el aviso de pacientes, el proceso opcional («No sé») y no deja una fecha futura", () => {
    const html = renderToStaticMarkup(<FormularioReporte accion={accion} procesos={[{ id: 3, nombre: "Farmacia" }]} hoy="2026-11-18" />);
    expect(html).toContain(AVISO_SIN_PACIENTES);
    const descripcion = html.match(/<textarea[^>]*name="descripcion"[^>]*>/)![0];
    expect(descripcion).toMatch(/minLength="10"/i);
    expect(descripcion).toMatch(/maxLength="2000"/i);
    const visto = html.match(/<input[^>]*name="vistoEn"[^>]*>/)![0];
    expect(visto).toContain('type="date"');
    expect(visto).toContain('max="2026-11-18"');
    expect(html).toMatch(/<option value=""[^>]*>No sé<\/option>/);
    expect(html).toContain("Farmacia");
    expect(html).toContain('name="referenciaCaso"');
    expect(MAXIMO_POR_REPORTE).toBe(3);
    expect(html).toContain(`hasta ${MAXIMO_POR_REPORTE} archivos`);
    expect(html).toContain('href="/mejoramiento/reportes"');
    expect(html).toContain("Enviar el reporte");
  });

  const mio = (extra: Partial<MiReporte>): MiReporte => ({
    id: 7,
    cuando: new Date("2026-11-17T15:00:00Z"),
    vistoEn: "2026-11-16",
    descripcion: "La nevera marcaba 12 grados",
    etiqueta: "Recibido",
    motivo: null,
    archivos: 0,
    puedeAdjuntar: true,
    ...extra,
  });

  it("«Mis reportes»: la etiqueta con texto, el motivo del descarte y el enlace para adjuntar mientras se puede", () => {
    const html = renderToStaticMarkup(
      <MisReportes
        zona={ZONA}
        reportes={[
          { reporte: mio({}), archivos: [] },
          { reporte: mio({ id: 8, etiqueta: "En trámite", puedeAdjuntar: false }), archivos: [] },
          { reporte: mio({ id: 9, etiqueta: "Descartado", motivo: "La nevera se calibró ese día", puedeAdjuntar: false }), archivos: [] },
        ]}
      />,
    );
    expect(html).toContain("Recibido");
    expect(html).toContain("En trámite");
    expect(html).toContain("Descartado");
    expect(html).toContain("Motivo: La nevera se calibró ese día");
    expect(html).toContain('href="/mejoramiento/reportar?reporte=7"');
    expect(html).not.toContain("reporte=8");
    expect(html).not.toMatch(/href="\/mejoramiento\/\d/);
    const vacio = renderToStaticMarkup(<MisReportes zona={ZONA} reportes={[]} />);
    expect(vacio).toContain("Aún no ha enviado reportes");
    expect(vacio).toContain('href="/mejoramiento/reportar"');
  });

  const recibido = (extra: Partial<ReporteDeLaLista>): ReporteDeLaLista => ({
    id: 7,
    cuando: new Date("2026-11-17T15:00:00Z"),
    reportadoPor: "Marta Ruiz",
    descripcion: "La nevera marcaba 12 grados",
    vistoEn: "2026-11-16",
    procesoId: 3,
    proceso: "Farmacia",
    referenciaCaso: "EA-0417",
    estado: "recibido",
    vence: new Date("2026-11-21T04:59:59Z"),
    motivo: null,
    hallazgo: null,
    archivos: 0,
    ...extra,
  });
  const parecido = { id: 40, codigo: "HZ-2026-040", titulo: "Nevera sin registro", etiqueta: "En ejecución", proceso: "Farmacia" };

  it("«Reportes recibidos»: quién reportó, y clasificar solo a quien gestiona y solo lo recibido", () => {
    const filas = [
      { reporte: recibido({}), archivos: [], quitables: [], parecidos: [parecido] },
      {
        reporte: recibido({ id: 8, estado: "convertido", hallazgo: { id: 41, codigo: "HZ-2026-041", titulo: "Otro" } }),
        archivos: [],
        quitables: [],
        parecidos: null,
      },
      { reporte: recibido({ id: 9, estado: "descartado", motivo: "No corresponde" }), archivos: [], quitables: [], parecidos: null },
    ];
    const pintar = (gestiona: boolean, f = filas) =>
      renderToStaticMarkup(<ReportesRecibidos filas={f} gestiona={gestiona} zona={ZONA} ahora={AHORA} sumar={accion} descartar={accion} />);
    const html = pintar(true);
    expect(html).toContain("Marta Ruiz");
    expect(html).toContain("Por clasificar");
    expect(html).toContain("EA-0417");
    expect(html).toContain('href="/mejoramiento/nuevo?reporte=7"');
    expect(html).not.toContain("reporte=8");
    expect(html).toContain('href="/mejoramiento/41"');
    expect(html).toContain("Motivo: No corresponde");
    // Gerencia y Control Interno ven la lista sin clasificar.
    const soloLee = pintar(false);
    expect(soloLee).toContain("Marta Ruiz");
    expect(soloLee).not.toContain("Convertir en hallazgo");
    expect(soloLee).not.toContain("Descartar el reporte");
    expect(pintar(true, [])).toContain("No hay reportes recibidos");
  });

  it("clasificar ofrece convertir, añadir a un parecido abierto y descartar con el aviso de pacientes", () => {
    const html = renderToStaticMarkup(<ClasificarReporte reporteId={7} parecidos={[parecido]} conProceso sumar={accion} descartar={accion} />);
    expect(html).toContain("Convertir en hallazgo");
    expect(html).toContain('href="/mejoramiento/nuevo?reporte=7"');
    expect(html).toContain("Añadir a un hallazgo abierto");
    const radio = html.match(/<input[^>]*name="hallazgoId"[^>]*>/)![0];
    expect(radio).toContain('type="radio"');
    expect(radio).toContain('value="40"');
    expect(html).toContain("HZ-2026-040");
    expect(html).toMatch(/<input[^>]*name="reporteId"[^>]*value="7"/);
    expect(html).toContain("Descartar el reporte");
    expect(html).toContain(AVISO_SIN_PACIENTES);
    const sin = renderToStaticMarkup(<ClasificarReporte reporteId={7} parecidos={[]} conProceso sumar={accion} descartar={accion} />);
    expect(sin).toContain("No hay hallazgos abiertos que se le parezcan en su proceso");
    expect(sin).not.toContain('name="hallazgoId"');
  });

  it("registrar desde un reporte lleva su id oculto y lo dice", () => {
    const html = renderToStaticMarkup(
      <FormularioHallazgo
        accion={accion}
        procesos={[{ id: 3, nombre: "Farmacia" }]}
        hoy="2026-11-18"
        diasParaAceptar={3}
        valores={{ descripcion: "La nevera marcaba 12 grados", procesoId: "3", referenciaCaso: "EA-0417", detectadoEn: "2026-11-16" }}
        reporte={{ id: 7, reportadoPor: "Marta Ruiz", vistoEn: "2026-11-16" }}
      />,
    );
    expect(html).toMatch(/<input[^>]*name="reporteId"[^>]*value="7"/);
    expect(html).toMatch(/Convierte el reporte de <span[^>]*>Marta Ruiz<\/span>/);
    expect(html).toContain("La nevera marcaba 12 grados");
    // La referencia copiada se conserva aunque el origen elegido no la pida.
    expect(html).toContain('value="EA-0417"');
  });

  it("la identificación dice «Reportado por un funcionario» o el nombre, según quién mira", () => {
    const h = {
      clase: "oportunidad", origen: "otro", fuente: null, referenciaCaso: null, detectadoEn: "2026-11-10", proceso: "Farmacia",
      requisitoClausula: null, riesgo: null, descripcion: "Descripción", registradoPor: "Ana",
      registradoEn: new Date("2026-11-10T15:00:00Z"), fechaLimiteEnte: null, reincidenteDe: null,
    } as const;
    const pintar = (naceDeUnReporte: boolean, reportadoPor: string | null) =>
      renderToStaticMarkup(<SeccionIdentificacion hallazgo={{ ...h, naceDeUnReporte, reportadoPor }} zona={ZONA} abierta />);
    expect(pintar(true, null)).toContain("Reportado por un funcionario");
    expect(pintar(true, "Marta Ruiz")).toContain("Reportado por Marta Ruiz");
    expect(pintar(true, "Marta Ruiz")).not.toContain("un funcionario");
    expect(pintar(false, null)).not.toContain("Reportado por");
  });
});

describe("Tarea 18, ronda 1: sumar por código, los avisos del formulario y la evidencia del reporte sumado", () => {
  const accion = vi.fn(async () => null);
  const parecido = { id: 40, codigo: "HZ-2026-040", titulo: "Nevera sin registro", etiqueta: "En ejecución", proceso: "Farmacia" };

  it("añadir a un hallazgo abierto admite cualquier código, con los parecidos como sugerencias (ruling 2)", () => {
    const con = renderToStaticMarkup(<ClasificarReporte reporteId={7} parecidos={[parecido]} conProceso sumar={accion} descartar={accion} />);
    expect(con).toContain("HZ-2026-040");
    expect(con).toContain("Otro hallazgo abierto, por su código");
    const codigo = con.match(/<input[^>]*name="codigo"[^>]*>/)![0];
    expect(codigo).toContain('placeholder="HZ-2026-004"');
    const sin = renderToStaticMarkup(<ClasificarReporte reporteId={7} parecidos={[]} conProceso sumar={accion} descartar={accion} />);
    expect(sin).toContain("No hay hallazgos abiertos que se le parezcan en su proceso");
    expect(sin).not.toContain('name="hallazgoId"');
    const soloCodigo = sin.match(/<input[^>]*name="codigo"[^>]*>/)![0];
    expect(soloCodigo).toMatch(/required/);
    expect(sin).toContain("Añadir como ocurrencia");
  });

  it("al convertir, elegir una ocurrencia avisa que se usan lo que se vio y el día del reporte (ruling 9)", () => {
    const pintar = (relacion: string) =>
      renderToStaticMarkup(
        <FormularioHallazgo
          accion={accion}
          procesos={[{ id: 3, nombre: "Farmacia" }]}
          hoy="2026-11-18"
          diasParaAceptar={3}
          valores={{ descripcion: "La nevera marcaba 12 grados", procesoId: "3", relacion }}
          reporte={{ id: 7, reportadoPor: "Marta Ruiz", vistoEn: "2026-11-16" }}
        />,
      );
    const aviso = "El reporte se añade como ocurrencia con lo que se vio y el día del reporte; lo que escriba aquí no se guarda.";
    expect(pintar("ocurrencia:40")).toContain(aviso);
    expect(pintar("distinto")).not.toContain(aviso);
  });

  it("la ocurrencia que llegó por un reporte lista sus archivos (ruling 8)", () => {
    const html = renderToStaticMarkup(
      <Ocurrencias
        hallazgoId={14}
        ocurrencias={[
          { id: 3, fecha: "2026-11-16", descripcion: "La nevera marcaba 12 grados", quien: "Ana", reporte: true },
          { id: 4, fecha: "2026-11-17", descripcion: "Otra vez sin registro", quien: "Ana", reporte: false },
        ]}
        archivos={{ 3: [{ id: 90, nombre: "foto-nevera.pdf", mime: "application/pdf", tamano: 2048 }] }}
        puedeAnadir={false}
        hoy="2026-11-18"
        accion={accion}
      />,
    );
    expect(html).toContain('href="/mejoramiento/archivos/90/foto-nevera.pdf"');
    expect(html.match(/Llegó por el reporte de un funcionario/g)).toHaveLength(1);
  });

  it("«Reportes recibidos» dice que muestra los clasificados de los últimos 90 días (ruling 6)", () => {
    const html = renderToStaticMarkup(<ReportesRecibidos filas={[]} gestiona zona="America/Bogota" ahora={AHORA} sumar={accion} descartar={accion} />);
    expect(html).toContain("los clasificados en los últimos 90 días");
  });

  it("quien no ve hallazgos: se queda en la lista si registra o ve todo; si no, a sus actividades o a sus reportes (ruling 3)", () => {
    for (const rol of ["admin_sgc", "control_interno", "gerencia", "lider_proceso"] as const) {
      expect(adondeVaSinLista({ rol }, { veHallazgos: false, tieneActividades: false })).toBeNull();
    }
    expect(adondeVaSinLista({ rol: "consulta" }, { veHallazgos: false, tieneActividades: false })).toBe("/mejoramiento/reportes");
    expect(adondeVaSinLista({ rol: "consulta" }, { veHallazgos: false, tieneActividades: true })).toBe("/mejoramiento/actividades");
    expect(adondeVaSinLista({ rol: "consulta" }, { veHallazgos: true, tieneActividades: false })).toBeNull();
  });
});

describe("la respuesta al ente (Tarea 19, spec §13.4)", () => {
  const oficio = <ArchivosDe archivos={[{ id: 77, nombre: "oficio-respuesta.pdf", mime: "application/pdf", tamano: 4096 }]} />;
  const accion = async () => null;

  it("registrada: la fecha, quién y el oficio, sin formulario", () => {
    const html = renderToStaticMarkup(
      <SeccionRespuestaAlEnte fechaLimite="2026-12-30" respuesta={{ enviadaEn: "2026-11-18", por: "Ana Ruiz" }} terminado={false} oficio={oficio} />,
    );
    expect(html).toContain("Respuesta al ente");
    expect(html).toContain(`Fecha límite de respuesta: ${fechaDeDia("2026-12-30")}.`);
    expect(html).toContain(`Enviada el ${fechaDeDia("2026-11-18")} · la registró Ana Ruiz.`);
    expect(html).toContain("El oficio");
    expect(html).toContain('href="/mejoramiento/archivos/77/oficio-respuesta.pdf"');
    expect(html).not.toContain("<form");
  });

  it("sin registrar, al Admin SGC: elige el oficio (uno solo, ya elegido) y la fecha, entre la aprobación y hoy", () => {
    const html = renderToStaticMarkup(
      <SeccionRespuestaAlEnte fechaLimite={null} respuesta={null} terminado={false} oficio={oficio}>
        <PasoResponderAlEnte hallazgoId={14} hoy="2026-11-18" desde="2026-11-17" candidatos={[{ id: 77, nombre: "oficio-respuesta.pdf" }]} accion={accion} />
      </SeccionRespuestaAlEnte>,
    );
    expect(html).toContain("Suba el oficio de respuesta, elíjalo y registre la fecha en que se envió.");
    expect(html).toContain('id="oficio-ente"');
    expect(html).not.toContain("Fecha límite de respuesta");
    expect(html).toMatch(/<input(?=[^>]*type="radio")(?=[^>]*name="oficioId")(?=[^>]*value="77")(?=[^>]*checked="")(?=[^>]*required="")/);
    expect(html).toMatch(/<input(?=[^>]*type="date")(?=[^>]*name="enviadaEn")(?=[^>]*required="")(?=[^>]*min="2026-11-17")(?=[^>]*max="2026-11-18")/);
    expect(html).toMatch(/<input(?=[^>]*type="hidden")(?=[^>]*name="hallazgoId")(?=[^>]*value="14")/);
    expect(html).toContain("Registrar la respuesta al ente");
  });

  it("con dos archivos que pueden ser el oficio, ninguno viene elegido; sin ninguno, falta el oficio y enlaza la zona de carga", () => {
    const dos = renderToStaticMarkup(
      <PasoResponderAlEnte
        hallazgoId={14}
        hoy="2026-11-18"
        desde="2026-11-17"
        candidatos={[
          { id: 77, nombre: "oficio-respuesta.pdf" },
          { id: 78, nombre: "anexo.pdf" },
        ]}
        accion={accion}
      />,
    );
    expect(dos.match(/name="oficioId"/g)).toHaveLength(2);
    expect(dos).not.toContain('checked=""');
    const ninguno = renderToStaticMarkup(<PasoResponderAlEnte hallazgoId={14} hoy="2026-11-18" desde="2026-11-17" candidatos={[]} accion={accion} />);
    expect(ninguno).toContain("Adjunte el oficio de respuesta");
    expect(ninguno).toContain('href="#oficio-ente"');
    expect(ninguno).not.toContain("<form");
  });

  it("sin registrar, a los demás: que falta; terminado sin respuesta: que no se registró", () => {
    const html = renderToStaticMarkup(<SeccionRespuestaAlEnte fechaLimite="2026-12-30" respuesta={null} terminado={false} oficio={oficio} />);
    expect(html).toContain("El Administrador del SGC todavía no registra la respuesta.");
    expect(html).not.toContain("oficio-respuesta.pdf");
    expect(html).not.toContain("<form");
    const terminado = renderToStaticMarkup(<SeccionRespuestaAlEnte fechaLimite="2026-12-30" respuesta={null} terminado oficio={oficio} />);
    expect(terminado).toContain("No se registró la respuesta al ente.");
    expect(terminado).not.toContain("todavía no registra");
    expect(terminado).not.toContain("oficio-respuesta.pdf");
  });

  it("el historial dice cuándo se envió", () => {
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        eventos={[{ id: 1, tipo: "respuesta_ente", ronda: 1, quien: "Ana Ruiz", cuando: new Date("2026-11-18T15:00:00Z"), detalle: { enviadaEn: "2026-11-18", oficioId: 77 } }]}
        zona="America/Bogota"
      />,
    );
    expect(html).toContain(`Registró la respuesta al ente, enviada el ${fechaDeDia("2026-11-18")}`);
  });
});

describe("un hallazgo ya en curso (spec §15)", () => {
  it("el formulario de la carga va por bloques y dice que lo de papel queda marcado, sin firma del sistema", () => {
    const html = renderToStaticMarkup(
      <FormularioCarga accion={vi.fn(async () => null)} procesos={[{ id: 3, nombre: "Farmacia" }]} normas={[]} documentos={[]} usuarios={[]}
        indicadores={[]}
        enlaces={{
          subprocesos: [{ id: 7, nombre: "Dispensación", procesoId: 3 }],
          cerrados: [],
          indicadores: [{ id: 9, codigo: "FAR-ID-001", nombre: "Oportunidad de dispensación" }],
          mediciones: [],
        }}
        hoy="2026-11-18"
      />,
    );
    expect(html).toContain("Lo que se hizo en papel quedará marcado como hecho fuera de la plataforma, sin firma del sistema.");
    expect(html).toContain(AVISO_SIN_PACIENTES);
    // Sin clase elegida, el análisis es el opcional de las demás clases (§9.5).
    for (const bloque of ["1. Identificación", "3. Causas raíz (opcional)", "4. Plan de acción", "5. Aprobación en papel"]) expect(html).toContain(bloque);
    expect(html).toContain('name="registradoEnPapel"');
    expect(html).toContain('name="aprobacionRol"');
    // La identificación enlaza lo mismo que el registro: el indicador (la medición y el subproceso aparecen al elegir).
    expect(html).toContain('name="indicadorId"');
    expect(html).toContain("FAR-ID-001 · Oportunidad de dispensación");
    // Cada acción lleva sus recursos, su indicador de cumplimiento y su meta (columnas del SGC-FO-28).
    for (const rotulo of ["Recursos necesarios", "Indicador de cumplimiento", "Meta"]) expect(html).toContain(rotulo);
  });

  it("el historial marca lo hecho en papel con su día y sin el nombre de quien lo cargó", () => {
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona="America/Bogota"
        eventos={[
          { id: 1, tipo: "aprobar_plan", ronda: 1, quien: "Ana Carga", cuando: new Date("2025-11-04T05:00:00Z"), fuera: true, detalle: { aprobadoPor: "Marta Ríos, Gerente" } },
          { id: 2, tipo: "cargar", ronda: 1, quien: "Ana Carga", cuando: new Date("2026-11-18T15:00:00Z"), detalle: {} },
          { id: 3, tipo: "carga_confirmada", ronda: 1, quien: "Ana Carga", cuando: new Date("2026-11-19T15:00:00Z"), detalle: {} },
        ]}
      />,
    );
    expect(html).toContain(`Hecho fuera de la plataforma · <time dateTime="2025-11-04">${fechaDeDia("2025-11-04")}</time>`);
    expect(html).toContain("Lo aprobó: Marta Ríos, Gerente");
    expect(html.match(/Ana Carga/g)).toHaveLength(2);
    expect(html).toContain("Adjuntó el formato firmado de la carga");
  });
});

describe("los formularios del módulo caben a 390 px (recorrido de cierre, D1 y D8)", () => {
  /** Las listas de clases de cada elemento del HTML. */
  const clases = (html: string) => [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  /** Una rejilla sin plantilla de columnas: su columna implícita (`auto`) crece hasta la opción más larga de un `select`. */
  const sinPlantilla = (cs: string[][]) => cs.filter((c) => c.includes("grid") && !c.some((t) => /^grid-cols-/.test(t))).map((c) => c.join(" "));

  it("las tres pantallas que desbordaban: toda rejilla con su columna, todo grupo y todo campo ceden al ancho", () => {
    const procesos = [{ id: 3, nombre: "Gestión de la Información y las Comunicaciones del hospital" }];
    const largo = { id: 9, codigo: "SOG-DE-01", titulo: "Resolución 3100 de 2019: texto de trabajo con un título muy largo para la prueba" };
    const pantallas = [
      renderToStaticMarkup(<FormularioReporte accion={vi.fn(async () => null)} procesos={procesos} hoy="2026-11-18" />),
      renderToStaticMarkup(<FormularioHallazgo accion={vi.fn(async () => null)} procesos={procesos} hoy="2026-11-18" diasParaAceptar={3} documentos={[largo]} />),
      renderToStaticMarkup(
        <FormularioCarga
          accion={vi.fn(async () => null)}
          procesos={procesos}
          normas={[]}
          documentos={[largo]}
          usuarios={[]}
          indicadores={[]}
          enlaces={{ subprocesos: [], cerrados: [], indicadores: [], mediciones: [] }}
          hoy="2026-11-18"
        />,
      ),
    ];
    for (const html of pantallas) {
      expect(sinPlantilla(clases(html))).toEqual([]);
      for (const f of html.match(/<fieldset[^>]*>/g) ?? []) expect(f).toMatch(/\bmin-w-0\b/);
      // La envoltura de cada `Campo` (la que lleva la etiqueta y el control) cede en una rejilla o una fila.
      const envolturas = [...html.matchAll(/<div class="([^"]*)"><label for=/g)].map((m) => m[1].split(" "));
      expect(envolturas.length).toBeGreaterThan(0);
      for (const e of envolturas) expect(e).toContain("min-w-0");
    }
  });

  it("y en el código de todos los formularios y páginas del módulo", () => {
    const raices = ["src/componentes/mejoramiento", "src/app/(app)/mejoramiento", "src/app/(app)/admin/(panel)/mejoramiento"];
    const archivos = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const ruta = path.join(dir, f);
        return statSync(ruta).isDirectory() ? archivos(ruta) : ruta.endsWith(".tsx") ? [ruta] : [];
      });
    const fuera: string[] = [];
    for (const archivo of raices.flatMap((r) => archivos(path.resolve(r)))) {
      const texto = readFileSync(archivo, "utf8");
      for (const m of texto.matchAll(/["`]([^"`\n]*)["`]/g)) {
        const t = m[1].split(/\s+/);
        if (t.includes("grid") && !t.some((x) => /^grid-cols-/.test(x))) fuera.push(`${archivo}: ${m[1]}`);
      }
      for (const f of texto.match(/<fieldset\b[^>]*>/g) ?? []) if (!/\bmin-w-0\b/.test(f)) fuera.push(`${archivo}: ${f}`);
    }
    expect(fuera).toEqual([]);
  });
});

describe("el registro gana «A qué se refiere» y el objetivo (Fase 15B, anexo §10.3 y §10.4)", () => {
  const listas = {
    procesos: [{ id: 3, nombre: "Farmacia" }],
    documentos: [{ id: 4, codigo: "FAR-PR-04", titulo: "Cadena de frío" }],
    indicadores: [{ id: 9, codigo: "FAR-ID-001", nombre: "Oportunidad de dispensación" }],
    mediciones: [{ id: 21, indicadorId: 9, etiqueta: "Octubre de 2026" }],
    objetivos: [{ id: 2, etiqueta: "Institucional · Fortalecer la sostenibilidad financiera" }],
  };
  const base = { accion: vi.fn(async () => null), hoy: "2026-11-18", diasParaAceptar: 3, ...listas };
  const vacio = { valores: {}, fijos: [], ocultos: {}, rotulo: null };

  it("pinta «A qué se refiere» (documento, indicador y, con él, sus mediciones con resultado) y «Objetivo» con los activos", () => {
    const sinIndicador = renderToStaticMarkup(<FormularioHallazgo {...base} />);
    expect(sinIndicador).toContain("A qué se refiere");
    expect(sinIndicador).toMatch(/<select[^>]*name="documentoId"/);
    expect(sinIndicador).toMatch(/<select[^>]*name="indicadorId"/);
    expect(sinIndicador).toContain("FAR-ID-001 · Oportunidad de dispensación");
    // La medición aparece al elegir el indicador.
    expect(sinIndicador).not.toContain('name="medicionId"');
    expect(sinIndicador).toContain(">Objetivo (opcional)<");
    expect(sinIndicador).toMatch(/<select[^>]*name="objetivoId"/);
    expect(sinIndicador).toContain("Institucional · Fortalecer la sostenibilidad financiera");

    const conIndicador = renderToStaticMarkup(<FormularioHallazgo {...base} valores={{ indicadorId: "9" }} />);
    expect(conIndicador).toMatch(/<select[^>]*name="medicionId"/);
    expect(conIndicador).toContain("Octubre de 2026");
  });

  it("un campo fijo aparece como texto con su campo oculto, no como control", () => {
    const html = renderToStaticMarkup(
      <FormularioHallazgo
        {...base}
        prellenado={{ valores: { clase: "no_conformidad", indicadorId: 9, medicionId: 21 }, fijos: ["clase", "indicadorId", "medicionId"], ocultos: {}, rotulo: null }}
      />,
    );
    for (const [nombre, valor] of [["clase", "no_conformidad"], ["indicadorId", "9"], ["medicionId", "21"]]) {
      expect(html).toMatch(new RegExp(`<input type="hidden" name="${nombre}" value="${valor}"/>`));
      expect(html).not.toMatch(new RegExp(`<select[^>]*name="${nombre}"`));
    }
    const texto = sinEtiquetas(html);
    expect(texto).toContain("No conformidad");
    expect(texto).toContain("FAR-ID-001 · Oportunidad de dispensación");
    expect(texto).toContain("Octubre de 2026");
    // Lo que depende de la clase fija sigue a la vista: la criticidad de la no conformidad.
    expect(html).toContain(">Criticidad<");
  });

  it("dentro de un plan: el rótulo arriba, el plan oculto y lo propuesto editable", () => {
    const html = renderToStaticMarkup(
      <FormularioHallazgo
        {...base}
        prellenado={{
          valores: { origen: "auditoria_externa", fuente: "Auditoría de cumplimiento vigencia 2025", fechaLimiteEnte: "2026-12-15", objetivoId: 2 },
          fijos: [],
          ocultos: { planId: "5" },
          rotulo: "Se registra dentro del plan PM-2026-05",
        }}
      />,
    );
    expect(html).toContain("Se registra dentro del plan PM-2026-05");
    expect(html).toMatch(/<input type="hidden" name="planId" value="5"\/>/);
    expect(html).toMatch(/<select[^>]*name="origen"/);
    expect(html).toMatch(/<option value="auditoria_externa" selected="">/);
    expect(html).toContain('value="Auditoría de cumplimiento vigencia 2025"');
    expect(html).toContain('value="2026-12-15"');
    expect(html).toMatch(/<option value="2" selected="">Institucional/);
  });

  it("lo que la página trae (un reporte, un derivado) manda sobre lo propuesto, salvo lo fijo", () => {
    const html = renderToStaticMarkup(
      <FormularioHallazgo
        {...base}
        procesos={[{ id: 3, nombre: "Farmacia" }, { id: 4, nombre: "Urgencias" }]}
        valores={{ procesoId: "4", descripcion: "Lo que vio quien reportó, con la evidencia" }}
        prellenado={{ ...vacio, valores: { procesoId: 3, documentoId: 4 } }}
      />,
    );
    expect(html).toMatch(/<option value="4" selected="">Urgencias/);
    expect(html).toMatch(/<option value="4" selected="">FAR-PR-04/);
    const fijo = renderToStaticMarkup(
      <FormularioHallazgo {...base} valores={{ clase: "observacion" }} prellenado={{ ...vacio, valores: { clase: "no_conformidad" }, fijos: ["clase"] }} />,
    );
    expect(fijo).toMatch(/<input type="hidden" name="clase" value="no_conformidad"\/>/);
  });

  it("en edición no pinta «A qué se refiere» ni «Objetivo» (la edición conserva los enlaces y el objetivo va en «Clasificación»)", () => {
    const html = renderToStaticMarkup(<FormularioHallazgo {...base} valores={{ titulo: "Un título" }} edicion={{ hallazgoId: 41 }} />);
    expect(html).not.toContain("A qué se refiere");
    expect(html).not.toContain('name="objetivoId"');
    expect(html).not.toContain('name="documentoId"');
  });

  it("la carga de un hallazgo en curso también: «A qué se refiere», «Objetivo» y lo que trae el plan", () => {
    const html = renderToStaticMarkup(
      <FormularioCarga
        accion={vi.fn(async () => null)}
        procesos={listas.procesos}
        normas={[]}
        documentos={listas.documentos}
        usuarios={[]}
        indicadores={[]}
        enlaces={{ subprocesos: [], cerrados: [], indicadores: listas.indicadores, mediciones: listas.mediciones }}
        objetivos={listas.objetivos}
        hoy="2026-11-18"
        prellenado={{
          valores: { origen: "auditoria_interna", fuente: "Auditoría interna de calidad de noviembre", objetivoId: 2, documentoId: 4 },
          fijos: [],
          ocultos: { planId: "5" },
          rotulo: "Se registra dentro del plan PM-2026-05",
        }}
      />,
    );
    expect(html).toContain("A qué se refiere");
    expect(html).toMatch(/<option value="4" selected="">FAR-PR-04/);
    expect(html).toMatch(/<select[^>]*name="indicadorId"/);
    expect(html).toContain(">Objetivo (opcional)<");
    expect(html).toMatch(/<option value="2" selected="">Institucional/);
    expect(html).toContain("Se registra dentro del plan PM-2026-05");
    expect(html).toMatch(/<input type="hidden" name="planId" value="5"\/>/);
    expect(html).toMatch(/<option value="auditoria_interna" selected="">/);
    expect(html).toContain('value="Auditoría interna de calidad de noviembre"');
  });
});
