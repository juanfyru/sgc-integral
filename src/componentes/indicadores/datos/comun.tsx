import { Insignia } from "@/componentes/ui/Insignia";
import type { PeriodoDeDato } from "@/db/consultas/indicadores/datos-periodos";
import { diaYMes } from "@/db/consultas/indicadores/pasada";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { mayuscula } from "@/lib/indicadores-documentales/textos";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { numeroEs } from "@/lib/indicadores/semaforo";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import type { PeriodoParaReportar } from "./ReportarDato";

/** Lo que comparten la lista de «Datos compartidos» y la página de un dato (anexo 14C, §4.7). Solo en el servidor. */

/** Lo que el formulario de reportar necesita de un periodo, ya en texto en la zona de la instalación. */
export function paraReportar(p: PeriodoDeDato, ahora: Date): PeriodoParaReportar {
  return {
    id: p.id,
    etiqueta: etiquetaDePeriodo(p.periodo),
    vence: diaYMes(p.venceEn, zonaHoraria()),
    vencido: p.venceEn.getTime() < ahora.getTime(),
    reportado: p.estado === "reportado",
    valor: p.valor,
    porCategoria: p.porCategoria,
    categorias: p.categorias?.map((c) => ({ id: c.id, nombre: c.nombre })) ?? null,
  };
}

/** «-1234,5» → «-1.234,5»: el punto de miles en la parte entera de una cifra ya escrita con coma decimal. */
export function conPuntoDeMiles(cifra: string): string {
  const [, signo, entera, resto] = /^(-?)(\d+)(.*)$/.exec(cifra) ?? [];
  if (entera === undefined) return cifra;
  return `${signo}${entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${resto}`;
}

/**
 * Un valor guardado (punto decimal) como lo muestran las pantallas del dato (maquetas 11 y 12): coma decimal, hasta cuatro
 * decimales y punto de miles, «1.284.300.000». Solo al mostrar: los campos de captura siguen sin separador.
 */
export function cifraDeDato(valor: string): string {
  const f = fraccion(valor);
  return f ? conPuntoDeMiles(numeroEs(f, 4, "truncar")) : valor;
}

/** «octubre de 2026»; con `inicial`, «Octubre de 2026». */
export function etiquetaDePeriodo(clave: string, inicial = false): string {
  const etiqueta = periodoDe(clave, zonaHoraria())?.etiqueta ?? clave;
  return inicial ? mayuscula(etiqueta) : etiqueta;
}

/** «14 ago 2026» en la zona de la instalación. */
export const diaCorto = (fecha: Date) => textoFecha(fecha, zonaHoraria());

/**
 * Un periodo que se pide (`periodoQueSePide`): «Por reportar · vence el 10 nov 2026» o, pasada su fecha límite,
 * «Vencido · desde el 10 nov 2026». El texto lleva el estado: el color no es la única señal.
 */
export function InsigniaPorReportar({ venceEn, ahora }: { venceEn: Date; ahora: Date }) {
  const fecha = diaCorto(venceEn);
  return venceEn.getTime() < ahora.getTime() ? (
    <Insignia variante="critico">{`Vencido · desde el ${fecha}`}</Insignia>
  ) : (
    <Insignia variante="atencion">{`Por reportar · vence el ${fecha}`}</Insignia>
  );
}
