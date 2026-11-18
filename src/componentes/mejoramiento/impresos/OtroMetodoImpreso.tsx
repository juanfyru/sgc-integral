import type { RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import type { ContenidoOtroMetodo } from "@/lib/mejoramiento/analisis";
import { HojaDeAnalisis, type DatosDelAnalisisImpreso } from "./HojaDeAnalisis";
import { Bloque, Campos, contenidoDe, SinContenido } from "./Partes";

/** El método y su descripción, o lo que la hoja dice si no los tiene (una carga, uno que no se puede leer). */
export function ContenidoDeOtroMetodo({ a, cargado }: { a: Pick<RondaDeDetalle["analisis"][number], "contenido">; cargado: boolean }) {
  const c = contenidoDe("otro", a) as ContenidoOtroMetodo | null;
  if (!c) return <SinContenido a={a} cargado={cargado} />;
  return (
    <Campos
      nombre="El método del análisis"
      campos={[
        { termino: "Método", valor: c.nombre },
        { termino: "Descripción del método", valor: c.descripcion },
      ]}
    />
  );
}

/**
 * El impreso de un análisis de «otro método» (spec 15 §16.4): una hoja sin código de formato (el hospital no tiene uno para él), con
 * la información general, el método y su descripción, la conclusión y las firmas de su ronda.
 */
export function OtroMetodoImpreso(d: Omit<DatosDelAnalisisImpreso, "formato">) {
  const c = contenidoDe("otro", d.analisis) as ContenidoOtroMetodo | null;
  return (
    <HojaDeAnalisis d={{ ...d, formato: null }} titulo={`Análisis de causa raíz · ${c?.nombre ?? "otro método"}`}>
      <Bloque id="analisis-impreso-metodo" titulo="El método">
        <ContenidoDeOtroMetodo a={d.analisis} cargado={d.hallazgo.cargado} />
      </Bloque>
    </HojaDeAnalisis>
  );
}
