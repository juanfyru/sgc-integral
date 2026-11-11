/** La dirección del soporte de una medición: siempre se descarga, con el nombre original al final (cosmético). */
export const enlaceDeSoporte = (codigo: string, s: { id: number; nombre: string }) =>
  `/indicadores/${encodeURIComponent(codigo)}/soportes/${s.id}/${encodeURIComponent(s.nombre)}`;
