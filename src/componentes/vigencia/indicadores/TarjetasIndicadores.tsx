import { Insignia } from "@/componentes/ui/Insignia";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { IndicadorMedido, ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { estadoDeCumple, textoCumple, textoMeta, textoValor } from "@/lib/indicadores-documentales/textos";

/**
 * Las siete tarjetas del proceso documental (maqueta 9) con su valor, la meta y si la cumple, dicho con texto en la
 * insignia (spec 13C §11.2), y una octava con los trámites publicados en el periodo y los que siguen en curso.
 */
export function TarjetasIndicadores({
  indicadores,
  tramites,
}: {
  indicadores: IndicadorMedido[];
  tramites: ResultadoIndicadores["tramites"];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {indicadores.map((i) => (
        <TarjetaCifra
          key={i.clave}
          etiqueta={i.nombre}
          valor={textoValor(i)}
          detalle={i.detalle ?? undefined}
          estado={estadoDeCumple(i.cumple)}
          pie={<Insignia variante={estadoDeCumple(i.cumple)}>{`meta ${textoMeta(i)} · ${textoCumple(i.cumple)}`}</Insignia>}
        />
      ))}
      <TarjetaCifra etiqueta="Trámites publicados en el periodo" valor={tramites.publicados} detalle={`${tramites.enCurso} en curso`} />
    </div>
  );
}
