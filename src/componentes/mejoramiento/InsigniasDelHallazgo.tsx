import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import type { Clase, Criticidad } from "@/lib/mejoramiento/tipos";

const VARIANTE_CRITICIDAD: Record<Criticidad, VarianteInsignia> = { alta: "critico", media: "atencion", baja: "bien" };

/** Las marcas por su texto: cada una con su variante, y siempre con la palabra (el color nunca es la única señal). */
function varianteDeMarca(marca: string): VarianteInsignia {
  if (marca === "Prioridad alta" || marca === "Con algo vencido") return "critico";
  if (marca.startsWith("Reabierto")) return "atencion";
  return "neutra";
}

/** La clase, la criticidad y las marcas de un hallazgo (spec 15 §8.1), las mismas en la lista y en la página. */
export function InsigniasDelHallazgo({
  clase,
  criticidad,
  marcas,
}: {
  clase: Clase;
  criticidad: Criticidad | null;
  marcas: readonly string[];
}) {
  return (
    <>
      <Insignia variante="modulo" modulo="planes">
        {ETIQUETA_CLASE[clase]}
      </Insignia>
      {criticidad ? (
        <Insignia variante={VARIANTE_CRITICIDAD[criticidad]}>Criticidad {ETIQUETA_CRITICIDAD[criticidad].toLowerCase()}</Insignia>
      ) : null}
      {marcas.map((m) => (
        <Insignia key={m} variante={varianteDeMarca(m)}>
          {m}
        </Insignia>
      ))}
    </>
  );
}
