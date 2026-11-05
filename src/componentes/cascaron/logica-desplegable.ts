/**
 * Cierre de los desplegables de la barra superior (campana y menú de usuario). Sin DOM ni React:
 * `Desplegable` conecta estas funciones a los eventos y los tests las prueban con objetos simples.
 */

/** Lo que la lógica usa de un <details>. */
export type Plegable = {
  open: boolean;
  contains(nodo: Node | null): boolean;
};

/**
 * Escape con el desplegable abierto lo cierra si el foco está dentro o en ninguna parte (en Safari,
 * abrir con el ratón no enfoca el <summary>). Con el foco en otro sitio, como el buscador Ctrl K, el
 * Escape es de ese diálogo. Devuelve si lo cerró: entonces el llamador devuelve el foco al resumen.
 */
export function cerrarConEscape(p: Plegable, tecla: string, activo: Node | null, cuerpo: Node | null): boolean {
  if (tecla !== "Escape" || !p.open) return false;
  if (activo !== null && activo !== cuerpo && !p.contains(activo)) return false;
  p.open = false;
  return true;
}

/** Un clic fuera del desplegable abierto lo cierra; uno dentro (un aviso, Marcar todas, un radio) no. */
export function cerrarSiPulsaFuera(p: Plegable, objetivo: Node | null): boolean {
  if (!p.open || p.contains(objetivo)) return false;
  p.open = false;
  return true;
}

/** Desplegables que se excluyen: al abrir uno se cierran los demás. */
export function crearGrupoExclusivo() {
  const miembros = new Set<Plegable>();
  return {
    /** Devuelve la función que lo quita del grupo (al desmontar). */
    registrar(p: Plegable): () => void {
      miembros.add(p);
      return () => {
        miembros.delete(p);
      };
    },
    alAbrir(p: Plegable): void {
      for (const otro of miembros) if (otro !== p && otro.open) otro.open = false;
    },
  };
}

/** La campana y el menú de usuario: uno abierto a la vez. */
export const GRUPO_BARRA_SUPERIOR = "barra-superior";
export const grupoBarraSuperior = crearGrupoExclusivo();
