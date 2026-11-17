import { fechaYHora } from "@/lib/mejoramiento/formato";

type Evento = { id: number; tipo: string; ronda: number; quien: string | null; cuando: Date };

/** Lo que cada acción del hallazgo dice en el historial: en pasado, sin nombres (quién va aparte). */
const FRASE: Record<string, string> = {
  registrar: "Registró el hallazgo",
  aceptar: "Aceptó el hallazgo",
  rechazar: "Rechazó el hallazgo",
  retirar: "Retiró el rechazo",
  sostener: "Sostuvo el rechazo",
  confirmar_hallazgo: "Confirmó el hallazgo en el arbitraje",
  confirmar_rechazo: "Confirmó el rechazo en el arbitraje",
  corregir: "Registró la corrección",
  decidir_si: "Decidió que lleva acción correctiva",
  decidir_no: "Decidió que no lleva acción correctiva",
  validar_correccion: "Validó la corrección",
  devolver_correccion: "Devolvió la corrección",
  enviar_plan: "Envió el análisis y el plan",
  devolver_plan: "Devolvió el plan",
  revisar_plan: "Revisó el plan",
  aprobar_plan: "Aprobó el plan",
  completar: "Completó las actividades",
  verificar_implementacion: "Verificó la implementación",
  evaluar_eficaz: "Evaluó la eficacia: fue eficaz",
  evaluar_no_eficaz: "Evaluó la eficacia: no fue eficaz",
  cerrar: "Cerró el hallazgo",
  anular: "Anuló el hallazgo",
  cargar: "Cargó el hallazgo",
  reclasificar: "Reclasificó el hallazgo",
  ajustar: "Decidió un ajuste del plan",
};

/** El historial del hallazgo, del más antiguo al más reciente (spec 15 §16.2). Solo lo ve quien ve el hallazgo completo. */
export function HistorialDelHallazgo({ eventos, zona }: { eventos: readonly Evento[]; zona: string }) {
  return (
    <section aria-labelledby="historial-hallazgo" className="rounded-lg border border-border bg-card p-4">
      <h2 id="historial-hallazgo" className="font-display text-base font-semibold">
        Historial
      </h2>
      {eventos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aún no hay movimientos.</p>
      ) : (
        <ol className="mt-3 flex list-none flex-col gap-2">
          {eventos.map((e) => (
            <li key={e.id} className="border-l-2 border-mod-planes pl-3 text-sm">
              <span className="block font-medium">
                {FRASE[e.tipo] ?? e.tipo}
                {e.ronda > 1 ? ` (ronda ${e.ronda})` : ""}
              </span>
              <span className="block text-xs text-muted-foreground">
                {e.quien ?? "El sistema"} · <time dateTime={e.cuando.toISOString()}>{fechaYHora(e.cuando, zona)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
