/**
 * Contrato entre `transicionar` y los manejadores y validadores de `flujo/*.ts`. Vive aparte
 * porque los dos lados lo importan: los manejadores no importan `tramites-flujo.ts`, que es
 * quien los registra. `tramites-flujo.ts` lo reexporta todo.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import type { ContextoFirma, Verificador } from "@/lib/firma";
import type { SesionValida } from "@/lib/sesion";
import type { Accion } from "@/lib/tramites/transiciones";
import type { Etapa, Motivo, TipoSolicitud } from "@/lib/tramites/tipos";

export type SesionFlujo = Pick<SesionValida, "sesionId" | "usuarioId" | "usuario" | "nombre" | "rol" | "verHistorial">;

export const YA_ABIERTO = "Ya hay un trámite abierto sobre este documento";
export const CAMBIO_MIENTRAS = "Este trámite cambió mientras lo tenía abierto. Recargue la página.";
export const ARCHIVO_CAMBIADO = "El archivo cambió después de la firma de quien elaboró";

/** Error de negocio: su mensaje se le muestra al usuario. */
export class ErrorTramite extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorTramite";
  }
}

export class ErrorFirma extends ErrorTramite {
  constructor(
    mensaje: string,
    public readonly sesionCerrada: boolean,
  ) {
    super(mensaje);
    this.name = "ErrorFirma";
  }
}

export type OpcionesFlujo = { sql?: Cliente; verificar?: Verificador; ahora?: Date; contexto?: ContextoFirma };

export type FilaTramite = {
  id: number;
  numero: string;
  tipo: TipoSolicitud;
  motivo: Motivo;
  justificacion: string;
  solicitanteId: number;
  procesoId: number;
  subprocesoId: number | null;
  tipoDocumentoId: number | null;
  tituloPropuesto: string | null;
  documentoId: number | null;
  versionId: number | null;
  etapa: Etapa;
  ronda: number;
  elaboradorId: number | null;
  revisorId: number | null;
  aprobadorId: number | null;
  venceEn: Date | null;
  motivoCierre: string | null;
  creadoEn: Date;
};

export type TipoAviso =
  | "tramite.paso"
  | "tramite.devuelto"
  | "tramite.resuelto"
  | "tramite.cerrado"
  | "tramite.reasignado"
  | "tramite.vencido"
  | "tramite.escalado";

export type Aviso = { usuarioIds: number[]; tipo: TipoAviso; titulo: string; cuerpo?: string };

export type Efecto = {
  detalle?: Record<string, unknown>;
  cambios?: Partial<
    Pick<
      FilaTramite,
      | "tipo"
      | "procesoId"
      | "subprocesoId"
      | "tipoDocumentoId"
      | "documentoId"
      | "versionId"
      | "tituloPropuesto"
      | "elaboradorId"
      | "revisorId"
      | "aprobadorId"
      | "venceEn"
      | "motivoCierre"
    >
  >;
  avisos?: Aviso[];
};

export type ContextoManejador = {
  tx: TransactionSql;
  tramite: FilaTramite;
  sesion: SesionFlujo;
  datos: Record<string, unknown>;
  ahora: Date;
  config: ConfigDocumental;
  hacia: Etapa;
};

export type Manejador = (c: ContextoManejador) => Promise<Efecto | void>;

export type ContextoValidacion = {
  sql: Cliente;
  tramite: FilaTramite;
  sesion: SesionFlujo;
  datos: Record<string, unknown>;
  config: ConfigDocumental;
};

/** Solo lecturas: dice lo que falta antes de pedir o gastar la firma, y lanza `ErrorTramite`. */
export type Validador = (c: ContextoValidacion) => Promise<void>;

export type RegistroManejadores = Partial<Record<Accion, Manejador>>;
export type RegistroValidadores = Partial<Record<Accion, Validador>>;

/**
 * Corre `fn` de forma atómica: en una transacción nueva o, si `sql` ya es una, en un savepoint.
 * Si `fn` falla no queda nada suyo escrito, y la transacción de quien llama sigue usable.
 */
export function enTransaccion<T>(sql: Cliente, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return ("savepoint" in sql ? sql.savepoint(fn) : sql.begin(fn)) as Promise<T>;
}

/** El dato `motivo` de las acciones que cierran un trámite o niegan un paso. */
export function motivoObligatorio(datos: Record<string, unknown>): string {
  const motivo = typeof datos.motivo === "string" ? datos.motivo.trim() : "";
  if (!motivo) throw new ErrorTramite("Escriba el motivo");
  return motivo;
}
