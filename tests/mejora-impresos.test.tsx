/**
 * Los impresos de mejoramiento (Fase 15A, Tarea 21; spec 15 §16.4 y Apéndice A.2 a A.4): el SGC-FO-AC-01 (el hallazgo completo en
 * sus siete secciones), el de 5 porqués, el de Ishikawa y el de «otro método», con el encabezado del formato y el pie. Sin base de
 * datos: los componentes reciben todo ya leído. Lo que lee la base (`encabezadoDeFormato`) se prueba en `tests/mejora-config.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CincoPorquesImpreso } from "@/componentes/mejoramiento/impresos/CincoPorquesImpreso";
import { EncabezadoDeFormato } from "@/componentes/mejoramiento/impresos/EncabezadoDeFormato";
import { IshikawaImpreso } from "@/componentes/mejoramiento/impresos/IshikawaImpreso";
import { OtroMetodoImpreso } from "@/componentes/mejoramiento/impresos/OtroMetodoImpreso";
import { RegistroImpreso } from "@/componentes/mejoramiento/impresos/RegistroImpreso";
import type { FirmaDelHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import type { DetalleDeHallazgo, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { fechaEnZona } from "@/lib/tramites/plazos";

const ZONA = "America/Bogota";
const IMPRESO_EN = new Date("2026-11-18T15:00:00Z");
const FORMATO = { codigo: "SGC-FO-AC-01", version: 3, emitidoEn: new Date("2026-02-10T05:00:00Z") };
const hz = (n: number) => `${String(n).padStart(2, "0")}`.repeat(32);

const actividad = (extra: Record<string, unknown>) => ({
  id: 21,
  orden: 1,
  descripcion: "Pedir el cambio documental",
  responsableId: 7,
  responsable: "Laura Rojas",
  responsableActivo: true,
  inicio: "2026-11-14",
  finOriginal: "2026-11-20",
  fin: "2026-11-30",
  vence: "2026-11-30",
  avance: 100,
  estado: "terminada",
  reprogramaciones: 1,
  terminadaEn: new Date("2026-11-29T15:00:00Z"),
  verificacion: "conforme",
  seAbre: true,
  gerenciaEn: null,
  verificacionNota: null,
  corregirAntesDe: null,
  evidencias: 2,
  ...extra,
});

const ronda1 = {
  id: 5,
  numero: 1,
  estadoPlan: "aprobado",
  formularAntesDe: null,
  enviadoEn: new Date("2026-11-12T15:00:00Z"),
  aprobadoEn: new Date("2026-11-13T15:00:00Z"),
  aprobadoRol: "gerencia",
  aprobadoFuera: null,
  requiereRecursos: false,
  notaRecursos: null,
  elaboroAdmin: false,
  fechaEvaluacion: null,
  cierrePrevisto: new Date("2027-02-01T15:00:00Z"),
  criterios: ["no_recurrencia"],
  criterioOtro: null,
  indicadorEficaciaId: null,
  resultado: "no_eficaz",
  similares: true,
  similaresDetalle: "También pasa en Urgencias",
  cambios: { documentos: true, riesgos: false, controles: false, descripcion: "Actualizar el procedimiento de entrega de turno" },
  analisis: [
    {
      id: 31,
      orden: 1,
      metodo: "cinco_porques",
      equipo: "Laura Rojas y el jefe de enfermería",
      observaciones: "Se revisaron los tres turnos",
      contenido: { niveles: [{ respuesta: "Nadie asignó el registro al turno de noche", evidencia: "Acta del turno" }, { respuesta: "El procedimiento no lo dice" }] },
    },
  ],
  causas: [{ id: 11, orden: 1, texto: "El procedimiento no asigna el registro al turno de noche", sinAccionPorque: null }],
  acciones: [
    {
      id: 3,
      orden: 1,
      tipo: "correctiva",
      descripcion: "Actualizar el procedimiento de entrega de turno",
      recursos: "Horas del equipo de calidad",
      indicadorCumplimiento: "Procedimiento publicado",
      meta: "100 %",
      causaIds: [11],
      avance: 100,
      actividades: [actividad({})],
    },
  ],
  ajustes: [
    {
      id: 41,
      tipo: "reprogramar",
      estado: "aprobado",
      actividadId: 21,
      causa: "La imprenta entregó tarde los formatos",
      cambio: { tipo: "reprogramar", finAntes: "2026-11-20", finNuevo: "2026-11-30" },
      responsableNuevo: null,
      pedidoPor: "Laura Rojas",
      pedidoEn: new Date("2026-11-18T15:00:00Z"),
      venceEn: null,
      decididoPor: "Gloria Gerente",
      decididoEn: new Date("2026-11-19T15:00:00Z"),
      nota: null,
      acta: null,
      puedeDecidir: false,
    },
  ],
  verificacion: { por: "Carlos Control", en: new Date("2026-12-01T15:00:00Z"), metodos: ["evidencias"], nota: "Todo en orden" },
  evaluacion: {
    resultado: "no_eficaz",
    por: "Carlos Control",
    en: new Date("2027-02-02T15:00:00Z"),
    criterios: ["no_recurrencia"],
    desde: "2026-12-01",
    hasta: "2027-02-01",
    justificacion: "El hecho se repitió en el turno de noche",
    visto: null,
  },
};

const ronda2 = {
  ...ronda1,
  id: 6,
  numero: 2,
  enviadoEn: new Date("2027-02-05T15:00:00Z"),
  aprobadoEn: new Date("2027-02-06T15:00:00Z"),
  resultado: "eficaz",
  similares: false,
  cambios: { documentos: false, riesgos: false, controles: false, descripcion: null },
  analisis: [
    {
      id: 32,
      orden: 1,
      metodo: "ishikawa",
      equipo: null,
      observaciones: null,
      contenido: {
        causas: [
          { categoria: "metodo", texto: "El turno de noche no tiene quien registre", confirmada: true, impacto: "alto", requiereAccion: true },
          { categoria: "material", texto: "Faltan formatos impresos", confirmada: false },
        ],
      },
    },
  ],
  causas: [{ id: 12, orden: 1, texto: "El turno de noche no tiene responsable del registro", sinAccionPorque: null }],
  acciones: [
    {
      ...ronda1.acciones[0],
      id: 4,
      tipo: "preventiva",
      descripcion: "Nombrar un responsable del registro por turno",
      causaIds: [12],
      actividades: [actividad({ id: 22, descripcion: "Publicar el cuadro de responsables", reprogramaciones: 0 })],
    },
  ],
  ajustes: [],
  verificacion: { por: "Carlos Control", en: new Date("2027-03-01T15:00:00Z"), metodos: ["evidencias"], nota: null },
  evaluacion: { ...ronda1.evaluacion, resultado: "eficaz", en: new Date("2027-05-02T15:00:00Z"), justificacion: "No se repitió" },
};

const detalle = (extra: Partial<DetalleDeHallazgo> = {}): DetalleDeHallazgo =>
  ({
    ve: "completo",
    id: 9,
    codigo: "HZ-2026-004",
    titulo: "Formatos de entrega de turno sin diligenciar",
    descripcion: "En la revisión de tres turnos se encontraron los formatos sin diligenciar.",
    clase: "no_conformidad",
    criticidad: "media",
    origen: "auditoria_interna",
    fuente: "Auditoría interna del 10 de noviembre",
    referenciaCaso: null,
    detectadoEn: "2026-11-10",
    procesoId: 2,
    proceso: "Hospitalización",
    requisitoClausula: "7.5.3",
    requisitoNormaId: null,
    requisitoDocumentoId: null,
    riesgo: null,
    estado: "cerrado",
    etiqueta: "Cerrado · eficaz",
    ronda: 2,
    registradoPor: "Carlos Control",
    registradoPorId: 3,
    registradoEn: new Date("2026-11-10T15:00:00Z"),
    naceDeUnReporte: false,
    reportadoPor: null,
    reporteId: null,
    cargado: false,
    cargaConfirmada: true,
    reincidenteDe: null,
    marcas: [],
    fechaLimiteEnte: null,
    respuestaAlEnte: null,
    vence: null,
    correccion: {
      requerida: true,
      descripcion: "Se diligenciaron los formatos pendientes con el turno",
      responsable: "Laura Rojas",
      implementadaEn: "2026-11-11",
      registradaEn: new Date("2026-11-11T15:00:00Z"),
      validadaPor: "Ana Admin",
      validadaEn: new Date("2026-11-11T20:00:00Z"),
    },
    decision: { accionRequerida: true, justificacion: "Hay que analizar la causa raíz", decididaEn: new Date("2026-11-11T21:00:00Z") },
    cierre: {
      resultado: "eficaz",
      cerradoEn: new Date("2027-05-03T15:00:00Z"),
      cerradoPor: "Ana Admin",
      lecciones: "Asignar el registro a cada turno evita que se pierda",
      cambiosAtendidos: null,
      anuladoMotivo: null,
    },
    rondas: [ronda1, ronda2] as unknown as RondaDeDetalle[],
    rondasAnteriores: [ronda1] as unknown as RondaDeDetalle[],
    fechas: { planFormulado: null, cierrePrevisto: null, evaluableDesde: null, reprogramaciones: { aprobadas: 0, pedidas: 0 } },
    enlaces: [],
    ocurrencias: [],
    eventos: [],
    turno: "Sin pendientes",
    loQueSigue: { paso: null, puede: false, turno: "" },
    avance: 100,
    ...extra,
  }) as DetalleDeHallazgo;

const firma = (f: Partial<FirmaDelHallazgo> & Pick<FirmaDelHallazgo, "firma" | "ronda" | "nombre" | "huella">): FirmaDelHallazgo => ({
  cargo: null,
  cuando: new Date("2026-11-12T15:00:00Z"),
  ...f,
});

const FIRMAS: FirmaDelHallazgo[] = [
  firma({ firma: "elaboro", ronda: 1, nombre: "Laura Rojas", cargo: "Jefe de enfermería", cuando: new Date("2026-11-12T15:00:00Z"), huella: hz(1) }),
  firma({ firma: "reviso", ronda: 1, nombre: "Ana Admin", cargo: "Coordinadora del SGC", cuando: new Date("2026-11-12T18:00:00Z"), huella: hz(2) }),
  firma({ firma: "aprobo", ronda: 1, nombre: "Gloria Gerente", cargo: "Gerente", cuando: new Date("2026-11-13T15:00:00Z"), huella: hz(3) }),
  firma({ firma: "verifico", ronda: 1, nombre: "Carlos Control", cargo: "Jefe de control interno", cuando: new Date("2027-02-02T15:00:00Z"), huella: hz(4) }),
  firma({ firma: "elaboro", ronda: 2, nombre: "Laura Rojas", cargo: "Jefe de enfermería", cuando: new Date("2027-02-05T15:00:00Z"), huella: hz(5) }),
  firma({ firma: "aprobo", ronda: 2, nombre: "Gloria Gerente", cargo: "Gerente", cuando: new Date("2027-02-06T15:00:00Z"), huella: hz(6) }),
  firma({ firma: "verifico", ronda: 2, nombre: "Carlos Control", cargo: "Jefe de control interno", cuando: new Date("2027-05-02T15:00:00Z"), huella: hz(7) }),
  firma({ firma: "cerro", ronda: 2, nombre: "Ana Admin", cargo: "Coordinadora del SGC", cuando: new Date("2027-05-03T15:00:00Z"), huella: hz(8) }),
];

const SEGUIMIENTOS = {
  21: [{ id: 1, fecha: "2026-11-25", realizado: "Se pidió el cambio al Admin SGC", avance: 60, barreras: "La imprenta no entregó", quien: "Laura Rojas", creadoEn: new Date("2026-11-25T15:00:00Z") }],
  22: [{ id: 2, fecha: "2027-02-20", realizado: "Se publicó el cuadro de responsables", avance: 100, barreras: null, quien: "Laura Rojas", creadoEn: new Date("2027-02-20T15:00:00Z") }],
};

const registro = (extra: Partial<Parameters<typeof RegistroImpreso>[0]> = {}) =>
  renderToStaticMarkup(
    <RegistroImpreso
      hallazgo={detalle()}
      entidad="Entidad Zeta de Prueba"
      logo={null}
      formato={FORMATO}
      firmas={FIRMAS}
      seguimientos={SEGUIMIENTOS}
      lideres={["Laura Rojas"]}
      indicadores={{}}
      evidenciaDeCorreccion={["formatos-diligenciados.pdf"]}
      impresoEn={IMPRESO_EN}
      impresoPor="Ana Admin"
      zona={ZONA}
      {...extra}
    />,
  );

const SECCIONES = [
  "1. Identificación",
  "2. Corrección o contención",
  "3. Análisis de causa raíz",
  "4. Plan de acción",
  "5. Seguimiento",
  "6. Verificación de eficacia",
  "7. Cierre",
];

/** El texto del HTML sin etiquetas, con los espacios juntos: lo que se lee en la hoja. */
const leer = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

describe("RegistroImpreso (SGC-FO-AC-01)", () => {
  it("pinta las siete secciones con los títulos del SGC-FO-AC-01, en orden", () => {
    const html = registro();
    const posiciones = SECCIONES.map((t) => html.indexOf(`>${t}<`));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    // Cada sección es un bloque con su título (un h2: el h1 es el de la página).
    expect(html.match(/<h2[^>]*>/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it("pinta cada ronda: su análisis, su plan, sus seguimientos y su eficacia", () => {
    const texto = leer(registro());
    expect(texto).toContain("Ronda 1");
    expect(texto).toContain("Ronda 2");
    expect(texto).toContain("Nadie asignó el registro al turno de noche");
    expect(texto).toContain("El turno de noche no tiene quien registre");
    expect(texto).toContain("Actualizar el procedimiento de entrega de turno");
    expect(texto).toContain("Nombrar un responsable del registro por turno");
    expect(texto).toContain("Se pidió el cambio al Admin SGC");
    expect(texto).toContain("La imprenta no entregó");
    expect(texto).toContain("Se publicó el cuadro de responsables");
    expect(texto).toContain("El hecho se repitió en el turno de noche");
    expect(texto).toContain("No se repitió");
    // Lo que una acción declara: recursos, indicador de cumplimiento y meta; las fechas original y vigente.
    expect(texto).toContain("Horas del equipo de calidad");
    expect(texto).toContain("Procedimiento publicado");
    expect(texto).toContain(fechaDeDia("2026-11-20"));
    expect(texto).toContain(fechaDeDia("2026-11-30"));
  });

  it("pinta los ajustes del plan con su causa y su decisión", () => {
    const texto = leer(registro());
    expect(texto).toContain(`Reprogramar la actividad A1.1 del ${fechaDeDia("2026-11-20")} al ${fechaDeDia("2026-11-30")}.`);
    expect(texto).toContain("La imprenta entregó tarde los formatos");
    expect(texto).toContain("Gloria Gerente");
  });

  it("pinta cada firma con nombre, cargo, fecha y los 12 primeros caracteres de su huella", () => {
    const texto = leer(registro());
    for (const f of FIRMAS) {
      expect(texto).toContain(f.nombre);
      expect(texto).toContain(f.cargo!);
      expect(texto).toContain(fechaYHora(f.cuando, ZONA).replace(/\s+/g, " "));
      expect(texto).toContain(f.huella.slice(0, 12));
      // La huella corta: nunca la entera.
      expect(texto).not.toContain(f.huella.slice(0, 13));
    }
    for (const rol of ["Elaboró", "Revisó", "Aprobó", "Verificó", "Cerró"]) expect(texto).toContain(rol);
  });

  it("una ronda que se devolvió imprime las firmas de su envío vigente, no las del envío devuelto", () => {
    const devuelto = firma({ firma: "elaboro", ronda: 1, nombre: "Pedro Previo", cargo: "Auxiliar", huella: hz(9), cuando: new Date("2026-11-11T15:00:00Z") });
    const reviso = firma({ firma: "reviso", ronda: 1, nombre: "Rita Revisora", cargo: "Auxiliar", huella: hz(10), cuando: new Date("2026-11-11T16:00:00Z") });
    const texto = leer(registro({ firmas: [devuelto, reviso, ...FIRMAS] }));
    expect(texto).not.toContain("Pedro Previo");
    expect(texto).not.toContain("Rita Revisora");
  });

  it("el pie dice «Impreso el … por …»", () => {
    expect(leer(registro())).toContain(`Impreso el ${fechaYHora(IMPRESO_EN, ZONA).replace(/\s+/g, " ")} por Ana Admin`);
  });

  it("lleva el encabezado del formato elegido: código, versión y fecha de emisión", () => {
    const texto = leer(registro());
    expect(texto).toContain("Entidad Zeta de Prueba");
    expect(texto).toContain("Código SGC-FO-AC-01");
    expect(texto).toContain("Versión 3");
    expect(texto).toContain(`Fecha de emisión ${fechaDeDia(fechaEnZona(FORMATO.emitidoEn, ZONA))}`);
  });

  it("un hallazgo cargado lleva «Cargado: tramitado antes fuera de la plataforma» y sus pasos en papel sin huella", () => {
    const papel = {
      ...ronda1,
      numero: 1,
      resultado: null,
      evaluacion: null,
      verificacion: null,
      ajustes: [],
      aprobadoFuera: "Marta Ríos, Coordinadora del SGC",
      aprobadoEn: new Date("2025-11-04T05:00:00Z"),
      aprobadoRol: "admin_sgc",
      enviadoEn: null,
      analisis: [{ id: 33, orden: 1, metodo: "cinco_porques", equipo: null, observaciones: null, contenido: null }],
    } as unknown as RondaDeDetalle;
    const cargado = detalle({
      cargado: true,
      estado: "en_ejecucion",
      etiqueta: "En ejecución",
      ronda: 1,
      rondas: [papel],
      rondasAnteriores: [],
      cierre: { resultado: null, cerradoEn: null, cerradoPor: null, lecciones: null, cambiosAtendidos: null, anuladoMotivo: null },
      eventos: [
        { id: 1, tipo: "registrar", ronda: 1, detalle: {}, quien: "Ana Admin", cuando: new Date("2025-10-08T05:00:00Z"), fuera: true, personas: null },
        { id: 2, tipo: "corregir", ronda: 1, detalle: {}, quien: "Ana Admin", cuando: new Date("2025-10-15T05:00:00Z"), fuera: true, personas: null },
        { id: 3, tipo: "aprobar_plan", ronda: 1, detalle: { huella: hz(12), aprobadoPor: "Marta Ríos, Coordinadora del SGC" }, quien: "Ana Admin", cuando: new Date("2025-11-04T05:00:00Z"), fuera: true, personas: null },
      ],
    });
    const texto = leer(registro({ hallazgo: cargado, firmas: [], seguimientos: {} }));
    expect(texto).toContain("Cargado: tramitado antes fuera de la plataforma");
    expect(texto).toContain("Marta Ríos, Coordinadora del SGC");
    expect(texto).toContain(fechaDeDia("2025-11-04"));
    expect(texto).toContain(fechaDeDia("2025-10-08"));
    expect(texto).toContain(fechaDeDia("2025-10-15"));
    expect(texto.split("Hecho fuera de la plataforma").length - 1).toBeGreaterThanOrEqual(3);
    // La aprobación en papel no es una firma del sistema: su huella del plan congelado no sale como firma.
    expect(texto).not.toContain(hz(12).slice(0, 12));
    // El análisis cargado sin contenido: una línea neutra, sin un diagrama vacío.
    expect(texto).toContain("El contenido de este análisis está en el formato firmado de la carga");
    expect(texto).not.toContain("No se pudo leer este análisis");
    // Sin cargar, la marca no sale.
    expect(leer(registro())).not.toContain("Cargado: tramitado antes fuera de la plataforma");
  });

  it("todas las secciones salen aunque la etapa no haya llegado, con un texto neutro", () => {
    const nuevo = detalle({
      estado: "por_aceptar",
      etiqueta: "Por aceptar",
      ronda: 1,
      correccion: { requerida: null, descripcion: null, responsable: null, implementadaEn: null, registradaEn: null, validadaPor: null, validadaEn: null },
      decision: { accionRequerida: null, justificacion: null, decididaEn: null },
      cierre: { resultado: null, cerradoEn: null, cerradoPor: null, lecciones: null, cambiosAtendidos: null, anuladoMotivo: null },
      rondas: [{ ...ronda1, estadoPlan: "borrador", analisis: [], causas: [], acciones: [], ajustes: [], criterios: null, similares: null, cambios: null, verificacion: null, evaluacion: null, resultado: null }] as unknown as RondaDeDetalle[],
      rondasAnteriores: [],
    });
    const html = registro({ hallazgo: nuevo, firmas: [], seguimientos: {} });
    for (const t of SECCIONES) expect(html).toContain(`>${t}<`);
    expect(leer(html)).toContain("Sin registrar todavía");
  });
});

describe("EncabezadoDeFormato", () => {
  it("con el formato elegido pinta «Código», «Versión» y «Fecha de emisión»", () => {
    const texto = leer(renderToStaticMarkup(<EncabezadoDeFormato entidad="Entidad Zeta" logo={null} titulo="Registro" formato={FORMATO} zona={ZONA} />));
    expect(texto).toContain("Entidad Zeta");
    expect(texto).toContain("Código SGC-FO-AC-01");
    expect(texto).toContain("Versión 3");
    expect(texto).toContain("Fecha de emisión");
  });

  it("sin formato no pinta ninguno de los tres", () => {
    const texto = leer(renderToStaticMarkup(<EncabezadoDeFormato entidad="Entidad Zeta" logo={null} titulo="Registro" formato={null} zona={ZONA} />));
    expect(texto).toContain("Entidad Zeta");
    expect(texto).toContain("Registro");
    for (const t of ["Código", "Versión", "Fecha de emisión"]) expect(texto).not.toContain(t);
  });
});

describe("los formatos del análisis", () => {
  const comunes = {
    hallazgo: detalle(),
    lideres: ["Laura Rojas"],
    firmas: FIRMAS,
    entidad: "Entidad Zeta de Prueba",
    logo: null,
    impresoEn: IMPRESO_EN,
    impresoPor: "Ana Admin",
    zona: ZONA,
  };
  const r1 = ronda1 as unknown as RondaDeDetalle;
  const r2 = ronda2 as unknown as RondaDeDetalle;

  it("el de 5 porqués: la información general, los niveles con su evidencia, la conclusión y las firmas de su ronda", () => {
    const texto = leer(renderToStaticMarkup(<CincoPorquesImpreso {...comunes} ronda={r1} analisis={r1.analisis[0]} formato={{ ...FORMATO, codigo: "SGC-FO-AC-02" }} />));
    expect(texto).toContain("Código SGC-FO-AC-02");
    expect(texto).toContain("HZ-2026-004");
    expect(texto).toContain("Hospitalización");
    expect(texto).toContain("Laura Rojas y el jefe de enfermería");
    expect(texto).toContain("Nadie asignó el registro al turno de noche");
    expect(texto).toContain("Acta del turno");
    expect(texto).toContain("El procedimiento no lo dice");
    expect(texto).toContain("El procedimiento no asigna el registro al turno de noche");
    expect(texto).toContain("También pasa en Urgencias");
    expect(texto).toContain("Actualizar el procedimiento de entrega de turno");
    expect(texto).toContain("Se revisaron los tres turnos");
    for (const rol of ["Realizó", "Validó", "Visto bueno"]) expect(texto).toContain(rol);
    expect(texto).toContain(hz(1).slice(0, 12));
    // Las de la otra ronda no.
    expect(texto).not.toContain(hz(5).slice(0, 12));
    expect(texto).toContain(`Impreso el ${fechaYHora(IMPRESO_EN, ZONA).replace(/\s+/g, " ")} por Ana Admin`);
  });

  it("el de Ishikawa: las seis categorías, la marca de confirmada y la priorización de las confirmadas", () => {
    const texto = leer(renderToStaticMarkup(<IshikawaImpreso {...comunes} ronda={r2} analisis={r2.analisis[0]} formato={{ ...FORMATO, codigo: "SGC-FO-AC-03" }} />));
    expect(texto).toContain("Código SGC-FO-AC-03");
    for (const c of ["Mano de obra", "Método", "Máquina o equipo", "Material", "Medición", "Medio ambiente"]) expect(texto).toContain(c);
    expect(texto).toContain("El turno de noche no tiene quien registre");
    expect(texto).toContain("Faltan formatos impresos");
    expect(texto).toContain("Confirmada");
    expect(texto).toContain("Posible");
    expect(texto).toContain("Alto");
    expect(texto).toContain("El turno de noche no tiene responsable del registro");
  });

  it("un análisis cargado sin contenido dice dónde está, sin niveles ni diagrama vacíos", () => {
    const vacio = { ...r1.analisis[0], contenido: null };
    const porques = leer(renderToStaticMarkup(<CincoPorquesImpreso {...comunes} hallazgo={detalle({ cargado: true })} ronda={r1} analisis={vacio} formato={null} />));
    expect(porques).toContain("El contenido de este análisis está en el formato firmado de la carga");
    expect(porques).not.toContain("Por qué");
    const ishikawa = leer(
      renderToStaticMarkup(<IshikawaImpreso {...comunes} hallazgo={detalle({ cargado: true })} ronda={r2} analisis={{ ...r2.analisis[0], contenido: null }} formato={null} />),
    );
    expect(ishikawa).toContain("El contenido de este análisis está en el formato firmado de la carga");
    expect(ishikawa).not.toContain("Mano de obra");
  });

  it("el de otro método no lleva código de formato", () => {
    const otro = { id: 34, orden: 2, metodo: "otro", equipo: null, observaciones: null, contenido: { nombre: "Lluvia de ideas", descripcion: "Se reunió el equipo del turno" } };
    const html = renderToStaticMarkup(<OtroMetodoImpreso {...comunes} ronda={r1} analisis={otro} />);
    const texto = leer(html);
    expect(texto).toContain("Lluvia de ideas");
    expect(texto).toContain("Se reunió el equipo del turno");
    for (const t of ["Código", "Versión", "Fecha de emisión", "SGC-FO"]) expect(texto).not.toContain(t);
  });
});
