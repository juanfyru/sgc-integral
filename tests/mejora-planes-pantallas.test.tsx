/**
 * Las pantallas de los planes de mejoramiento que no tocan la base (Fase 15B, Tarea 4; anexo §3.4 a §3.6 y §3.9, maquetas 1 y 2):
 * la pestaña «Planes», el encabezado y los hallazgos de la página del plan, su historial y la sección «Clasificación» de un
 * hallazgo; y (Tarea 5, anexo §3.7 y §3.8) la respuesta al ente y los archivos del plan, y la respuesta al ente de un hallazgo
 * que está en un plan. Con datos de mentira.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EstadoAccion } from "@/app/admin/comun";
import { SeccionClasificacion } from "@/componentes/mejoramiento/SeccionClasificacion";
import { SeccionRespuestaAlEnte } from "@/componentes/mejoramiento/SeccionRespuestaAlEnte";
import { ArchivosDelPlan } from "@/componentes/mejoramiento/planes/ArchivosDelPlan";
import { RespuestaAlEnte } from "@/componentes/mejoramiento/planes/RespuestaAlEnte";
import type { RespuestaDelPlan } from "@/db/consultas/mejoramiento/respuesta-plan";
import { DatosDelPlan } from "@/componentes/mejoramiento/planes/DatosDelPlan";
import { EncabezadoDelPlan } from "@/componentes/mejoramiento/planes/EncabezadoDelPlan";
import { HallazgosDelPlan } from "@/componentes/mejoramiento/planes/HallazgosDelPlan";
import { HistorialDelPlan } from "@/componentes/mejoramiento/planes/HistorialDelPlan";
import { ListaDePlanes } from "@/componentes/mejoramiento/planes/ListaDePlanes";
import { SelectorDeHallazgos } from "@/componentes/mejoramiento/planes/SelectorDeHallazgos";
import type { DetalleDePlan, FilaDelPlan, PlanDeLaLista } from "@/db/consultas/mejoramiento/planes-lectura";
import { SIN_AJUSTES } from "@/lib/dias-habiles";
import { EsquemaFormularioCambiarDePlan, EsquemaFormularioPonerEnPlan } from "@/lib/esquemas/mejoramiento";
import { parsearFormulario } from "@/lib/validacion";
import { fechaDeDia } from "@/lib/mejoramiento/formato";

// La zona de carga de los archivos del plan pide el enrutador del cliente.
vi.mock("next/navigation", async (importar) => ({
  ...(await importar<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

// 18 de noviembre de 2026 (miércoles), 10:00 en Bogotá.
const AHORA = new Date("2026-11-18T15:00:00Z");
const CONTEXTO = { ahora: AHORA, zona: "America/Bogota", calendario: SIN_AJUSTES };
const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, "");
const accion = async (): Promise<EstadoAccion> => null;

const planDeLista = (extra: Partial<PlanDeLaLista> = {}): PlanDeLaLista => ({
  id: 2,
  codigo: "PM-2026-02",
  nombre: "Auditoría de cumplimiento vigencia 2025 · PVCFT 2026",
  origen: "ente_control",
  vigencia: 2026,
  fechaEvento: "2026-10-02",
  fechaLimiteEnte: "2026-12-11",
  estado: "abierto",
  hallazgos: 6,
  abiertos: 5,
  conAlgoVencido: 1,
  avance: 53,
  ...extra,
});

const filaDelPlan = (extra: Partial<FilaDelPlan> = {}): FilaDelPlan => ({
  id: 19,
  codigo: "HZ-2026-019",
  titulo: "Debilidades en los informes de supervisión de contratos",
  clase: "no_conformidad",
  criticidad: "alta",
  origen: "ente_control",
  proceso: "Gestión de Bienes y Servicios",
  estado: "en_ejecucion",
  etiqueta: "En ejecución",
  marcas: [],
  turno: "Los responsables de las actividades",
  avance: 75,
  vence: new Date("2027-01-01T04:59:59Z"),
  prioridadAlta: true,
  origenDistinto: false,
  cuenta: true,
  ...extra,
});

const detalle = (extra: Partial<DetalleDePlan> = {}): DetalleDePlan => ({
  ...planDeLista(),
  objetivoTexto: "Subsanar las observaciones de la auditoría de cumplimiento.",
  objetivo: "Institucional · Fortalecer la sostenibilidad financiera",
  objetivoId: 3,
  proponeObjetivo: true,
  anuladoMotivo: null,
  grupos: [
    {
      procesoId: 7,
      proceso: "Gestión de Bienes y Servicios",
      filas: [
        filaDelPlan(),
        filaDelPlan({ id: 11, codigo: "HZ-2026-011", titulo: "Expedientes contractuales sin foliar", origen: "auditoria_interna", origenDistinto: true }),
        filaDelPlan({ id: 8, codigo: "HZ-2026-008", titulo: "Registrado dos veces", estado: "anulado", etiqueta: "Anulado", cuenta: false, avance: null, vence: null }),
      ],
    },
  ],
  historial: [
    { tipo: "entra", en: new Date("2026-11-18T15:00:00Z"), por: "Control Interno de ejemplo", hallazgo: "HZ-2026-011", texto: "añadió HZ-2026-011" },
    { tipo: "creado", en: new Date("2026-10-05T15:00:00Z"), por: "María Fernanda Perdomo", hallazgo: null, texto: "creó el plan" },
  ],
  archivos: null,
  respuesta: null,
  puede: { gestionar: true, verTodo: true, responder: true },
  ...extra,
});

describe("ListaDePlanes (maqueta 1)", () => {
  it("pinta el código con su enlace, el nombre, el evento, las cifras, el avance y el estado con su palabra", () => {
    const html = renderToStaticMarkup(
      <ListaDePlanes
        planes={[planDeLista(), planDeLista({ id: 3, codigo: "PM-2026-03", estado: "sin_hallazgos", hallazgos: 0, abiertos: 0, conAlgoVencido: 0, avance: null, fechaLimiteEnte: null }), planDeLista({ id: 4, codigo: "PM-2025-03", estado: "cerrado", abiertos: 0, conAlgoVencido: 0, avance: 100, fechaLimiteEnte: null })]}
        contexto={CONTEXTO}
      />,
    );
    const texto = sinEtiquetas(html);
    expect(html).toContain('href="/mejoramiento/planes/2"');
    expect(texto).toContain("Auditoría de cumplimiento vigencia 2025 · PVCFT 2026");
    expect(texto).toContain("Evento: 2 de octubre de 2026");
    expect(texto).toContain("5 abiertos de 6");
    expect(texto).toContain("1 con algo vencido");
    expect(texto).toContain("53 %");
    expect(texto).toContain("Ente de control");
    // El estado siempre con su palabra, en la tabla y en las tarjetas.
    for (const palabra of ["Abierto", "Sin hallazgos", "Cerrado"]) expect(texto).toContain(palabra);
    expect(html).toContain('data-variante="bien"');
    // La fecha del ente de un plan abierto dice cuánto falta.
    expect(texto).toContain("quedan");
    // En las tarjetas, el avance y la fecha del ente con su rótulo.
    expect(texto).toContain("Avance:—");
    expect(texto).toContain("Fecha del ente:");
  });

  it("sin planes, un estado vacío que no dice nada de los que no ve", () => {
    const texto = sinEtiquetas(renderToStaticMarkup(<ListaDePlanes planes={[]} contexto={CONTEXTO} />));
    expect(texto).toContain("Aún no hay planes a la vista");
    expect(sinEtiquetas(renderToStaticMarkup(<ListaDePlanes planes={[]} contexto={CONTEXTO} conFiltros />))).toContain(
      "Ningún plan coincide con los filtros",
    );
  });
});

describe("la página del plan (maqueta 2)", () => {
  it("pinta «Origen distinto: Auditoría interna» y la marca del que ya no cuenta", () => {
    const texto = sinEtiquetas(renderToStaticMarkup(<HallazgosDelPlan plan={detalle()} contexto={CONTEXTO} sacar={accion} />));
    expect(texto).toContain("Origen distinto: Auditoría interna");
    expect(texto.match(/Origen distinto/g)).toHaveLength(2); // la tabla y la tarjeta del mismo hallazgo
    expect(texto).toContain("Anulado: ya no cuenta en el plan");
    expect(texto).toContain("Gestión de Bienes y Servicios · 2 hallazgos · 1 que ya no cuenta");
    // En las tarjetas (390 px), cada valor con su rótulo: sin avance ni fecha, «Avance: —» y «Vence: —», nunca un «—» suelto.
    expect(texto).toContain("Avance:—");
    expect(texto).toContain("Vence:—");
    expect(texto).toContain("53 %");
  });

  it("con `puede.gestionar`: «Añadir hallazgos», «Editar», «Registrar hallazgo en este plan» y «Sacar»", () => {
    const encabezado = sinEtiquetas(renderToStaticMarkup(<EncabezadoDelPlan plan={detalle()} />));
    for (const boton of ["Añadir hallazgos", "Editar", "Registrar hallazgo en este plan", "Excel para el ente"]) expect(encabezado).toContain(boton);
    const html = renderToStaticMarkup(<EncabezadoDelPlan plan={detalle()} />);
    expect(html).toContain('href="/mejoramiento/nuevo?plan=2"');
    expect(html).toContain('href="/mejoramiento/planes/2/anadir"');
    expect(sinEtiquetas(renderToStaticMarkup(<HallazgosDelPlan plan={detalle()} contexto={CONTEXTO} sacar={accion} />))).toContain("Sacar");
  });

  it("sin `puede.gestionar` no hay «Añadir hallazgos», «Editar», «Registrar hallazgo en este plan» ni «Sacar»", () => {
    const plan = detalle({ puede: { gestionar: false, verTodo: true, responder: false } });
    const encabezado = sinEtiquetas(renderToStaticMarkup(<EncabezadoDelPlan plan={plan} />));
    for (const boton of ["Añadir hallazgos", "Editar", "Registrar hallazgo en este plan"]) expect(encabezado).not.toContain(boton);
    expect(encabezado).toContain("Excel para el ente");
    const hallazgos = sinEtiquetas(renderToStaticMarkup(<HallazgosDelPlan plan={plan} contexto={CONTEXTO} sacar={accion} />));
    expect(hallazgos).not.toContain("Sacar");
  });

  it("sin `puede.verTodo` no hay «Excel para el ente»", () => {
    const plan = detalle({ puede: { gestionar: false, verTodo: false, responder: false } });
    const html = renderToStaticMarkup(<EncabezadoDelPlan plan={plan} />);
    expect(sinEtiquetas(html)).not.toContain("Excel para el ente");
    expect(html).not.toContain("/excel");
  });

  it("los datos y el historial, con quién y qué en texto", () => {
    const datos = sinEtiquetas(renderToStaticMarkup(<DatosDelPlan plan={detalle()} />));
    expect(datos).toContain("11 de diciembre de 2026");
    expect(datos).toContain("Institucional · Fortalecer la sostenibilidad financiera");
    expect(datos).toContain("Subsanar las observaciones");
    const historial = sinEtiquetas(renderToStaticMarkup(<HistorialDelPlan eventos={detalle().historial} zona="America/Bogota" />));
    expect(historial).toContain(`${fechaDeDia("2026-11-18")} · Control Interno de ejemplo añadió HZ-2026-011`);
    expect(historial).toContain("María Fernanda Perdomo creó el plan");
  });

  it("un plan sin hallazgos ofrece añadirlos a quien gestiona y a los demás no", () => {
    const vacio = detalle({ grupos: [], hallazgos: 0, abiertos: 0, conAlgoVencido: 0, avance: null, estado: "sin_hallazgos" });
    expect(sinEtiquetas(renderToStaticMarkup(<HallazgosDelPlan plan={vacio} contexto={CONTEXTO} sacar={accion} />))).toContain("Añadir hallazgos");
    const ajeno = { ...vacio, puede: { gestionar: false, verTodo: true, responder: false } };
    expect(sinEtiquetas(renderToStaticMarkup(<HallazgosDelPlan plan={ajeno} contexto={CONTEXTO} />))).not.toContain("Añadir hallazgos");
  });
});

describe("SelectorDeHallazgos", () => {
  const candidatos = [{ id: 30, codigo: "HZ-2026-030", titulo: "Entradas de almacén con retraso", proceso: "Almacén", origen: "pamec" as const, estado: "En ejecución" }];

  it("pinta una casilla por candidato y, si el plan propone su objetivo, la casilla del objetivo marcada", () => {
    const html = renderToStaticMarkup(<SelectorDeHallazgos planId={2} candidatos={candidatos} proponeObjetivo accion={accion} />);
    expect(html).toContain('name="hallazgoIds" value="30"');
    expect(sinEtiquetas(html)).toContain("Poner el objetivo del plan a los que no tienen");
    expect(html).toMatch(/<input[^>]*name="conObjetivo"[^>]*checked=""[^>]*value="si"/);
    expect(html).toContain('name="volverAlPlan" value="si"');
  });

  it("sin objetivo activo que proponer, no ofrece la casilla", () => {
    const html = renderToStaticMarkup(<SelectorDeHallazgos planId={2} candidatos={candidatos} proponeObjetivo={false} accion={accion} />);
    expect(html).not.toContain('name="conObjetivo"');
  });
});

describe("los formularios de la clasificación: las casillas", () => {
  const formulario = (campos: Array<[string, string]>) => {
    const f = new FormData();
    for (const [k, v] of campos) f.append(k, v);
    return f;
  };

  it("una sola casilla marcada llega como lista; la del objetivo desmarcada, como «no» (el dominio, por omisión, diría «sí»)", () => {
    expect(parsearFormulario(formulario([["planId", "2"], ["hallazgoIds", "30"]]), EsquemaFormularioPonerEnPlan)).toEqual({
      planId: 2,
      hallazgoIds: [30],
      conObjetivo: false,
      volverAlPlan: false,
    });
    expect(
      parsearFormulario(
        formulario([["planId", "2"], ["hallazgoIds", "30"], ["hallazgoIds", "31"], ["conObjetivo", "si"], ["volverAlPlan", "si"]]),
        EsquemaFormularioPonerEnPlan,
      ),
    ).toEqual({ planId: 2, hallazgoIds: [30, 31], conObjetivo: true, volverAlPlan: true });
  });

  it("sin ninguna casilla, «Elija al menos un hallazgo»; un id que no es número, rechazado", () => {
    expect(() => parsearFormulario(formulario([["planId", "2"]]), EsquemaFormularioPonerEnPlan)).toThrow("Elija al menos un hallazgo");
    expect(() => parsearFormulario(formulario([["planId", "2"], ["hallazgoIds", "x"]]), EsquemaFormularioPonerEnPlan)).toThrow();
  });

  it("cambiar de plan: la casilla del objetivo desmarcada también llega como «no»", () => {
    const d = parsearFormulario(
      formulario([["hallazgoId", "19"], ["planId", "3"], ["motivo", "Corresponde a otra auditoría"]]),
      EsquemaFormularioCambiarDePlan,
    );
    expect(d).toEqual({ hallazgoId: 19, planId: 3, motivo: "Corresponde a otra auditoría", conObjetivo: false });
  });
});

describe("SeccionClasificacion", () => {
  const acciones = { poner: accion, cambiar: accion, sacar: accion, objetivo: accion };
  const planes = [{ id: 2, codigo: "PM-2026-02", nombre: "Auditoría de cumplimiento", proponeObjetivo: true }];

  it("sin `puedeClasificar` no pinta botones; con plan y enlace, el código lleva a su página", () => {
    const html = renderToStaticMarkup(
      <SeccionClasificacion
        hallazgoId={19}
        codigo="HZ-2026-019"
        cuenta
        clasificacion={{ plan: { id: 2, codigo: "PM-2026-02", nombre: "Auditoría de cumplimiento", enlace: true }, objetivo: "Fortalecer la sostenibilidad", objetivoId: 3, puedeClasificar: false }}
        acciones={acciones}
      />,
    );
    expect(html).not.toContain("<button");
    expect(html).toContain('href="/mejoramiento/planes/2"');
    expect(sinEtiquetas(html)).toContain("Fortalecer la sostenibilidad");
  });

  it("quien ve el hallazgo solo por su actividad lee el código y el nombre del plan, sin enlace", () => {
    const html = renderToStaticMarkup(
      <SeccionClasificacion
        hallazgoId={19}
        codigo="HZ-2026-019"
        cuenta
        clasificacion={{ plan: { id: 2, codigo: "PM-2026-02", nombre: "Auditoría de cumplimiento", enlace: false }, objetivo: null, objetivoId: null, puedeClasificar: false }}
      />,
    );
    expect(html).not.toContain("/mejoramiento/planes/");
    expect(sinEtiquetas(html)).toContain("PM-2026-02 Auditoría de cumplimiento");
    expect(sinEtiquetas(html)).toContain("Sin objetivo");
  });

  it("con `puedeClasificar`: sin plan, «Poner en un plan»; con plan, «Cambiar de plan» y «Sacar»; y el objetivo", () => {
    const sinPlan = sinEtiquetas(
      renderToStaticMarkup(
        <SeccionClasificacion
          hallazgoId={19}
          codigo="HZ-2026-019"
          cuenta
          clasificacion={{ plan: null, objetivo: null, objetivoId: null, puedeClasificar: true }}
          planes={planes}
          acciones={acciones}
        />,
      ),
    );
    expect(sinPlan).toContain("Sin plan");
    expect(sinPlan).toContain("Poner en un plan");
    expect(sinPlan).toContain("Poner un objetivo");
    expect(sinPlan).not.toContain("Cambiar de plan");

    const conPlan = sinEtiquetas(
      renderToStaticMarkup(
        <SeccionClasificacion
          hallazgoId={19}
          codigo="HZ-2026-019"
          cuenta
          clasificacion={{ plan: { id: 1, codigo: "PM-2026-01", nombre: "Otro plan", enlace: true }, objetivo: "Uno", objetivoId: 3, puedeClasificar: true }}
          planes={planes}
          acciones={acciones}
        />,
      ),
    );
    expect(conPlan).toContain("Cambiar de plan");
    expect(conPlan).toContain("Sacar");
    expect(conPlan).toContain("Cambiar el objetivo");
    expect(conPlan).not.toContain("Poner en un plan");
  });

  it("un hallazgo anulado o rechazado no se pone en un plan ni se cambia, pero sí sale", () => {
    const enPlan = sinEtiquetas(
      renderToStaticMarkup(
        <SeccionClasificacion
          hallazgoId={19}
          codigo="HZ-2026-019"
          cuenta={false}
          clasificacion={{ plan: { id: 1, codigo: "PM-2026-01", nombre: "Otro plan", enlace: true }, objetivo: null, objetivoId: null, puedeClasificar: true }}
          planes={planes}
          acciones={acciones}
        />,
      ),
    );
    expect(enPlan).not.toContain("Cambiar de plan");
    expect(enPlan).toContain("Sacar");
    const suelto = sinEtiquetas(
      renderToStaticMarkup(
        <SeccionClasificacion
          hallazgoId={19}
          codigo="HZ-2026-019"
          cuenta={false}
          clasificacion={{ plan: null, objetivo: null, objetivoId: null, puedeClasificar: true }}
          planes={planes}
          acciones={acciones}
        />,
      ),
    );
    expect(suelto).not.toContain("Poner en un plan");
  });
});

describe("la respuesta al ente y los archivos del plan (Tarea 5, anexo §3.7 y §3.8)", () => {
  const respuesta = (extra: Partial<RespuestaDelPlan> = {}): RespuestaDelPlan => ({
    listos: [
      { id: 19, codigo: "HZ-2026-019", fechaLimiteEnte: "2026-12-11" },
      { id: 22, codigo: "HZ-2026-022", fechaLimiteEnte: "2026-12-30" },
    ],
    faltan: [
      { id: 20, codigo: "HZ-2026-020", estado: "En revisión" },
      { id: 21, codigo: "HZ-2026-021", estado: "En aprobación" },
    ],
    respuestas: [],
    vence: "2026-12-11",
    desde: "2026-11-17",
    oficios: [{ id: 70, nombre: "Oficio de respuesta.pdf" }],
    ...extra,
  });
  const pintar = (r: RespuestaDelPlan, x: { responder?: boolean; cambio?: boolean } = {}) =>
    renderToStaticMarkup(
      <RespuestaAlEnte planId={2} respuesta={r} responder={x.responder ?? true} hoy="2026-11-18" contexto={CONTEXTO} cambio={x.cambio ?? false} accion={accion} />,
    );

  it("dice cuándo vence, cuáles están listos y a cuáles les falta su plan de acción, con su estado; el formulario envía lo que mostró", () => {
    const html = pintar(respuesta());
    const texto = sinEtiquetas(html);
    expect(texto).toContain("Vence el 11 de diciembre de 2026 · quedan 16 días hábiles.");
    expect(texto).toContain("Listos para responder (2): HZ-2026-019 y HZ-2026-022.");
    expect(texto).toContain("Les falta aprobar su plan de acción (2): HZ-2026-020 (En revisión) y HZ-2026-021 (En aprobación).");
    expect(html).toContain('id="respuesta-al-ente"');
    expect(html).toContain('href="/mejoramiento/19"');
    expect(html.match(/name="vistos"/g)).toHaveLength(2);
    expect(html).toContain('name="vistos" value="19"');
    expect(html).toContain('name="vistos" value="22"');
    expect(html).toMatch(/type="radio"[^>]*name="oficioId" checked="" value="70"/);
    expect(html).toMatch(/type="date"[^>]*min="2026-11-17"[^>]*max="2026-11-18"/);
    expect(texto).toContain("Registrar la respuesta");
    expect(texto).not.toContain("Cambiaron los hallazgos listos");
  });

  it("sin oficio, enlaza «Archivos del plan»; sin el permiso, sin formulario; con `cambio`, el aviso de revisar la lista", () => {
    const sinOficio = pintar(respuesta({ oficios: [] }));
    expect(sinEtiquetas(sinOficio)).toContain("Adjunte el oficio de respuesta: súbalo en «Archivos del plan».");
    expect(sinOficio).toContain('href="#archivos-del-plan"');
    expect(sinOficio).not.toContain('name="vistos"');
    expect(pintar(respuesta(), { responder: false })).not.toContain("<form");
    const conAviso = pintar(respuesta(), { cambio: true });
    expect(conAviso).toMatch(/role="alert"[^>]*>Cambiaron los hallazgos listos para responder: revise la lista</);
    // Con la lista nueva vacía no hay formulario, pero el aviso sigue (y su pieza de cliente, que no pinta nada).
    const vaciaConAviso = pintar(respuesta({ listos: [], vence: null, desde: null }), { cambio: true });
    expect(vaciaConAviso).toMatch(/role="alert"[^>]*>Cambiaron los hallazgos listos para responder: revise la lista</);
    expect(vaciaConAviso).not.toContain("<form");
  });

  it("las respuestas registradas, con su oficio y sus hallazgos; sin listos, sin formulario", () => {
    const html = pintar(
      respuesta({
        listos: [],
        vence: null,
        desde: null,
        respuestas: [{ id: 5, enviadaEn: "2026-11-18", por: "María Fernanda Perdomo", oficio: { id: 70, nombre: "Oficio de respuesta.pdf" }, hallazgos: ["HZ-2026-019", "HZ-2026-022"] }],
      }),
    );
    const texto = sinEtiquetas(html);
    expect(texto).toContain("Ningún hallazgo del plan espera respuesta.");
    expect(texto).toContain(`Enviada el ${fechaDeDia("2026-11-18")} · la registró María Fernanda Perdomo.`);
    expect(texto).toContain("Incluyó HZ-2026-019 y HZ-2026-022.");
    expect(html).toContain('href="/mejoramiento/archivos/70/Oficio%20de%20respuesta.pdf"');
    expect(html).not.toContain("<form");
    expect(texto).not.toContain("Vence el");
  });

  it("los archivos del plan: cada uno, una descarga; la zona de carga a quien puede subir", () => {
    const archivos = { lista: [{ id: 70, nombre: "Informe final de auditoría.pdf", rol: "evidencia", tamano: 1800, mime: "application/pdf" }], quitables: [70], puedeSubir: true };
    const html = renderToStaticMarkup(<ArchivosDelPlan planId={2} archivos={archivos} />);
    expect(html).toContain('id="archivos-del-plan"');
    expect(html).toContain('href="/mejoramiento/archivos/70/Informe%20final%20de%20auditor%C3%ADa.pdf"');
    expect(sinEtiquetas(html)).toContain("Quitar");
    expect(sinEtiquetas(html)).toContain("Solo los abren el Administrador del SGC, Gerencia y Control Interno");
    const sinSubir = renderToStaticMarkup(<ArchivosDelPlan planId={2} archivos={{ lista: [], quitables: [], puedeSubir: false }} />);
    expect(sinEtiquetas(sinSubir)).toContain("El plan no tiene archivos.");
    expect(sinSubir).not.toContain("25 MB");
  });

  it("en un hallazgo que está en un plan, la respuesta se registra desde el plan: con enlace a quien lo ve, sin él a los demás", () => {
    const pintarSeccion = (href: string | null) =>
      renderToStaticMarkup(
        <SeccionRespuestaAlEnte fechaLimite="2026-12-11" respuesta={null} terminado={false} oficio={null} desdeElPlan={{ codigo: "PM-2026-02", href }}>
          <form>el formulario de la 15A</form>
        </SeccionRespuestaAlEnte>,
      );
    const conEnlace = pintarSeccion("/mejoramiento/planes/2");
    expect(sinEtiquetas(conEnlace)).toContain("La respuesta se registra desde el plan PM-2026-02.");
    expect(conEnlace).toContain('href="/mejoramiento/planes/2"');
    expect(conEnlace).not.toContain("el formulario de la 15A");
    const sinEnlace = pintarSeccion(null);
    expect(sinEtiquetas(sinEnlace)).toContain("La respuesta se registra desde el plan PM-2026-02.");
    expect(sinEnlace).not.toContain("href=");
  });
});
