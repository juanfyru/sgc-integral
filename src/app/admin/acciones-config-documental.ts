"use server";

import { z } from "zod";
import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import {
  alternarItemVerificacion,
  crearItemVerificacion,
  editarItemVerificacion,
  guardarConfigDocumental,
  moverItemVerificacion,
} from "@/db/consultas/config-documental";
import { parsearFormulario } from "@/lib/validacion";

const entero = (que: string) =>
  z.string({ error: `${que} es obligatorio` }).regex(/^\d{1,3}$/, `${que} debe ser un número entero`).transform(Number);

/** Un decimal como máximo, con punto o con coma. El rango lo decide `guardarConfigDocumental`. */
const centimetros = (que: string) =>
  z
    .string({ error: `${que} es obligatorio` })
    .regex(/^\d{1,2}([.,]\d)?$/, `${que} debe ser un número con un decimal como máximo`)
    .transform((valor) => Number(valor.replace(",", ".")));

const EsquemaConfigDocumental = z
  .object({
    formatoCodigo: z.string().min(1, "El formato del código es obligatorio"),
    plazoVistoBueno: entero("El plazo del visto bueno"),
    plazoAceptacion: entero("El plazo de aceptación"),
    plazoElaboracion: entero("El plazo de elaboración"),
    plazoAjustes: entero("El plazo de ajustes"),
    plazoRevision: entero("El plazo de revisión"),
    plazoAprobacion: entero("El plazo de aprobación"),
    plazoPublicacion: entero("El plazo de publicación"),
    escalamientoDias: entero("Los días para avisar al jefe"),
    publicacionDirecta: z.literal("on").optional(),
    formatoActaDocumentoId: z.string().regex(/^\d{1,15}$/, "El documento del formato no es válido").transform(Number).optional(),
    margenSuperiorCm: centimetros("El espacio del encabezado"),
    margenInferiorCm: centimetros("El espacio del pie"),
    plazoRecibidoDias: entero("El plazo para confirmar el recibido"),
    plazoRecogidaDias: entero("El plazo de recogida de copias"),
    plazoAcuseDias: entero("El plazo del acuse de lectura"),
    plazoSocializacionDias: entero("El plazo de socialización"),
    plazoCorreccionDias: entero("El plazo de corrección"),
    verificacionCadaDias: entero("Los días entre verificaciones"),
    umbralConformidadPct: entero("El umbral de conformidad"),
    selloFranjaCm: centimetros("El alto de la franja del sello"),
    selloQrCm: centimetros("El tamaño del código QR"),
    atencionDias: entero("Los días de aviso de la revisión"),
    revisionAnualPlazoDias: entero("El plazo de la revisión anual"),
    revisionAnualVentanaMeses: entero("La ventana de la revisión anual"),
    externosVerificacionMeses: entero("La periodicidad de verificación de externos"),
    impactoPlazoDias: entero("El plazo de respuesta al impacto"),
    formatoInformeDocumentoId: z.string().regex(/^\d{1,15}$/, "El documento del formato del informe no es válido").transform(Number).optional(),
    informeMargenSuperiorCm: centimetros("El espacio del encabezado del informe"),
    informeMargenInferiorCm: centimetros("El espacio del pie del informe"),
    metaDentroPlazoPct: entero("La meta de documentos dentro de plazo"),
    metaAprobacionDias: entero("La meta de días de aprobación"),
    metaVencidos: entero("La meta de documentos vencidos"),
    metaAcusesPct: entero("La meta de acuses de lectura"),
    metaExternosPct: entero("La meta de externos verificados"),
    metaEtapasPlazoPct: entero("La meta de etapas a tiempo"),
  })
  .strict();

const EsquemaItem = z
  .object({ texto: z.string().min(1, "El texto del ítem es obligatorio"), critico: z.literal("on").optional() })
  .strict();

const EsquemaMover = z.object({ direccion: z.enum(["arriba", "abajo"]) }).strict();
const EsquemaAlternar = z.object({ activo: z.enum(["true", "false"]) }).strict();

const DESTINO = "/admin/configuracion-documental";

export async function guardarConfigDocumentalAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (usuarioId) => {
    const d = parsearFormulario(formData, EsquemaConfigDocumental);
    await guardarConfigDocumental(
      {
        formatoCodigo: d.formatoCodigo,
        plazos: {
          visto_bueno: d.plazoVistoBueno,
          aceptacion: d.plazoAceptacion,
          elaboracion: d.plazoElaboracion,
          ajustes: d.plazoAjustes,
          revision: d.plazoRevision,
          aprobacion: d.plazoAprobacion,
          publicacion: d.plazoPublicacion,
        },
        escalamientoDias: d.escalamientoDias,
        publicacionDirecta: d.publicacionDirecta === "on",
        formatoActa: {
          documentoId: d.formatoActaDocumentoId ?? null,
          margenSuperiorCm: d.margenSuperiorCm,
          margenInferiorCm: d.margenInferiorCm,
        },
        distribucion: {
          plazoRecibidoDias: d.plazoRecibidoDias,
          plazoRecogidaDias: d.plazoRecogidaDias,
          plazoAcuseDias: d.plazoAcuseDias,
          plazoSocializacionDias: d.plazoSocializacionDias,
          plazoCorreccionDias: d.plazoCorreccionDias,
          verificacionCadaDias: d.verificacionCadaDias,
          umbralConformidadPct: d.umbralConformidadPct,
          selloFranjaCm: d.selloFranjaCm,
          selloQrCm: d.selloQrCm,
        },
        vigencia: {
          atencionDias: d.atencionDias,
          revisionAnualPlazoDias: d.revisionAnualPlazoDias,
          revisionAnualVentanaMeses: d.revisionAnualVentanaMeses,
          externosVerificacionMeses: d.externosVerificacionMeses,
          impactoPlazoDias: d.impactoPlazoDias,
          formatoInforme: {
            documentoId: d.formatoInformeDocumentoId ?? null,
            margenSuperiorCm: d.informeMargenSuperiorCm,
            margenInferiorCm: d.informeMargenInferiorCm,
          },
        },
        metas: {
          dentroPlazoPct: d.metaDentroPlazoPct,
          aprobacionDias: d.metaAprobacionDias,
          vencidos: d.metaVencidos,
          acusesPct: d.metaAcusesPct,
          externosPct: d.metaExternosPct,
          etapasPlazoPct: d.metaEtapasPlazoPct,
        },
      },
      usuarioId,
    );
    // Sin redirigir: el formulario sigue montado y confirma en pantalla; `mutacion` ya revalida.
  });
}

export async function crearItemVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (usuarioId) => {
    const d = parsearFormulario(formData, EsquemaItem);
    await crearItemVerificacion({ texto: d.texto, critico: d.critico === "on" }, usuarioId);
    return DESTINO;
  });
}

export async function editarItemVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (usuarioId) => {
    const d = parsearFormulario(formData, EsquemaItem, { omitir: ["id"] });
    await editarItemVerificacion(idNumerico(formData, "id"), { texto: d.texto, critico: d.critico === "on" }, usuarioId);
    return DESTINO;
  });
}

export async function moverItemVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (usuarioId) => {
    const d = parsearFormulario(formData, EsquemaMover, { omitir: ["id"] });
    await moverItemVerificacion(idNumerico(formData, "id"), d.direccion, usuarioId);
  });
}

export async function alternarItemVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (usuarioId) => {
    const d = parsearFormulario(formData, EsquemaAlternar, { omitir: ["id"] });
    await alternarItemVerificacion(idNumerico(formData, "id"), d.activo === "true", usuarioId);
  });
}
