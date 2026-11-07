import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 86_400_000;

function fechaValida(texto: string | null | undefined): string | null {
  if (!texto || !FECHA.test(texto)) return null;
  const t = Date.parse(`${texto}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== texto ? null : texto;
}

/** El periodo de la pantalla y del Excel: por defecto el año en curso en la zona de la instalación; `hasta` incluye su día. */
export function periodoDeAcuses(
  params: { desde?: string | null; hasta?: string | null; proceso?: string | null },
  ahora: Date = new Date(),
): { desde: Date; hasta: Date; desdeTexto: string; hastaTexto: string; procesoId?: number } {
  const zona = zonaHoraria();
  const hoy = fechaEnZona(ahora, zona);
  const desdeTexto = fechaValida(params.desde) ?? `${hoy.slice(0, 4)}-01-01`;
  const hastaTexto = fechaValida(params.hasta) ?? `${hoy.slice(0, 4)}-12-31`;
  const anterior = new Date(Date.parse(`${desdeTexto}T00:00:00Z`) - MS_DIA).toISOString().slice(0, 10);
  const procesoId = Number(params.proceso);
  return {
    desde: new Date(finDeFecha(anterior, zona).getTime() + 1),
    hasta: new Date(finDeFecha(hastaTexto, zona).getTime() + 1),
    desdeTexto,
    hastaTexto,
    ...(Number.isInteger(procesoId) && procesoId > 0 ? { procesoId } : {}),
  };
}
