/**
 * La revisión anual de documentos (spec 13C §9): una campaña que el Admin SGC abre con la foto de todos los documentos
 * vigentes, en la que cada líder decide sobre los de sus procesos (ratificar, actualizar, eliminar) y confirma su
 * normograma, y que se cierra con firma congelando el informe. Lo que se hace fuera de su página (ratificar, verificar
 * un externo, adoptar una edición, pedir una solicitud, publicar) registra la decisión por sí mismo. Las partes viven en
 * `revision-anual/` (común, campaña, registro, decisiones, lectura, cierre, tareas y vencidos); este archivo las
 * reexporta. Los actos importan `revision-anual/registro` directamente: no cargan el resto.
 */
export {
  PROCESO_NO_EXISTE,
  REVISION_NO_EXISTE,
  YA_ABIERTA,
  YA_CERRADA,
  type Prorroga,
  type Revision,
} from "./revision-anual/comun";
export {
  abrirRevision,
  indiceDeRevisiones,
  listarRevisiones,
  prorrogarRevision,
  revisionAbierta,
  type RevisionEnIndice,
} from "./revision-anual/campana";
export {
  alPublicarDuranteRevision,
  alSolicitar,
  registrarDecision,
  revisionAbiertaBloqueada,
  revisionQueIncluye,
  sacarDeLaFoto,
  type NuevaDecision,
  type RevisionBloqueada,
} from "./revision-anual/registro";
export { confirmarNormograma, enlazarTramiteExistente } from "./revision-anual/decisiones";
export {
  obtenerRevision,
  type DecisionDeDocumento,
  type DetalleRevision,
  type DocumentoDeRevision,
  type InsumosDeDocumento,
  type ProcesoDeRevision,
} from "./revision-anual/lectura";
export { ETAPAS_MUERTAS, estaPendiente } from "./revision-anual/comun";
export { cerrarRevision, datosDelInforme, informeCongelado } from "./revision-anual/cierre";
export { tareasDeRevision } from "./revision-anual/tareas";
export { revisionVencida } from "./revision-anual/vencidos";
