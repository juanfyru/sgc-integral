/** Espera tras el último cambio de tema: recorrer el grupo con las flechas envía solo el valor final. */
export const ESPERA_TEMA_MS = 400;

export type EnvioDiferido = {
  /** Un cambio: (re)programa `enviar` para dentro de la espera; vale el `enviar` del último cambio. */
  cambio(enviar: () => void): void;
  /** Si hay un envío pendiente, lo hace ya (el foco salió del grupo). */
  vaciar(): void;
  /** Descarta el pendiente (el formulario ya se envió por Aplicar, o el menú se desmonta). */
  cancelar(): void;
};

/** Envía una sola vez, `esperaMs` después del último cambio. Sin DOM: el llamador pasa cómo enviar. */
export function crearEnvioDiferido(esperaMs = ESPERA_TEMA_MS): EnvioDiferido {
  let pendiente: { temporizador: ReturnType<typeof setTimeout>; enviar: () => void } | null = null;
  const cancelar = () => {
    if (pendiente === null) return;
    clearTimeout(pendiente.temporizador);
    pendiente = null;
  };
  return {
    cambio(enviar) {
      cancelar();
      const temporizador = setTimeout(() => {
        pendiente = null;
        enviar();
      }, esperaMs);
      pendiente = { temporizador, enviar };
    },
    vaciar() {
      if (pendiente === null) return;
      const { enviar } = pendiente;
      cancelar();
      enviar();
    },
    cancelar,
  };
}
