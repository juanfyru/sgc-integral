import { fechaDeDia } from "@/lib/mejoramiento/formato";

/**
 * «Respuesta al ente» de un hallazgo externo con el plan aprobado (spec 15 §13.4): la fecha límite del ente, si la tiene, y la
 * respuesta registrada (cuándo se envió y quién la registró) con su oficio; sin registrar, al Administrador del SGC, la zona de
 * carga del oficio y el formulario (`children`), y a los demás, que falta.
 */
export function SeccionRespuestaAlEnte({
  fechaLimite,
  respuesta,
  oficio,
  children,
}: {
  fechaLimite: string | null;
  respuesta: { enviadaEn: string; por: string } | null;
  /** Los archivos del oficio (la lista, con sus enlaces). */
  oficio: React.ReactNode;
  /** Sin registrar, al Admin SGC: lo que se sube y el formulario. */
  children?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="respuesta-ente" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 id="respuesta-ente" className="font-display text-base font-semibold">
        Respuesta al ente
      </h2>
      {fechaLimite ? <p className="text-sm">{`Fecha límite de respuesta: ${fechaDeDia(fechaLimite)}.`}</p> : null}
      {respuesta ? (
        <>
          <p className="text-sm">{`Enviada el ${fechaDeDia(respuesta.enviadaEn)} · la registró ${respuesta.por}.`}</p>
          {oficio}
        </>
      ) : children ? (
        <>
          <p className="text-sm">Suba el oficio de respuesta y registre la fecha en que se envió.</p>
          {oficio}
          {children}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">El Administrador del SGC todavía no registra la respuesta.</p>
      )}
    </section>
  );
}
