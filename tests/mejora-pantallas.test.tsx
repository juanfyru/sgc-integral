/**
 * Las pantallas de «Mejoramiento» de la 15A que no tocan la base (spec 15 §16.1 y §16.2, maquetas 1 a 3): la lista, el
 * recorrido, el formulario de registro y «Lo que sigue». Con datos de mentira.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { DialogoReasignar } from "@/componentes/mejoramiento/actividad/DialogoReasignar";
import { FormularioSeguimiento, TerminarActividad, focoDeLaConfirmacion } from "@/componentes/mejoramiento/actividad/FormularioSeguimiento";
import { ListaDeSeguimientos } from "@/componentes/mejoramiento/actividad/ListaDeSeguimientos";
import { MisActividades } from "@/componentes/mejoramiento/actividad/MisActividades";
import { PaginaDeActividad } from "@/componentes/mejoramiento/actividad/PaginaDeActividad";
import type { DetalleDeActividad } from "@/db/consultas/mejoramiento/actividades";
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
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";

// La zona de carga de la evidencia (en la página de una actividad) pide el enrutador del cliente.
vi.mock("next/navigation", async (importar) => ({
  ...(await importar<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

// 18 de noviembre de 2026 (miércoles), 10:00 en Bogotá. El lunes 16 es festivo: del 11 al 18 hay cuatro días hábiles.
const AHORA = new Date("2026-11-18T15:00:00Z");
const CONTEXTO = { ahora: AHORA, zona: "America/Bogota", calendario: SIN_AJUSTES };

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
});

describe("fraseDeLoQueSigue (el armador real)", () => {
  it("el turno va en minúscula tras los dos puntos", () => {
    const h = { estado: "por_aceptar" as const, resultadoCierre: null, correccionRequerida: null };
    expect(fraseDeLoQueSigue(h, "La líder del proceso", false)).toBe("Tiene el turno: la líder del proceso, para aceptar el hallazgo o rechazarlo.");
    expect(fraseDeLoQueSigue(h, "La líder del proceso", true)).toBe("A usted le toca aceptar el hallazgo o rechazarlo.");
  });
});

describe("PestanasMejoramiento", () => {
  it("ofrece «Hallazgos» a quien los ve y «Mis actividades» a toda sesión; «Mis reportes» llega en la tarea 18", () => {
    expect(pestanasVisibles({ rol: "consulta" }, { veHallazgos: true })).toEqual(["hallazgos", "actividades"]);
    expect(pestanasVisibles({ rol: "consulta" }, { veHallazgos: false })).toEqual(["actividades"]);
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
              inicio: "2026-11-14", finOriginal: "2026-11-20", fin: "2026-11-20", avance: 60, estado: "en_proceso", reprogramaciones: 0 },
            { id: 22, orden: 2, descripcion: "Comprar e instalar el equipo", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
              inicio: "2026-11-01", finOriginal: "2026-11-14", fin: "2026-11-14", avance: 30, estado: "en_proceso", reprogramaciones: 0 },
          ],
        },
      ],
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
    expect(razonDeGerencia({ ...nc, criticidad: "alta" }, { requiereRecursos: false, elaboroAdmin: false })).toBe("criticidad alta");
    expect(razonDeGerencia({ ...nc, origen: "ente_control" }, { requiereRecursos: false, elaboroAdmin: false })).toBe("origen externo");
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
        gerencia="criticidad alta"
        enCurso="elaboro"
        vence={vence}
        plazos={{ revisar: 3, aprobar: 3 }}
        contexto={CONTEXTO}
      />,
    );
    for (const t of ["Elaboró", "Revisó", "Aprobó"]) expect(html).toContain(t);
    expect(html).toContain("Usted, con su clave, al enviar");
    expect(html).toContain("Administrador del SGC · 3 días hábiles");
    expect(html).toContain("Gerencia · aplica: criticidad alta · 3 días hábiles");
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
      <PasoRevisar hallazgoId={7} causasSinAccion={[]} gerencia="criticidad alta" huella={HUELLA} pideCodigo={false} firmar={accion} devolver={accion} />,
    );
    expect(aGerencia).toContain("el plan pasa a Gerencia para su aprobación (criticidad alta)");
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
        acciones={{ seguimiento: accion, terminar: accion, reasignar: accion }}
      />,
    );

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
          { id: 22, descripcion: "Comprar e instalar el equipo", hallazgoId: 14, hallazgoCodigo: "HZ-2026-014", etiqueta: "A2.1", fin: "2026-11-14", avance: 30, estado: "en_proceso", vencida: true, devuelta: false },
          { id: 23, descripcion: "Capacitar al turno de noche", hallazgoId: 14, hallazgoCodigo: "HZ-2026-014", etiqueta: "A2.2", fin: "2026-12-01", avance: 0, estado: "abierta", vencida: false, devuelta: true },
          { id: 24, descripcion: "Pedir el cambio documental", hallazgoId: 14, hallazgoCodigo: "HZ-2026-014", etiqueta: "A1.1", fin: "2026-11-10", avance: 100, estado: "terminada", vencida: false, devuelta: false },
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
              inicio: "2026-11-14", finOriginal: "2026-11-20", fin: "2026-11-20", avance: 60, estado: "en_proceso", reprogramaciones: 0, seAbre: true },
            { id: 22, orden: 2, descripcion: "Comprar e instalar el equipo", responsableId: 8, responsable: "J. Perdomo", responsableActivo: true,
              inicio: "2026-11-01", finOriginal: "2026-11-30", fin: "2026-11-30", avance: 30, estado: "en_proceso", reprogramaciones: 0, seAbre: false },
          ],
        },
      ],
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
