import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { FormularioSolicitud } from "@/componentes/tramites/FormularioSolicitud";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { impactoPendiente } from "@/db/consultas/normograma/impactos";
import { datosParaSolicitar } from "@/db/consultas/tramites";
import { indiceDeRevisiones } from "@/db/consultas/vigencia/revision-anual";
import { alcanceProcesos, puedeVerImpacto, puedeVerRevisionAnual } from "@/lib/alcance";
import { exigirPermiso } from "@/lib/paginas";
import { MOTIVOS, TIPOS_SOLICITUD } from "@/lib/tramites/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva solicitud" };

const idDe = (v: string | string[] | undefined): number | undefined => (typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : undefined);

/**
 * La solicitud puede llegar prellenada (spec 13C §9.3 y §10.5, resolución 7 de la Tarea 11): `documento`, `tipo`,
 * `motivo` y `proceso` como valores iniciales; `revision` (la revisión anual abierta, sobre un documento, con la
 * justificación prellenada) e `impacto` (un impacto pendiente que la persona ve, de ese documento o, en una creación, de
 * ese proceso) como campos ocultos que `crearSolicitud` vuelve a validar, con su nota. Un valor que no existe, que la persona no ve o que no es de sus procesos se
 * ignora, sin decir cuál de las tres cosas pasó.
 */
export default async function PaginaNuevaSolicitud({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirPermiso("tramites.solicitar");
  const consulta = await searchParams;
  const datos = await datosParaSolicitar(sesion);
  const codigo = typeof consulta.documento === "string" ? consulta.documento.trim().toUpperCase() : "";
  const pedido = datos.documentos.find((d) => d.codigo === codigo);
  const elegido = pedido?.conTramite ? undefined : pedido;
  const sinProcesos = datos.procesos.length === 0 && datos.documentos.length === 0;

  // Con un documento, la solicitud es sobre él: modificarlo o eliminarlo; sin él, el tipo pedido.
  const tipoPedido = TIPOS_SOLICITUD.find((t) => t === consulta.tipo);
  const tipoInicial = elegido ? (tipoPedido === "eliminar" ? "eliminar" : "modificar") : tipoPedido;
  const motivoInicial = MOTIVOS.find((m) => m === consulta.motivo);
  const procesoPedido = idDe(consulta.proceso);
  const procesoInicialId = datos.procesos.find((p) => p.id === procesoPedido)?.id;

  // La revisión anual: la abierta, y solo para decidir sobre un documento de sus procesos.
  const revisionPedida = idDe(consulta.revision);
  const revision =
    revisionPedida !== undefined && elegido && puedeVerRevisionAnual(sesion)
      ? (await indiceDeRevisiones()).find((r) => r.id === revisionPedida && r.estado === "abierta")
      : undefined;

  // El impacto: pendiente, de quien lo ve, y del documento elegido o, en una creación, del proceso elegido.
  const impactoPedido = idDe(consulta.impacto);
  const candidato = impactoPedido === undefined ? null : await impactoPendiente(impactoPedido);
  const impacto =
    candidato &&
    puedeVerImpacto(sesion, candidato.procesoId, await alcanceProcesos(sesion)) &&
    (elegido ? candidato.documentoId === elegido.id : tipoInicial === "crear" && candidato.documentoId === null && candidato.procesoId === procesoInicialId)
      ? candidato
      : null;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Trámites", href: "/tramites" }, { nombre: "Nueva solicitud" }]}
        titulo="Nueva solicitud"
        descripcion="Pida crear, modificar o eliminar un documento del sistema"
      />
      {pedido?.conTramite ? (
        <p role="note" className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-4 py-3 text-sm text-estado-atencion-texto">
          {`${pedido.codigo} ya tiene un trámite abierto: no admite otra solicitud hasta que ese se cierre.`}
        </p>
      ) : null}
      {/* El mismo aviso si no existe, si no se ve o si es de otro proceso: la dirección no revela cuál de las tres es. */}
      {codigo && !pedido ? (
        <p role="note" className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-4 py-3 text-sm text-estado-atencion-texto">
          No puede pedir un cambio sobre ese documento: solo sobre los documentos vigentes de sus procesos.
        </p>
      ) : null}
      {sinProcesos ? (
        <EstadoVacio
          icono={ClipboardList}
          titulo="No tiene procesos asignados"
          texto="Para pedir un cambio debe liderar al menos un proceso activo. Pídalo al Administrador del SGC."
        />
      ) : (
        <FormularioSolicitud
          {...datos}
          documentoInicialId={elegido?.id}
          tipoInicial={tipoInicial}
          motivoInicial={motivoInicial}
          procesoInicialId={procesoInicialId}
          revisionAnual={revision ? { id: revision.id, anio: revision.anio } : undefined}
          impacto={impacto ? { id: impacto.id, norma: impacto.norma, proceso: impacto.proceso, deProceso: impacto.documentoId === null } : undefined}
        />
      )}
    </div>
  );
}
