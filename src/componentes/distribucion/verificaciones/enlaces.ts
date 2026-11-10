// Sin directiva: lo usan componentes de cliente (`ItemChequeo`) y de servidor (`ListaHallazgos`). Una función exportada
// desde un módulo "use client" no se puede llamar en el servidor.

export const urlDeFoto = (verificacionId: number, fotoId: number, nombre: string) =>
  `/distribucion/verificaciones/${verificacionId}/archivos/${fotoId}/${encodeURIComponent(nombre)}`;

export const urlDeFotoDeHallazgo = (hallazgoId: number, fotoId: number, nombre: string) =>
  `/distribucion/verificaciones/hallazgos/${hallazgoId}/archivos/${fotoId}/${encodeURIComponent(nombre)}`;
