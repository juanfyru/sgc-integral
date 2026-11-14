import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { IndicadorMedido, ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { estadoDeCumple, textoCumple, textoMeta, textoValor } from "@/lib/indicadores-documentales/textos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Las siete tarjetas del proceso documental (maqueta 9) con su valor, la meta y si la cumple, dicho con texto en la
 * insignia (spec 13C §11.2), y una octava con los trámites publicados en el periodo y los que siguen en curso. Si la meta
 * la fija la ficha del cálculo y la persona puede verla, la tarjeta la enlaza (anexo 14B, §6).
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
          pie={
            <div className="flex flex-col items-start gap-1">
              <Insignia variante={estadoDeCumple(i.cumple)}>{`meta ${textoMeta(i)} · ${textoCumple(i.cumple)}`}</Insignia>
              {i.ficha ? (
                <Link
                  href={`/indicadores/${encodeURIComponent(i.ficha.codigo)}?vista=ficha`}
                  className={`rounded text-xs font-medium text-marca underline underline-offset-2 ${FOCO}`}
                >
                  {`Ver ficha ${i.ficha.codigo}`}
                </Link>
              ) : null}
            </div>
          }
        />
      ))}
      <TarjetaCifra etiqueta="Trámites publicados en el periodo" valor={tramites.publicados} detalle={`${tramites.enCurso} en curso`} />
    </div>
  );
}
