/**
 * Los documentos externos (spec 13C §8): normas, guías y manuales que emite otro y que el hospital controla. Un
 * externo es un documento con `origen = 'externo'`, su control propio en `externos` y una versión por edición
 * adoptada. Aquí se registran, se prepara la edición en borrador, se adopta con firma (el cuarto camino que publica,
 * por `aplicarPublicacion`), se verifica su vigencia (`externo_verificaciones`, de solo inserción) y se retira (por
 * `anularVigenteEn`). Quien no puede ver o gestionar un externo recibe «El documento no existe», nunca «sin permiso».
 */
export {
  EDICION_PENDIENTE,
  NO_BORRADOR,
  RETIRADO,
  SIN_TIPO,
  SIN_VIGENTE,
  type AdopcionValidada,
  type DatosControlExterno,
  type DatosEdicion,
  type DatosExterno,
  type DestinoDeEdicion,
  type Externo,
  type FichaExterno,
  type FilaExterno,
  type FiltroExternos,
  type OpcionesDeExterno,
  type Verificacion,
} from "./externos/comun";
export type { ExternoVerificable } from "./externos/lectura";
export { abrirEdicion, descartarEdicion, editarControlExterno, editarEdicion, registrarExterno } from "./externos/registro";
export { adoptarEdicion, alAdoptar, validarAdopcion } from "./externos/adopcion";
export { registrarVerificacion, retirarExterno } from "./externos/verificacion";
export {
  archivoDeBorradorExterno,
  archivoDeEdicion,
  autorizarArchivoDeEdicion,
  esResponsableTecnico,
  externosVerificables,
  fichaDeExterno,
  listarExternos,
  obtenerExterno,
  opcionesDeExterno,
} from "./externos/lectura";
