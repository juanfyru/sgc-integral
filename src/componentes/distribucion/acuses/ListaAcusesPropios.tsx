import Link from "next/link";
import { BookCheck } from "lucide-react";
import { fechaLarga } from "@/componentes/distribucion/acuses/TareaAcuse";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Acuse } from "@/db/consultas/distribucion/acuses";

/** Las lecturas de la persona: primero las pendientes, luego las confirmadas. El estado va siempre en texto. */
export function ListaAcusesPropios({ acuses, ahora }: { acuses: Acuse[]; ahora: Date }) {
  if (acuses.length === 0) {
    return <EstadoVacio icono={BookCheck} titulo="Sin lecturas" texto="No tiene lecturas pendientes ni confirmadas." />;
  }
  return (
    <ul className="flex max-w-3xl flex-col gap-2">
      {acuses.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <div className="min-w-0">
            <Link href={`/acuses/${a.id}`} className="font-medium underline underline-offset-2">
              {`${a.codigo} v${a.version}`}
            </Link>
            <p className="break-words text-sm text-muted-foreground">{a.titulo}</p>
          </div>
          {a.estado === "confirmado" ? (
            <Insignia variante="bien">{`Confirmada el ${fechaLarga(a.confirmadoEn ?? a.creadoEn)}`}</Insignia>
          ) : (
            <Insignia variante={a.venceEn < ahora ? "critico" : "atencion"}>
              {`${a.venceEn < ahora ? "Vencida" : "Por confirmar"} · plazo ${fechaLarga(a.venceEn)}`}
            </Insignia>
          )}
        </li>
      ))}
    </ul>
  );
}
