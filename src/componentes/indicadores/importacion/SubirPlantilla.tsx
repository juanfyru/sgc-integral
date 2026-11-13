"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { crearLoteAccion } from "@/app/admin/acciones-indicadores";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";

/**
 * «Nueva importación» (spec 14A §5.3, paso 1): abre un lote, le sube la plantilla llena y navega a su página. El
 * servidor valida el archivo por sus bytes; aquí solo se avisa de la extensión antes de subir.
 */
export function SubirPlantilla() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function alEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const archivo = entrada.current?.files?.[0];
    if (!archivo) return setError("Elija el archivo de la plantilla (.xlsx)");
    if (!archivo.name.toLowerCase().endsWith(".xlsx")) return setError("La importación recibe solo la plantilla en Excel (.xlsx)");
    setError(null);
    setSubiendo(true);
    try {
      const creado = await crearLoteAccion(null, new FormData());
      if (!creado) return setError("No se pudo abrir la importación");
      if (!creado.ok) return setError(creado.error);
      const respuesta = await fetch(`/api/importaciones-indicadores/${creado.id}/archivo`, {
        method: "POST",
        headers: { "x-nombre-archivo": encodeURIComponent(archivo.name) },
        body: archivo,
      });
      if (respuesta.status !== 201) {
        let mensaje = "No se pudo subir la plantilla";
        try {
          mensaje = ((await respuesta.json()) as { error?: string }).error ?? mensaje;
        } catch {}
        return setError(mensaje);
      }
      router.push(`/admin/indicadores/importar/${creado.id}`);
    } catch {
      setError("Error de red: intente de nuevo");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="flex max-w-xl flex-col gap-3">
      <Campo etiqueta="Plantilla llena (.xlsx)" nombre="plantilla" ayuda="La plantilla descargada aquí, con una fila por indicador.">
        <input ref={entrada} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className={`${claseControl} w-full`} />
      </Campo>
      {error ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {error}
        </p>
      ) : null}
      <div>
        <Boton type="submit" pendiente={subiendo}>
          {subiendo ? "Subiendo…" : "Subir y revisar"}
        </Boton>
      </div>
    </form>
  );
}
