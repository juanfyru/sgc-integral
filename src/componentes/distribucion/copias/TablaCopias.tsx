import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { Copia } from "@/db/consultas/distribucion/copias";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { ETIQUETA_DESTINO } from "@/lib/distribucion/tipos";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "numero", etiqueta: "N.º" },
  { clave: "documento", etiqueta: "Documento" },
  { clave: "entregada", etiqueta: "Entregada a" },
  { clave: "estado", etiqueta: "Estado" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Días calendario transcurridos desde `desde` hasta `ahora`, en la zona de la instalación. */
export function diasDesde(desde: Date, ahora: Date): number {
  const { estado, dias } = estadoPlazo(desde, ahora, zonaHoraria());
  return estado === "vencido" ? dias : 0;
}

const textoDias = (dias: number) => (dias === 1 ? "1 día" : `${dias} días`);

export function fechaCorta(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: zonaHoraria() }).formatToParts(fecha);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("day")} ${de("month").replace(".", "")}`;
}

/** El estado va siempre en texto; el color solo lo refuerza. */
export function InsigniaCopia({ copia, ahora }: { copia: Copia; ahora: Date }) {
  switch (copia.estado) {
    case "emitida":
      return <Insignia variante="atencion">{`Sin recibido · ${textoDias(diasDesde(copia.emitidaEn, ahora))}`}</Insignia>;
    case "recibida":
      return <Insignia variante="bien">{`Recibida ${fechaCorta(copia.fechas.recibidaEn ?? copia.emitidaEn)}`}</Insignia>;
    case "por_recoger": {
      const vencida = copia.venceEn !== null && copia.venceEn < ahora;
      return (
        <Insignia variante={vencida ? "critico" : "grave"}>
          {`Por recoger · ${textoDias(diasDesde(copia.fechas.porRecogerEn ?? ahora, ahora))}`}
        </Insignia>
      );
    }
    case "recogida":
      return (
        <Insignia variante="neutra">
          {`Recogida ${fechaCorta(copia.fechas.recogidaEn ?? ahora)}${copia.destinoRecogida ? ` · ${ETIQUETA_DESTINO[copia.destinoRecogida]}` : ""}`}
        </Insignia>
      );
    case "anulada":
      return <Insignia variante="sin-dato">Anulada</Insignia>;
  }
}

function Numero({ copia }: { copia: Copia }) {
  return (
    <Link
      href={`/distribucion/copias/${copia.id}`}
      aria-label={`Copia N.º ${numeroDeCopia(copia.numero)} de ${copia.codigo} versión ${copia.version}`}
      className={`rounded font-mono text-xs font-medium hover:underline ${FOCO}`}
    >
      {numeroDeCopia(copia.numero)}
    </Link>
  );
}

function Documento({ copia: c }: { copia: Copia }) {
  return (
    <>
      <div>
        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{`${c.codigo} v${c.version}`}</span>
        {c.titulo}
      </div>
      {c.estado === "por_recoger" && c.motivoPorRecoger === "eliminado" ? (
        <div className="text-xs text-muted-foreground">El documento fue eliminado</div>
      ) : null}
      {c.estado === "por_recoger" && c.motivoPorRecoger === "nueva_version" ? (
        <div className="text-xs text-muted-foreground">Hay una versión nueva vigente</div>
      ) : null}
    </>
  );
}

function Entregada({ copia: c }: { copia: Copia }) {
  return (
    <>
      <div>{c.responsable.nombre}</div>
      <div className="text-xs text-muted-foreground">
        {`${c.punto.nombre} · emitida por ${c.emitidaPor.nombre} · ${fechaCorta(c.emitidaEn)}`}
      </div>
    </>
  );
}

/** Tabla desde 768 px; por debajo, una tarjeta por copia. */
export function TablaCopias({ copias, ahora }: { copias: Copia[]; ahora: Date }) {
  return (
    <>
      <div className="hidden md:block">
        <TablaDatos titulo="Copias controladas" columnas={COLUMNAS} filas={copias.length} vacio="Sin copias">
          {copias.map((c) => (
            <tr key={c.id}>
              <td className={`${celda} whitespace-nowrap`}><Numero copia={c} /></td>
              <td className={celda}><Documento copia={c} /></td>
              <td className={celda}><Entregada copia={c} /></td>
              <td className={`${celda} whitespace-nowrap`}><InsigniaCopia copia={c} ahora={ahora} /></td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {copias.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Numero copia={c} />
              <InsigniaCopia copia={c} ahora={ahora} />
            </div>
            <div className="mt-2"><Documento copia={c} /></div>
            <div className="mt-2"><Entregada copia={c} /></div>
          </li>
        ))}
      </ul>
    </>
  );
}
