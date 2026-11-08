import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { ConformidadActual, EstadoPunto } from "@/db/consultas/distribucion/verificaciones-resumen";
import { fechaConAnio } from "./fecha";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "punto", etiqueta: "Punto de uso" },
  { clave: "ultima", etiqueta: "Última verificación" },
  { clave: "resultado", etiqueta: "Resultado" },
  { clave: "hallazgos", etiqueta: "Hallazgos abiertos", numerica: true },
  { clave: "proxima", etiqueta: "Próxima" },
  { clave: "accion", etiqueta: "Verificar", oculta: true },
];

/** La cifra de conformidad: el porcentaje y el umbral van en texto, la insignia solo los refuerza. */
export function TarjetaConformidad({ etiqueta, c }: { etiqueta: string; c: ConformidadActual }) {
  const estado = c.cumple === null ? "sin-dato" : c.cumple ? "bien" : "critico";
  return (
    <div className="flex flex-col gap-2">
      <TarjetaCifra
        etiqueta={etiqueta}
        valor={c.porcentaje === null ? "Sin datos" : `${c.porcentaje} %`}
        detalle={`Umbral ${c.umbral} % · ${c.puntos} ${c.puntos === 1 ? "verificación" : "verificaciones"}`}
        estado={estado}
      />
      <div>
        <Insignia variante={estado}>{c.cumple === null ? "Sin datos" : c.cumple ? "Cumple" : "Por debajo del umbral"}</Insignia>
      </div>
    </div>
  );
}

/** Una fila por punto activo: cuándo se verificó por última vez, cómo salió y cuándo toca la próxima. */
export function EstadoPuntos({
  puntos,
  conformidad,
  puedeVerificar,
}: {
  puntos: EstadoPunto[];
  conformidad: ConformidadActual;
  puedeVerificar: boolean;
}) {
  return (
    <section aria-labelledby="estado-puntos" className="flex flex-col gap-3">
      <h2 id="estado-puntos" className="text-sm font-semibold">
        Estado de los puntos de uso
      </h2>
      <p className="text-sm">
        {conformidad.porcentaje === null
          ? `Conformidad actual: sin datos · umbral ${conformidad.umbral} %`
          : `Conformidad actual: ${conformidad.porcentaje} % · umbral ${conformidad.umbral} %`}
      </p>
      <div className="max-w-xs">
        <TarjetaConformidad etiqueta="Conformidad actual" c={conformidad} />
      </div>
      <TablaDatos titulo="Estado de verificación por punto" columnas={COLUMNAS} filas={puntos.length} vacio="No hay puntos de uso activos.">
        {puntos.map((p) => (
          <tr key={p.puntoId}>
            <td className={celda}>
              <div className="font-medium">{p.nombre}</div>
              <div className="text-xs text-muted-foreground">{[p.sede, p.responsable].filter(Boolean).join(" · ")}</div>
            </td>
            <td className={celda}>{p.ultima ? fechaConAnio(p.ultima.cerradaEn) : "Nunca verificado"}</td>
            <td className={celda}>
              {p.ultima ? (
                <Insignia variante={p.ultima.conforme ? "bien" : "critico"}>{p.ultima.conforme ? "Conforme" : "No conforme"}</Insignia>
              ) : (
                <Insignia variante="sin-dato">Sin datos</Insignia>
              )}
            </td>
            <td className={celdaNumerica}>{p.hallazgosAbiertos}</td>
            <td className={celda}>
              {p.proxima === null ? "Pendiente" : fechaConAnio(p.proxima)}
              {p.vencida ? (
                <div>
                  <Insignia variante="atencion">Toca verificar</Insignia>
                </div>
              ) : null}
            </td>
            <td className={celda}>
              {puedeVerificar ? (
                <Link
                  href={p.abiertaId ? `/distribucion/verificaciones/${p.abiertaId}` : `/distribucion/verificaciones/nueva?punto=${p.puntoId}`}
                  className={claseBoton("secundario")}
                >
                  <ClipboardCheck aria-hidden="true" className="size-4" />
                  {p.abiertaId ? "Continuar" : "Verificar"}
                  <span className="sr-only">{` ${p.nombre}`}</span>
                </Link>
              ) : null}
            </td>
          </tr>
        ))}
      </TablaDatos>
    </section>
  );
}
