/**
 * Configuración del módulo de mejoramiento (spec 15 §13): plazos en días hábiles, recordatorios, formatos
 * y el calendario de la entidad. Los valores viven en `configuracion` (claves `mej_*`) y en `dias_no_habiles`.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { festivosDeColombia, type AjustesDeCalendario } from "@/lib/dias-habiles";
import { EsquemaConfigMejora, EsquemaDiaDeCalendario } from "@/lib/esquemas/mejoramiento";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";

export type ConfigMejora = {
  plazos: {
    clasificar: number; aceptar: number; decision: number; correccion: number; formular: number;
    reenviar: number; revisar: number; aprobar: number; verificar: number; evaluar: number;
  };
  recordatorioAltaDias: number;
  recordatorioDias: number;
  formatos: { registro: number | null; porques: number | null; ishikawa: number | null };
};

export const CONFIG_MEJORA_DEFECTO: ConfigMejora = {
  plazos: {
    clasificar: 3, aceptar: 3, decision: 3, correccion: 3, formular: 10,
    reenviar: 5, revisar: 3, aprobar: 3, verificar: 5, evaluar: 5,
  },
  recordatorioAltaDias: 15,
  recordatorioDias: 30,
  formatos: { registro: null, porques: null, ishikawa: null },
};

type CampoNumerico = {
  clave: string;
  minimo: number;
  maximo: number;
  leer: (c: ConfigMejora) => number;
  poner: (c: ConfigMejora, n: number) => void;
};

const plazoDe = (paso: keyof ConfigMejora["plazos"], clave: string): CampoNumerico => ({
  clave, minimo: 1, maximo: 60,
  leer: (c) => c.plazos[paso],
  poner: (c, n) => { c.plazos[paso] = n; },
});

export const CAMPOS_MEJORA: readonly CampoNumerico[] = [
  plazoDe("clasificar", "mej_plazo_clasificar_dias"),
  plazoDe("aceptar", "mej_plazo_aceptar_dias"),
  plazoDe("decision", "mej_plazo_decision_dias"),
  plazoDe("correccion", "mej_plazo_correccion_dias"),
  plazoDe("formular", "mej_plazo_formular_dias"),
  plazoDe("reenviar", "mej_plazo_reenviar_dias"),
  plazoDe("revisar", "mej_plazo_revisar_dias"),
  plazoDe("aprobar", "mej_plazo_aprobar_dias"),
  plazoDe("verificar", "mej_plazo_verificar_dias"),
  plazoDe("evaluar", "mej_plazo_evaluar_dias"),
  { clave: "mej_recordatorio_alta_dias", minimo: 1, maximo: 365, leer: (c) => c.recordatorioAltaDias, poner: (c, n) => { c.recordatorioAltaDias = n; } },
  { clave: "mej_recordatorio_dias", minimo: 1, maximo: 365, leer: (c) => c.recordatorioDias, poner: (c, n) => { c.recordatorioDias = n; } },
];

export const CAMPOS_FORMATO = [
  { campo: "registro", clave: "mej_formato_registro_documento_id" },
  { campo: "porques", clave: "mej_formato_porques_documento_id" },
  { campo: "ishikawa", clave: "mej_formato_ishikawa_documento_id" },
] as const;

type Opciones = { sql?: Cliente };

function copiaDeLoDefecto(): ConfigMejora {
  return { ...CONFIG_MEJORA_DEFECTO, plazos: { ...CONFIG_MEJORA_DEFECTO.plazos }, formatos: { ...CONFIG_MEJORA_DEFECTO.formatos } };
}

/** Un valor ausente, que no es un entero o que sale de su rango cae al de omisión. */
export async function obtenerConfigMejora(opciones?: Opciones): Promise<ConfigMejora> {
  const sql = opciones?.sql ?? obtenerSql();
  const claves = [...CAMPOS_MEJORA.map((c) => c.clave), ...CAMPOS_FORMATO.map((c) => c.clave)];
  const filas = await sql`SELECT clave, valor FROM configuracion WHERE clave = ANY(${claves})`;
  const valores = new Map(filas.map((f) => [f.clave as string, String(f.valor).trim()]));
  const resultado = copiaDeLoDefecto();
  for (const c of CAMPOS_MEJORA) {
    const crudo = valores.get(c.clave);
    if (crudo === undefined || !/^\d{1,6}$/.test(crudo)) continue;
    const n = Number(crudo);
    if (n >= c.minimo && n <= c.maximo) c.poner(resultado, n);
  }
  for (const f of CAMPOS_FORMATO) {
    const crudo = valores.get(f.clave);
    resultado.formatos[f.campo] = crudo && /^\d{1,15}$/.test(crudo) && Number(crudo) > 0 ? Number(crudo) : null;
  }
  return resultado;
}

function exigirGestionar(sesion: SesionFlujo): void {
  if (!puede(sesion, "mejora.gestionar")) throw new ErrorPermiso();
}

export async function guardarConfigMejora(sesion: SesionFlujo, datos: ConfigMejora, opciones?: OpcionesFlujo): Promise<void> {
  exigirGestionar(sesion);
  const leido = EsquemaConfigMejora.safeParse(datos);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const nuevos = leido.data as ConfigMejora;
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const actuales = await obtenerConfigMejora({ sql: tx });
    const cambios: Record<string, { antes: string; despues: string }> = {};
    const guardar = async (clave: string, antes: string, despues: string) => {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${despues})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      if (antes !== despues) cambios[clave] = { antes, despues };
    };
    for (const c of CAMPOS_MEJORA) await guardar(c.clave, String(c.leer(actuales)), String(c.leer(nuevos)));
    for (const f of CAMPOS_FORMATO) {
      const id = nuevos.formatos[f.campo];
      if (id !== null && id !== actuales.formatos[f.campo]) {
        const [vigente] = await tx`SELECT 1 FROM documento_versiones WHERE documento_id = ${id} AND estado = 'vigente'`;
        if (!vigente) throw new ErrorMejora("El documento elegido no tiene una versión vigente");
      }
      await guardar(f.clave, String(actuales.formatos[f.campo] ?? ""), String(id ?? ""));
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "mejora_config_guardada",
      entidad: "configuracion",
      entidadId: null,
      detalle: { cambios },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendario de la entidad (spec 15 §13.2, anexo C; F15-DC39)
// ─────────────────────────────────────────────────────────────────────────────

export type DiaDeCalendario = { id: number; fecha: string; tipo: "no_habil" | "habil"; motivo: string };

export async function calendarioDeMejora(sql: Cliente): Promise<AjustesDeCalendario> {
  const filas = await sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo FROM dias_no_habiles`;
  return {
    noHabiles: new Set(filas.filter((f) => f.tipo === "no_habil").map((f) => f.fecha as string)),
    habiles: new Set(filas.filter((f) => f.tipo === "habil").map((f) => f.fecha as string)),
  };
}

export async function listarDiasDeCalendario(opciones?: Opciones): Promise<DiaDeCalendario[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo, motivo FROM dias_no_habiles ORDER BY fecha`;
  return filas.map((f) => ({ id: Number(f.id), fecha: f.fecha as string, tipo: f.tipo as DiaDeCalendario["tipo"], motivo: f.motivo as string }));
}

export type DocumentoParaFormato = { id: number; codigo: string; titulo: string; sinVigente: boolean };

/**
 * Los documentos con una versión vigente, para elegir el formato de un impreso. `incluir` son los ya elegidos:
 * uno que perdió su versión vigente sigue en la lista, marcado, para que guardar sin tocarlo no lo borre.
 */
export async function documentosParaFormato(opciones?: Opciones & { incluir?: number[] }): Promise<DocumentoParaFormato[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const incluir = opciones?.incluir ?? [];
  const filas = await sql`SELECT d.id, d.codigo, d.titulo,
      NOT EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente') AS sin_vigente
    FROM documentos d
    WHERE d.id = ANY(${incluir}::int[])
      OR EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
    ORDER BY d.codigo`;
  return filas.map((f) => ({
    id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string, sinVigente: f.sin_vigente === true,
  }));
}

const YA_ESTA = "Ese día ya está en la lista";

export async function agregarDiaDeCalendario(
  sesion: SesionFlujo,
  d: { fecha: string; tipo: "no_habil" | "habil"; motivo: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  exigirGestionar(sesion);
  const leido = EsquemaDiaDeCalendario.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const dia = leido.data;
  if (dia.tipo === "habil" && !festivosDeColombia(Number(dia.fecha.slice(0, 4))).includes(dia.fecha)) {
    throw new ErrorMejora("Ese día no es un festivo: no hay nada que anular");
  }
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    // `ON CONFLICT DO NOTHING`: una carrera por la misma fecha no aborta la transacción con un `23505` crudo.
    const [fila] = await tx`INSERT INTO dias_no_habiles (fecha, tipo, motivo, creado_por)
      VALUES (${dia.fecha}, ${dia.tipo}, ${dia.motivo}, ${sesion.usuarioId})
      ON CONFLICT (fecha) DO NOTHING RETURNING id`;
    if (!fila) throw new ErrorMejora(YA_ESTA);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "mejora_dia_agregado",
      entidad: "dia_no_habil",
      entidadId: Number(fila.id),
      detalle: { fecha: dia.fecha, tipo: dia.tipo, motivo: dia.motivo },
    });
  });
}

export async function quitarDiaDeCalendario(sesion: SesionFlujo, id: number, opciones?: OpcionesFlujo): Promise<void> {
  exigirGestionar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [fila] = await tx`DELETE FROM dias_no_habiles WHERE id = ${id}
      RETURNING to_char(fecha, 'YYYY-MM-DD') AS fecha, tipo, motivo`;
    if (!fila) throw new ErrorMejora("Ese día ya no está en la lista");
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "mejora_dia_quitado",
      entidad: "dia_no_habil",
      entidadId: id,
      detalle: { fecha: fila.fecha, tipo: fila.tipo, motivo: fila.motivo },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/** Todo lo que el cálculo de un plazo necesita; `ahora` siempre viene de quien llama. */
export type ContextoMejora = { ahora: Date; zona: string; config: ConfigMejora; calendario: AjustesDeCalendario };

export async function contextoDeMejora(sql: Cliente, ahora: Date): Promise<ContextoMejora> {
  const [config, calendario] = await Promise.all([obtenerConfigMejora({ sql }), calendarioDeMejora(sql)]);
  return { ahora, zona: zonaHoraria(), config, calendario };
}
