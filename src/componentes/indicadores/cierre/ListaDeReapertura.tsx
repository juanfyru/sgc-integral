import { Insignia } from "@/componentes/ui/Insignia";
import type { ReaperturaEnTexto } from "@/db/consultas/indicadores/reapertura";

/** La línea que encabeza lo que se reabre (maqueta 13), con concordancia. */
export function encabezadoDeLaLista(n: number): string {
  return n === 1 ? "Se reabre esta medición cerrada y queda «Corregida»:" : `Se reabren estas ${n} mediciones cerradas y quedan «Corregida»:`;
}

/** El botón que confirma (maqueta 13): «Reabrir el dato y 2 mediciones» o «Reabrir 2 mediciones», con concordancia. */
export function textoDelBoton(r: ReaperturaEnTexto): string {
  const n = r.seReabren.length;
  if (r.deDato) return n === 0 ? "Reabrir el dato" : n === 1 ? "Reabrir el dato y 1 medición" : `Reabrir el dato y ${n} mediciones`;
  return n === 1 ? "Reabrir la medición" : `Reabrir ${n} mediciones`;
}

/**
 * Lo que se va a reabrir, antes de confirmar (anexo 14C, §3.5; maqueta 13): las mediciones cerradas que se reabren y quedan
 * «Corregida», junto a la que ya se reportó al ente «Ya se reportó al ente el …», y las que no se reabren con su razón. Si
 * alguna tiene la constancia registrada, que la constancia no cambia. Los textos llegan hechos del servidor
 * (`reaperturaEnTexto`): aquí solo se pintan. El estado nunca va solo en el color: la insignia lleva su texto.
 */
export function ListaDeReapertura({ reapertura }: { reapertura: ReaperturaEnTexto }) {
  const { seReabren, noSeReabren } = reapertura;
  const conConstancia = seReabren.some((x) => x.constancia !== null);
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm">
      {seReabren.length > 0 ? (
        <>
          <p className="font-semibold">{encabezadoDeLaLista(seReabren.length)}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {seReabren.map((x) => (
              <li key={x.id} className="break-words">
                {x.texto}
                {x.constancia ? (
                  <>
                    {" "}
                    <Insignia variante="atencion">{x.constancia}</Insignia>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted-foreground">Ninguna medición cerrada usa este periodo: solo se reabre el dato.</p>
      )}
      {noSeReabren.length > 0 ? (
        <>
          <p className="font-semibold">No se reabre:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {noSeReabren.map((x) => (
              <li key={x.id} className="break-words text-muted-foreground">
                {x.texto}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {conConstancia ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2">
          La constancia de envío al ente no cambia: guarda lo que se envió. Si el resultado cambia, se corrige la constancia con su justificación.
        </p>
      ) : null}
    </div>
  );
}
