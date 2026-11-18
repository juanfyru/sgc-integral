import type { EncabezadoDelFormato } from "@/db/consultas/mejoramiento/formatos";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { fechaEnZona } from "@/lib/tramites/plazos";

const BORDE = "border border-border";

/** Las columnas del encabezado en pantallas anchas, según lleve logo y datos del formato (literales: Tailwind las ve así). */
const COLUMNAS = {
  ambos: "sm:grid-cols-[8rem_minmax(0,1fr)_13rem]",
  logo: "sm:grid-cols-[8rem_minmax(0,1fr)]",
  formato: "sm:grid-cols-[minmax(0,1fr)_13rem]",
  ninguno: "",
} as const;

/**
 * El encabezado de un impreso (spec 15 §16.4): el logo y el nombre de la entidad (`obtenerMarcaSegura`, nunca escritos en el
 * código), el título del formato y, del documento elegido para él en la configuración, el código, la versión y la fecha de
 * emisión vigentes (`encabezadoDeFormato`). Sin documento elegido, o sin versión vigente, sale sin esos tres datos. El título
 * lleva `idTitulo`: es el nombre de la hoja.
 */
export function EncabezadoDeFormato({
  entidad,
  logo,
  titulo,
  formato,
  zona,
  idTitulo = "impreso-titulo",
}: {
  entidad: string;
  /** La dirección del logo de la entidad (`/marca/logo?v=…`); `null` sin logo. */
  logo: string | null;
  titulo: string;
  formato: EncabezadoDelFormato | null;
  zona: string;
  idTitulo?: string;
}) {
  const columnas = COLUMNAS[logo && formato ? "ambos" : logo ? "logo" : formato ? "formato" : "ninguno"];
  return (
    <header className={`ficha-encabezado ficha-corto grid min-w-0 grid-cols-1 ${BORDE} ${columnas}`}>
      {logo ? (
        <div className="flex items-center justify-center border-b border-border p-2 sm:border-b-0 sm:border-r">
          {/* El logo lo sirve la propia app (/marca/logo); next/image exigiría sharp. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={`Logo de ${entidad}`} className="max-h-16 max-w-full object-contain" />
        </div>
      ) : null}
      <div
        className={`flex min-w-0 flex-col items-center justify-center gap-1 p-2 text-center ${formato ? "border-b border-border sm:border-b-0 sm:border-r" : ""}`}
      >
        <p className="break-words font-semibold uppercase">{entidad}</p>
        <p id={idTitulo} className="font-bold uppercase tracking-wide">
          {titulo}
        </p>
      </div>
      {formato ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 p-2 text-xs">
          <dt className="font-semibold">Código</dt>
          <dd className="break-all font-mono">{formato.codigo}</dd>
          <dt className="font-semibold">Versión</dt>
          <dd>{formato.version}</dd>
          <dt className="font-semibold">Fecha de emisión</dt>
          <dd>{fechaDeDia(fechaEnZona(formato.emitidoEn, zona))}</dd>
        </dl>
      ) : null}
    </header>
  );
}
