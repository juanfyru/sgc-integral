import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AbrirCambio, FormularioFicha } from "@/componentes/indicadores/ficha/FormularioFicha";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { fichaParaEditar, opcionesDeFicha } from "@/db/consultas/indicadores/fichas";
import type { EstadoVersion } from "@/lib/indicadores/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaHoraLocal } from "@/lib/zona-horaria";
import { exigirIndicador } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar ficha de indicador" };

const ESTADO_VERSION: Record<EstadoVersion, string> = {
  borrador: "Borrador",
  por_aprobar: "Por aprobar",
  aprobada: "Aprobada",
  descartada: "Descartada",
};

/**
 * La ficha de un indicador para quien administra (spec §7.6 y §12.4): el borrador se edita con el formulario; sobre una
 * ficha aprobada, «Abrir un cambio» crea el borrador con su contenido. Para los demás, «no encontrada».
 */
export default async function PaginaEditarFicha({ params }: { params: Promise<{ codigo: string }> }) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "indicadores.administrar")) notFound();
  const { codigo } = await params;
  const indicador = await exigirIndicador(sesion, codigo);
  const ficha = await fichaParaEditar(sesion, indicador.codigo);
  if (!ficha) notFound();

  const encabezado = (descripcion: string) => (
    <EncabezadoPagina
      migas={[{ nombre: "Indicadores", href: "/indicadores" }, { nombre: indicador.codigo }]}
      codigo={indicador.codigo}
      insignias={<Insignia variante={ficha.estado === "borrador" ? "atencion" : "neutra"}>{`${ESTADO_VERSION[ficha.estado]} · versión ${ficha.numero}`}</Insignia>}
      titulo={ficha.contenido.nombre ?? indicador.codigo}
      descripcion={descripcion}
    />
  );

  if (ficha.estado === "borrador") {
    const opciones = await opcionesDeFicha(sesion, { actuales: ficha.valores });
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {encabezado(
          `${ficha.vigente ? "Cambio sobre la ficha aprobada" : "Ficha nueva"}, guardado el ${fechaHoraLocal(ficha.actualizadoEn)}.`,
        )}
        <FormularioFicha
          opciones={opciones}
          valores={ficha.valores}
          edicion={{ versionId: ficha.versionId, cambio: ficha.vigente !== null, codigoFijo: indicador.estado !== "borrador" }}
        />
      </div>
    );
  }

  const puedeCambiar = ficha.estado === "aprobada" && indicador.estado === "activo";
  const texto =
    ficha.estado === "por_aprobar"
      ? "Esta versión está por aprobar: mientras tanto no se edita."
      : ficha.estado === "descartada"
        ? "La ficha se descartó: ya no admite cambios."
        : puedeCambiar
          ? "Esta es la ficha vigente. Un cambio abre un borrador con su contenido; al enviarlo, el sistema decide si es mayor o menor."
          : "El indicador está retirado: su ficha ya no cambia.";
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {encabezado(texto)}
      {puedeCambiar ? <AbrirCambio indicadorId={ficha.indicadorId} /> : null}
    </div>
  );
}
