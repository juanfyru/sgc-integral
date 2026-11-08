import { Insignia } from "@/componentes/ui/Insignia";
import type { Verificacion } from "@/db/consultas/distribucion/verificaciones";
import { resumenDeChequeo } from "@/lib/distribucion/verificacion";
import { zonaHoraria } from "@/lib/zona-horaria";

/** «7 de 9 ítems conformes · Punto no conforme»; mientras se llena, con «(provisional)». */
export function textoResumen(r: { conformes: number; total: number; conforme: boolean }, provisional: boolean): string {
  return `${r.conformes} de ${r.total} ítems conformes · Punto ${r.conforme ? "conforme" : "no conforme"}${provisional ? " (provisional)" : ""}`;
}

/** Lo que dejó una verificación cerrada: el resultado, quién la cerró y cuántos hallazgos abrió. */
export function ResumenCierre({ verificacion: v }: { verificacion: Verificacion }) {
  const resumen = resumenDeChequeo(v.items);
  const cuando = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria() });
  return (
    <section aria-labelledby="titulo-resumen" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-resumen" className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
        Resultado
        <Insignia variante={v.conforme ? "bien" : "critico"}>{v.conforme ? "Punto conforme" : "Punto no conforme"}</Insignia>
      </h2>
      <p className="text-sm">{textoResumen(resumen, false)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {v.cerradaPor && v.cerradaEn ? `Cerrada por ${v.cerradaPor}, el ${cuando.format(v.cerradaEn)}. ` : ""}
        {v.hallazgos.length === 0
          ? "No abrió hallazgos."
          : v.hallazgos.length === 1
            ? "Abrió 1 hallazgo."
            : `Abrió ${v.hallazgos.length} hallazgos.`}
        {v.propioPunto ? " La verificó quien responde por el punto, porque no hay otro Administrador del SGC activo." : ""}
      </p>
    </section>
  );
}
