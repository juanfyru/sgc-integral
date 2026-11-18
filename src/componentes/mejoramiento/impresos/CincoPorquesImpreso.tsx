import type { RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import type { ContenidoCincoPorques } from "@/lib/mejoramiento/analisis";
import { HojaDeAnalisis, type DatosDelAnalisisImpreso } from "./HojaDeAnalisis";
import { Bloque, Cabecera, contenidoDe, SinContenido, Tabla, TD } from "./Partes";

/** La pregunta de cada nivel, como la dice el formulario del análisis. */
const pregunta = (i: number) => (i === 0 ? "¿Por qué ocurrió?" : `¿Por qué? (nivel ${i + 1})`);

/** Los niveles de un análisis de 5 porqués (spec §9.1): cada uno con su respuesta y su evidencia, en su orden. */
export function NivelesDePorques({ contenido, nombre }: { contenido: ContenidoCincoPorques; nombre: string }) {
  return (
    <Tabla nombre={nombre}>
      <Cabecera columnas={["Nivel", "Pregunta", "Respuesta", "Evidencia"]} />
      <tbody>
        {contenido.niveles.map((n, i) => (
          <tr key={i}>
            <td className={`${TD} w-12 text-center tabular-nums`}>{i + 1}</td>
            <td className={`${TD} w-40`}>{pregunta(i)}</td>
            <td className={`${TD} whitespace-pre-line`}>{n.respuesta}</td>
            <td className={TD}>{"evidencia" in n && n.evidencia ? n.evidencia : "—"}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

/** El contenido de un análisis de 5 porqués, o lo que la hoja dice si no lo tiene (una carga, uno que no se puede leer). */
export function ContenidoDePorques({ a, cargado, nombre }: { a: Pick<RondaDeDetalle["analisis"][number], "contenido">; cargado: boolean; nombre: string }) {
  const c = contenidoDe("cinco_porques", a) as ContenidoCincoPorques | null;
  return c ? <NivelesDePorques contenido={c} nombre={nombre} /> : <SinContenido a={a} cargado={cargado} />;
}

/**
 * El impreso SGC-FO-AC-02 (spec 15 §16.4 y Apéndice A.3): un análisis de 5 porqués, con su información general, los niveles con su
 * respuesta y su evidencia, la conclusión y las firmas de su ronda. El de una carga sin contenido dice que está en el formato
 * firmado, sin una tabla vacía.
 */
export function CincoPorquesImpreso(d: DatosDelAnalisisImpreso) {
  return (
    <HojaDeAnalisis d={d} titulo="Análisis de causa raíz · 5 porqués">
      <Bloque id="analisis-impreso-niveles" titulo="Los cinco porqués">
        <ContenidoDePorques a={d.analisis} cargado={d.hallazgo.cargado} nombre="Los niveles del análisis" />
      </Bloque>
    </HojaDeAnalisis>
  );
}
