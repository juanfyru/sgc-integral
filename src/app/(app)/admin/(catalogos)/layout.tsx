// Los catálogos de la distribución (Puntos de uso y Listas) salen del panel: los abre quien tiene `distribucion.ver`, y
// el líder o Gerencia no entran al panel (`exigirEntradaPanel`). Sin guard aquí: cada página llama `exigirSesion()` y
// `exigirCatalogo()`, porque el layout no se vuelve a ejecutar en la navegación del cliente (spec 13C §12.3).
// Autenticado y por petición: nunca se prerenderiza en build (D12).
export const dynamic = "force-dynamic";

export default function LayoutCatalogos({ children }: { children: React.ReactNode }) {
  return children;
}
