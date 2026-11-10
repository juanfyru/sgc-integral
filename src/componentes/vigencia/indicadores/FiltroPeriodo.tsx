import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { dos, periodoDe } from "@/lib/indicadores-documentales/periodo";
import { mayuscula } from "@/lib/indicadores-documentales/textos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

type Opcion = { clave: string; etiqueta: string };


/** «Año 2026», «Segundo semestre de 2026», «Noviembre de 2026»: la etiqueta del periodo para la lista. */
function etiquetaDe(clave: string, zona: string): string | null {
  const p = periodoDe(clave, zona);
  if (!p) return null;
  return /^\d{4}$/.test(clave) ? `Año ${clave}` : mayuscula(p.etiqueta);
}

/**
 * Los periodos que se pueden elegir (spec 13C §11.3): el año, los semestres, los trimestres y los meses del año en
 * curso que ya empezaron, y todos los del anterior.
 */
export function periodosDelFiltro(ahora: Date, zona: string): { anio: number; opciones: Opcion[] }[] {
  const actual = Number(fechaEnZona(ahora, zona).slice(0, 4));
  return [actual, actual - 1].map((anio) => {
    const claves = [
      `${anio}`,
      `${anio}-S1`,
      `${anio}-S2`,
      ...[1, 2, 3, 4].map((t) => `${anio}-T${t}`),
      ...Array.from({ length: 12 }, (_, i) => `${anio}-${dos(i + 1)}`),
    ];
    const opciones = claves
      .filter((c) => periodoDe(c, zona)!.desde.getTime() <= ahora.getTime())
      .map((clave) => ({ clave, etiqueta: etiquetaDe(clave, zona)! }));
    return { anio, opciones };
  });
}

/**
 * El periodo y el proceso de los indicadores (`?periodo=` y `?proceso=`). El proceso ofrece solo los del alcance de la
 * persona; un periodo válido que no está en la lista (otro año) sigue a la vista, elegido.
 */
export function FiltroPeriodo({
  periodo,
  procesoId,
  procesos,
  ahora,
}: {
  periodo: string;
  procesoId: number | null;
  procesos: { id: number; nombre: string; sigla: string }[];
  ahora: Date;
}) {
  const zona = zonaHoraria();
  const grupos = periodosDelFiltro(ahora, zona);
  const enLista = grupos.some((g) => g.opciones.some((o) => o.clave === periodo));
  const fuera = enLista ? null : etiquetaDe(periodo, zona);
  return (
    <form method="get" action="/vigencia/indicadores" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
      {/* En pantallas estrechas cada selector ocupa todo el ancho; desde `sm`, el suyo. */}
      <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">
        <label htmlFor="filtro-periodo" className="text-sm font-medium">
          Periodo
        </label>
        <select id="filtro-periodo" name="periodo" defaultValue={periodo} className={`${claseControl} w-full max-w-full`}>
          {fuera ? <option value={periodo}>{fuera}</option> : null}
          {grupos.map((g) => (
            <optgroup key={g.anio} label={String(g.anio)}>
              {g.opciones.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.etiqueta}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {/* Los nombres de proceso son largos: a 390 px el selector cede al ancho disponible. */}
      <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">
        <label htmlFor="filtro-proceso" className="text-sm font-medium">
          Proceso
        </label>
        <select id="filtro-proceso" name="proceso" defaultValue={procesoId ?? ""} className={`${claseControl} w-full max-w-full`}>
          <option value="">Todos</option>
          {procesos.map((p) => (
            <option key={p.id} value={p.id}>
              {`${p.sigla} · ${p.nombre}`}
            </option>
          ))}
        </select>
      </div>
      <Boton type="submit" variante="secundario">
        Filtrar
      </Boton>
    </form>
  );
}
