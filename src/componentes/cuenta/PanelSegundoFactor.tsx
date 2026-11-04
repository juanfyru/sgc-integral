"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  confirmarTotpAccion,
  desactivarTotpAccion,
  type EstadoAccion,
  type EstadoFactor,
} from "@/app/acciones-cuenta";

const CLASE_CAMPO =
  "rounded-xl border border-border bg-card px-3 py-2 text-base text-foreground shadow-xs outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";
const CLASE_BOTON =
  "rounded-xl bg-azul px-4 py-2 font-medium text-white transition-colors hover:bg-azul-profundo focus-visible:ring-2 focus-visible:ring-azul/40 disabled:opacity-60";

function CodigosDeRecuperacion({ codigos }: { codigos: string[] }) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }
  return (
    <section className="flex w-full flex-col gap-3" aria-labelledby="titulo-recuperacion">
      <h2 id="titulo-recuperacion" className="font-display text-lg font-semibold">
        Segundo factor activado
      </h2>
      <p role="alert" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">
        Guarde estos códigos de recuperación en un lugar seguro. Cada uno sirve una sola vez si
        pierde su teléfono, y <strong>no se volverán a mostrar</strong>.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-base tracking-wider" aria-label="Códigos de recuperación">
        {codigos.map((c) => (
          <li key={c} className="rounded-md border border-border bg-card px-2 py-1 text-center">
            {c}
          </li>
        ))}
      </ul>
      <button type="button" onClick={copiar} className={CLASE_BOTON}>
        Copiar
      </button>
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {copiado === "si" && "Códigos copiados."}
        {copiado === "no" && "No se pudo copiar; anótelos a mano."}
      </p>
      <Link href="/cuenta" className="text-sm text-azul underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-azul/40">
        Ya los guardé, continuar
      </Link>
    </section>
  );
}

/** Campo de código para confirmar el secreto; al activarse muestra los códigos de recuperación. */
export function PanelSegundoFactor() {
  const [estado, enviar, pendiente] = useActionState<EstadoFactor, FormData>(confirmarTotpAccion, null);
  if (estado?.ok) return <CodigosDeRecuperacion codigos={estado.codigos} />;
  return (
    <form action={enviar} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Código de 6 dígitos de la aplicación
        <input
          name="codigo"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          required
          className={`${CLASE_CAMPO} tracking-widest`}
        />
      </label>
      {estado && !estado.ok && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente} className={CLASE_BOTON}>
        {pendiente ? "Verificando…" : "Confirmar y activar"}
      </button>
    </form>
  );
}

export function FormularioDesactivarTotp() {
  const [estado, enviar, pendiente] = useActionState<EstadoAccion, FormData>(desactivarTotpAccion, null);
  return (
    <form action={enviar} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Su clave, para confirmar
        <input type="password" name="clave" autoComplete="current-password" maxLength={128} required className={CLASE_CAMPO} />
      </label>
      {estado && (
        <p role="alert" className="text-sm text-destructive">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente} className={CLASE_BOTON}>
        {pendiente ? "Desactivando…" : "Desactivar segundo factor"}
      </button>
    </form>
  );
}
