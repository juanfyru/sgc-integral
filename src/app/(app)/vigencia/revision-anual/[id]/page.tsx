import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InformeEnPantalla } from "@/componentes/vigencia/revision/InformeEnPantalla";
import { lineaDeRevision } from "@/componentes/vigencia/revision/PanelAdmin";
import { SeccionProceso } from "@/componentes/vigencia/revision/SeccionProceso";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerSql } from "@/db/cliente";
import { datosDelInforme, informeCongelado, obtenerRevision } from "@/db/consultas/vigencia/revision-anual";
import { puedeVerInformeAnual, puedeVerRevisionAnual } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirVigencia } from "../../_comun";
import { seccionesDeProcesos } from "../_datos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Revisión anual" };

const RUTA = "/vigencia/revision-anual";
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Una revisión anual: la cerrada con su informe congelado o la abierta con el informe parcial de hoy (spec 13C §9.5,
 * resolución 3 de la Tarea 11). El informe completo nombra documentos restringidos: lo ven el Admin SGC, Gerencia y
 * Control Interno (`puedeVerInformeAnual`), con el PDF de la cerrada. El líder ve la sección de sus procesos, de
 * `obtenerRevision`, sin botones. Para los demás, la revisión no existe.
 */
export default async function PaginaDeRevision({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  await exigirVigencia(sesion);
  if (!puedeVerRevisionAnual(sesion)) notFound();
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  const ahora = new Date();
  const zona = zonaHoraria();
  const revision = await obtenerRevision(Number(id), sesion, { ahora });
  if (!revision) notFound();
  const abierta = revision.estado === "abierta";
  const verInforme = puedeVerInformeAnual(sesion);

  const migas = [{ nombre: "Vigencia", href: "/vigencia" }, { nombre: "Revisión anual", href: RUTA }, { nombre: String(revision.anio) }];
  const descripcion =
    abierta || !revision.cerradaEn
      ? lineaDeRevision(revision, ahora, zona, verInforme)
      : `Abierta el ${textoFecha(revision.abiertaEn, zona)} y cerrada el ${textoFecha(revision.cerradaEn, zona)} por ${revision.cerradaPor ?? "—"}`;
  // El informe parcial es el institucional; el líder ve aquí sus secciones de la revisión abierta, no un informe.
  const insignia = abierta ? (
    <Insignia variante="atencion">{verInforme ? "Abierta · informe parcial" : "Abierta"}</Insignia>
  ) : (
    <Insignia variante="neutra">Cerrada</Insignia>
  );

  if (verInforme) {
    const informe = abierta ? await datosDelInforme(obtenerSql(), revision.id, ahora) : await informeCongelado(revision.id);
    if (!informe) notFound();
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <EncabezadoPagina
          migas={migas}
          titulo={`Revisión anual ${revision.anio}`}
          insignias={insignia}
          descripcion={descripcion}
          acciones={
            abierta ? (
              <Link href={RUTA} className={`${claseBoton("secundario")} ${FOCO}`}>
                Volver a la campaña
              </Link>
            ) : (
              <a href={`${RUTA}/${revision.id}/informe`} className={`${claseBoton("primario")} ${FOCO}`}>
                Informe en PDF
              </a>
            )
          }
        />
        <InformeEnPantalla informe={informe} parcial={abierta} />
      </div>
    );
  }

  // El líder: la sección de sus procesos, con sus cifras (resolución 3); se decide en la pestaña, no aquí.
  const secciones = await seccionesDeProcesos(sesion, revision, revision.procesos, { decidir: false });
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={migas}
        titulo={`Revisión anual ${revision.anio}`}
        insignias={insignia}
        descripcion={descripcion}
        acciones={
          abierta ? (
            <Link href={RUTA} className={`${claseBoton("secundario")} ${FOCO}`}>
              Volver a la campaña
            </Link>
          ) : undefined
        }
      />
      {secciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguno de sus procesos estuvo en esta revisión.</p>
      ) : null}
      {secciones.map((s) => (
        <SeccionProceso
          key={s.proceso.id}
          revision={{ id: revision.id, anio: revision.anio, abierta: false }}
          proceso={s.proceso}
          filas={s.filas}
          normas={s.normas}
          ahora={ahora}
          pideCodigo={sesion.totpActivo}
          volver={RUTA}
        />
      ))}
    </div>
  );
}
