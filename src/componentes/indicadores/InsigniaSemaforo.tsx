import { Insignia } from "@/componentes/ui/Insignia";
import { ETIQUETA_SEMAFORO, NO_ALCANZA_LA_META, sinAlcanzarLaMeta, type Semaforo } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";

/**
 * Cuántas categorías de un desagregado quedaron en Crítico (anexo 14C, §5.6), junto al estado del total: «1 en Crítico» y, a
 * la vista, el nombre de la dimensión («por Sede»); para los lectores de pantalla, una sola frase («1 categoría de Sede en
 * Crítico»). La insignia no se parte en dos renglones; el nombre de la dimensión, que es texto libre, sí puede pasar al
 * siguiente. Sin ninguna, nada: la marca no exige análisis ni cambia el color del total.
 */
export function InsigniaEnCritico({ n, dimension }: { n: number | null; dimension: string | null }) {
  if (n === null || n <= 0) return null;
  const categorias = cuenta(n, "categoría", "categorías");
  return (
    <span
      role="img"
      aria-label={dimension ? `${categorias} de ${dimension} en Crítico` : `${categorias} en Crítico`}
      className="inline-flex flex-wrap items-center gap-1"
    >
      <span className="whitespace-nowrap">
        <Insignia variante="critico">{`${n} en Crítico`}</Insignia>
      </span>
      {dimension ? <span className="break-words text-xs text-muted-foreground">{`por ${dimension}`}</span> : null}
    </span>
  );
}

/**
 * El estado de un resultado (spec §7.5 y §11) con su nombre escrito, nunca solo el color: «Bien», «Atención» o «Crítico»;
 * sin semáforo, «No aplica» (`noAplica`), «Sin meta» (hay resultado sin meta, `conResultado`) o «Sin dato». Un Bien que no
 * alcanza la meta (`cumple` falso; rangos propios, spec 14A §3.1) lo dice: «Bien · no alcanza la meta», con el mismo color.
 */
export function InsigniaSemaforo({
  semaforo,
  cumple = null,
  noAplica = false,
  conResultado = false,
}: {
  semaforo: Semaforo | null;
  cumple?: boolean | null;
  noAplica?: boolean;
  conResultado?: boolean;
}) {
  if (semaforo) {
    return <Insignia variante={semaforo}>{sinAlcanzarLaMeta(semaforo, cumple) ? `${ETIQUETA_SEMAFORO[semaforo]} · ${NO_ALCANZA_LA_META}` : ETIQUETA_SEMAFORO[semaforo]}</Insignia>;
  }
  return <Insignia variante="sin-dato">{noAplica ? "No aplica" : conResultado ? "Sin meta" : "Sin dato"}</Insignia>;
}
