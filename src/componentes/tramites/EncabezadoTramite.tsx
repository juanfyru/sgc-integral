import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { DetalleTramite } from "@/db/consultas/tramites";
import { diaDeEtapa, entradaDeEtapa } from "@/lib/tramites/dia-de-etapa";
import {
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO_SOLICITUD,
  esEtapaDeTrabajo,
  textoResponsables,
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
function textoDia(t: DetalleTramite, ahora: Date): string | null {
  const r = diaDeEtapa({ etapa: t.etapa, venceEn: t.venceEn, entrada: entradaDeEtapa(t.eventos, t.creadoEn) }, ahora, zonaHoraria());
  return r ? `día ${r.dia} de ${r.total}` : null;
}

export function EncabezadoTramite({ tramite: t, ahora }: { tramite: DetalleTramite; ahora: Date }) {
  const descripcion = [
    textoVersion(t.tipo, t.etapa, t.versionNumero),
    `Solicitud ${t.numero}`,
    ETIQUETA_TIPO_SOLICITUD[t.tipo],
    `Motivo: ${ETIQUETA_MOTIVO[t.motivo].toLowerCase()}`,
    t.responsables.length > 0 ? `Responsable: ${textoResponsables(t.responsables)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const dia = textoDia(t, ahora);

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
      tituloEnfocable
      descripcion={descripcion}
    />
  );
}
