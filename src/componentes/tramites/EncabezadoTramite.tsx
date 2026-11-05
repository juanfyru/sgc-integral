import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { DetalleTramite } from "@/db/consultas/tramites";
import { estadoPlazo } from "@/lib/tramites/plazos";
import {
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO_SOLICITUD,
  esEtapaDeTrabajo,
  type Etapa,
} from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { InsigniaPlazo, etiquetaEtapa, textoVersion } from "./TablaTramites";

const VARIANTE_FINAL: Partial<Record<Etapa, VarianteInsignia>> = {
  publicado: "bien",
  eliminado: "sin-dato",
  rechazado: "critico",
  cancelado: "sin-dato",
};

/** «día 2 de 5» de la etapa en curso; la entrada a la etapa es el último evento que la cambió. */
function diaDeEtapa(t: DetalleTramite, ahora: Date): string | null {
  if (!t.venceEn || !esEtapaDeTrabajo(t.etapa)) return null;
  const zona = zonaHoraria();
  const entrada = t.eventos.filter((e) => e.tipo !== "reasignar").at(-1)?.creadoEn ?? t.creadoEn;
  const total = Math.max(estadoPlazo(t.venceEn, entrada, zona).dias, 1);
  const { estado, dias } = estadoPlazo(t.venceEn, ahora, zona);
  const dia = estado === "a_tiempo" ? total - dias : estado === "vence_hoy" ? total : total + dias;
  return `día ${Math.max(dia, 1)} de ${total}`;
}

export function EncabezadoTramite({ tramite: t, ahora }: { tramite: DetalleTramite; ahora: Date }) {
  const descripcion = [
    textoVersion(t.tipo, t.etapa, t.versionNumero),
    `Solicitud ${t.numero}`,
    ETIQUETA_TIPO_SOLICITUD[t.tipo],
    `Motivo: ${ETIQUETA_MOTIVO[t.motivo].toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const dia = diaDeEtapa(t, ahora);

  return (
    <EncabezadoPagina
      migas={[{ nombre: "Trámites", href: "/tramites" }, { nombre: t.numero }]}
      codigo={t.codigo ?? undefined}
      insignias={
        <>
          <Insignia variante={VARIANTE_FINAL[t.etapa] ?? "neutra"}>
            {[etiquetaEtapa(t.etapa, t.ronda), dia].filter(Boolean).join(" · ")}
          </Insignia>
          {esEtapaDeTrabajo(t.etapa) ? <InsigniaPlazo vence={t.venceEn} ahora={ahora} /> : null}
        </>
      }
      titulo={t.titulo}
      descripcion={descripcion}
    />
  );
}
