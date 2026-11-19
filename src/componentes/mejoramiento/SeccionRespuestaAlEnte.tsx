import Link from "next/link";
import { fechaDeDia } from "@/lib/mejoramiento/formato";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Respuesta al ente» de un hallazgo externo (spec 15 §13.4): la fecha límite del ente, si la tiene, y la respuesta registrada
 * (cuándo se envió, quién la registró y el oficio); sin registrar, al Administrador del SGC, la zona de carga con los archivos que
 * pueden ser el oficio (`oficio`, con el ancla `oficio-ente`) y el formulario (`children`); a los demás, que falta; y en un
 * hallazgo terminado sin respuesta, que no se registró. Un hallazgo que está en un plan (anexo 15B §3.8, `desdeElPlan`) se
 * responde desde el plan: sin registrar, la sección lo dice y enlaza al plan solo a quien lo ve (`href`).
 */
export function SeccionRespuestaAlEnte({
  fechaLimite,
  respuesta,
  terminado,
  oficio,
  desdeElPlan,
  children,
}: {
  fechaLimite: string | null;
  respuesta: { enviadaEn: string; por: string } | null;
  /** El hallazgo ya terminó: sin respuesta, ya no se registra. */
  terminado: boolean;
  /** Registrada, el oficio; sin registrar, lo que puede serlo y la zona de carga. */
  oficio: React.ReactNode;
  /** El plan del hallazgo, si está en uno: sin registrar, la respuesta se registra desde él. Sin `href`, sin enlace. */
  desdeElPlan?: { codigo: string; href: string | null } | null;
  /** Sin registrar, al Admin SGC: el formulario. */
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
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">El oficio</p>
            {oficio}
          </div>
        </>
      ) : terminado ? (
        <p className="text-sm text-muted-foreground">No se registró la respuesta al ente.</p>
      ) : desdeElPlan ? (
        <p className="text-sm">
          La respuesta se registra desde el plan{" "}
          {desdeElPlan.href ? (
            <Link href={desdeElPlan.href} className={`rounded-sm font-mono text-marca underline underline-offset-2 ${FOCO}`}>
              {desdeElPlan.codigo}
            </Link>
          ) : (
            <span className="font-mono">{desdeElPlan.codigo}</span>
          )}
          .
        </p>
      ) : children ? (
        <>
          <p className="text-sm">Suba el oficio de respuesta, elíjalo y registre la fecha en que se envió.</p>
          <div id="oficio-ente" className="scroll-mt-4">
            {oficio}
          </div>
          {children}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">El Administrador del SGC todavía no registra la respuesta.</p>
      )}
    </section>
  );
}
