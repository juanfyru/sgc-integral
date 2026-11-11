import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DescartarCambio, DialogoEnviar } from "@/componentes/indicadores/ficha/DialogoEnviar";
import { AbrirCambio, FormularioFicha } from "@/componentes/indicadores/ficha/FormularioFicha";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { desdePeriodo, etiquetaDePeriodo, previaDeEnvio } from "@/db/consultas/indicadores/aprobacion";
import { fichaParaEditar, opcionesDeFicha } from "@/db/consultas/indicadores/fichas";
import type { EstadoVersion } from "@/lib/indicadores/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaHoraLocal } from "@/lib/zona-horaria";
import { exigirIndicador, rutaDeIndicador } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar ficha de indicador" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const ESTADO_VERSION: Record<EstadoVersion, string> = {
  borrador: "Borrador",
  por_aprobar: "Por aprobar",
  aprobada: "Aprobada",
  descartada: "Descartada",
};

/**
 * La ficha de un indicador para quien administra (spec §7.6 y §12.4): el borrador se edita con el formulario y se envía
 * con su clave; sobre una ficha aprobada, «Abrir un cambio» crea el borrador con su contenido. Para los demás, «no
 * encontrada».
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
      migas={[
        { nombre: "Indicadores", href: "/indicadores" },
        { nombre: indicador.codigo, href: rutaDeIndicador(indicador.codigo) },
        { nombre: "Editar ficha" },
      ]}
      codigo={indicador.codigo}
      insignias={<Insignia variante={ficha.estado === "borrador" ? "atencion" : "neutra"}>{`${ESTADO_VERSION[ficha.estado]} · versión ${ficha.numero}`}</Insignia>}
      titulo={ficha.contenido.nombre ?? indicador.codigo}
      descripcion={descripcion}
      tituloEnfocable
    />
  );

  if (ficha.estado === "borrador") {
    const [opciones, previa] = await Promise.all([opcionesDeFicha(sesion, { actuales: ficha.valores }), previaDeEnvio(sesion, ficha.versionId)]);
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {encabezado(
          `${ficha.vigente ? "Cambio sobre la ficha aprobada" : "Ficha nueva"}, guardado el ${fechaHoraLocal(ficha.actualizadoEn)}.`,
        )}
        {previa?.notaDevolucion ? (
          <p className="flex flex-wrap items-center gap-2 rounded-md border border-l-4 border-border border-l-mod-indicadores bg-muted px-3 py-2 text-sm">
            <Insignia variante="atencion">Devuelta</Insignia>
            {`Nota de quien la devolvió: ${previa.notaDevolucion}`}
          </p>
        ) : null}
        <FormularioFicha
          opciones={opciones}
          valores={ficha.valores}
          edicion={{ versionId: ficha.versionId, cambio: ficha.vigente !== null, codigoFijo: indicador.estado !== "borrador" }}
        />
        {previa ? (
          <section aria-labelledby="ficha-enviar" className="flex min-w-0 flex-col gap-3 border-t border-border pt-6">
            <h2 id="ficha-enviar" className="text-lg font-semibold">
              {previa.tipo === "menor" ? "Publicar el cambio" : "Enviar a aprobación"}
            </h2>
            <div className="flex flex-wrap items-start gap-3">
              <DialogoEnviar
                envio={{
                  versionId: previa.versionId,
                  codigo: indicador.codigo,
                  nombre: ficha.contenido.nombre ?? indicador.codigo,
                  numero: previa.numero,
                  tipo: previa.tipo,
                  cambios: previa.cambios,
                  huella: previa.huella,
                  probada: previa.probada,
                  motivo: previa.motivo,
                  rigeDesde: previa.rigeDesde ? etiquetaDePeriodo(previa.rigeDesde) : null,
                  rige: previa.rige,
                  enviableDesde: previa.enviableDesde ? desdePeriodo(previa.enviableDesde) : null,
                  guardado: fechaHoraLocal(ficha.actualizadoEn),
                }}
                pideCodigo={sesion.totpActivo}
              />
              {ficha.vigente ? <DescartarCambio versionId={ficha.versionId} volver={rutaDeIndicador(indicador.codigo)} /> : null}
            </div>
          </section>
        ) : null}
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
      <p>
        <Link href={rutaDeIndicador(indicador.codigo)} className={`rounded-sm text-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
          Ver la ficha técnica
        </Link>
      </p>
    </div>
  );
}
