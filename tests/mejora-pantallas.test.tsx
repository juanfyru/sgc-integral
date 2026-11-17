/**
 * Las pantallas de «Mejoramiento» de la 15A que no tocan la base (spec 15 §16.1 y §16.2, maquetas 1 a 3): la lista, el
 * recorrido, el formulario de registro y «Lo que sigue». Con datos de mentira.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { SeccionIdentificacion } from "@/componentes/mejoramiento/SeccionIdentificacion";
import { resolverPanelDeParecidos } from "@/lib/mejoramiento/parecidos-panel";
import { FormularioHallazgo } from "@/componentes/mejoramiento/FormularioHallazgo";
import { ListaDeHallazgos } from "@/componentes/mejoramiento/ListaDeHallazgos";
import { LoQueSigue } from "@/componentes/mejoramiento/LoQueSigue";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { PasoAceptar } from "@/componentes/mejoramiento/pasos/PasoAceptar";
import { PasoArbitrar } from "@/componentes/mejoramiento/pasos/PasoArbitrar";
import { PasoCorregir } from "@/componentes/mejoramiento/pasos/PasoCorregir";
import { PasoDecidir } from "@/componentes/mejoramiento/pasos/PasoDecidir";
import { PasoTrasRechazo } from "@/componentes/mejoramiento/pasos/PasoTrasRechazo";
import { PasoValidar } from "@/componentes/mejoramiento/pasos/PasoValidar";
import { SeccionCorreccion } from "@/componentes/mejoramiento/SeccionCorreccion";
import { Recorrido } from "@/componentes/mejoramiento/Recorrido";
import type { FilaDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { SIN_AJUSTES } from "@/lib/dias-habiles";
import { fraseDeLoQueSigue } from "@/db/consultas/mejoramiento/lectura";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { filtroDeConsulta } from "@/lib/mejoramiento/filtro";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";

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
  it("hoy solo ofrece «Hallazgos», a quien los ve; las demás llegan en las tareas 14 y 18", () => {
    expect(pestanasVisibles({ rol: "consulta" }, { veHallazgos: true })).toEqual(["hallazgos"]);
    expect(pestanasVisibles({ rol: "consulta" }, { veHallazgos: false })).toEqual([]);
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
