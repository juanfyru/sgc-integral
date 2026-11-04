"use client";

import { useActionState } from "react";
import type { EstadoLote } from "@/app/admin/acciones-usuarios";
import { resultadosCsv } from "@/lib/lote-usuarios";

const claseBoton = "rounded-md bg-azul px-4 py-2 text-sm font-medium text-white hover:bg-azul-profundo disabled:opacity-60";

export function FormularioLote({
  accion,
}: {
  accion: (estado: EstadoLote, formData: FormData) => Promise<EstadoLote>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);

  function descargar() {
    if (estado?.ok !== true) return;
    const blob = new Blob([resultadosCsv(estado.resultado)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resultados-alta-usuarios.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={enviar} className="flex max-w-xl flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Archivo CSV
          <input type="file" name="archivo" accept=".csv,text/csv" required className="text-sm font-normal" />
        </label>
        {estado?.ok === false && (
          <p role="alert" className="text-sm text-estado-critico-texto">{estado.error}</p>
        )}
        <div>
          <button type="submit" disabled={pendiente} className={claseBoton}>
            {pendiente ? "Procesando…" : "Crear usuarios"}
          </button>
        </div>
      </form>

      {estado?.ok === true && (
        <section aria-labelledby="titulo-resultados" className="flex flex-col gap-4">
          <h2 id="titulo-resultados" className="font-display text-lg font-semibold">Resultados</h2>
          <p role="status" className="text-sm">
            {estado.resultado.creados.length} creados, {estado.resultado.fallidos.length} rechazados.{" "}
            <strong>Las claves temporales no se volverán a mostrar:</strong> descargue el CSV y entréguelas por un
            medio seguro.
          </p>
          <div>
            <button type="button" onClick={descargar} className={claseBoton}>Descargar resultados (CSV)</button>
          </div>
          <table className="w-full max-w-4xl text-left text-sm">
            <caption className="sr-only">Resultado por fila del archivo</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3">Línea</th>
                <th scope="col" className="py-2 pr-3">Usuario</th>
                <th scope="col" className="py-2 pr-3">Estado</th>
                <th scope="col" className="py-2">Clave temporal o motivo</th>
              </tr>
            </thead>
            <tbody>
              {estado.resultado.creados.map((c) => (
                <tr key={`c${c.linea}`} className="border-b border-border/60">
                  <td className="py-2 pr-3">{c.linea}</td>
                  <td className="py-2 pr-3">{c.usuario}</td>
                  <td className="py-2 pr-3">Creado</td>
                  <td className="py-2"><code className="select-all font-mono">{c.claveTemporal}</code></td>
                </tr>
              ))}
              {estado.resultado.fallidos.map((f) => (
                <tr key={`f${f.linea}`} className="border-b border-border/60 text-estado-critico-texto">
                  <td className="py-2 pr-3">{f.linea}</td>
                  <td className="py-2 pr-3">{f.usuario}</td>
                  <td className="py-2 pr-3">Rechazado</td>
                  <td className="py-2">{f.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
