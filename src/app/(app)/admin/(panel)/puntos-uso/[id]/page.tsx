import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alternarPuntoUsoAccion, editarPuntoUsoAccion } from "@/app/admin/acciones-puntos-uso";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { FormularioPuntoUso } from "@/componentes/distribucion/puntos/FormularioPuntoUso";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerSql } from "@/db/cliente";
import { copiasVivasDePunto, obtenerPuntoUso, opcionesFormularioPunto } from "@/db/consultas/distribucion/puntos-uso";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { ETIQUETA_ESTADO_COPIA } from "@/lib/distribucion/tipos";
import { exigirPermiso } from "@/lib/paginas";
import { cuenta } from "@/lib/plural";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Punto de uso — Administración SGC" };

export default async function PaginaPuntoUso({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("distribucion.gestionar");
  const id = Number((await params).id);
  const punto = Number.isInteger(id) && id > 0 ? await obtenerPuntoUso(id, sesion) : null;
  if (!punto) notFound();
  const [opciones, vivas] = await Promise.all([opcionesFormularioPunto(), copiasVivasDePunto(obtenerSql(), punto.id)]);
  return (
    <div>
      <EncabezadoPagina
        titulo={punto.nombre}
        migas={[{ nombre: "Puntos de uso", href: "/admin/puntos-uso" }, { nombre: punto.nombre }]}
        insignias={<Insignia variante={punto.activo ? "bien" : "sin-dato"}>{punto.activo ? "Activo" : "Inactivo"}</Insignia>}
        descripcion={`${cuenta(punto.copiasVivas, "copia", "copias")} por recibir, en uso o por recoger.`}
      />
      <div className="flex flex-col gap-8">
        <FormularioPuntoUso
          accion={editarPuntoUsoAccion}
          id={punto.id}
          opciones={opciones}
          valores={{
            nombre: punto.nombre,
            sede: punto.sede,
            ubicacion: punto.ubicacion,
            responsableId: punto.responsable.id,
            procesoIds: punto.procesos.map((p) => p.id),
          }}
        />
        <section aria-labelledby="titulo-estado" className="flex max-w-lg flex-col gap-3">
          <h2 id="titulo-estado" className="font-display text-lg font-semibold">Estado</h2>
          {punto.activo && vivas.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {`No se puede desactivar mientras tenga ${cuenta(vivas.length, "copia viva", "copias vivas")}: ${
                  vivas.length === 1 ? "recójala o anúlela" : "recójalas o anúlelas"
                } desde su página.`}
              </p>
              <ul className="flex list-none flex-col gap-1 text-sm">
                {vivas.map((c) => (
                  <li key={c.id}>
                    <Link href={`/distribucion/copias/${c.id}`} className="font-medium text-marca underline underline-offset-2">
                      {`${c.codigo} v${c.version} · Copia N.º ${numeroDeCopia(c.numero)}`}
                    </Link>
                    {` · ${ETIQUETA_ESTADO_COPIA[c.estado]}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <FormAccion
            accion={alternarPuntoUsoAccion}
            etiqueta={punto.activo ? "Desactivar" : "Activar"}
            confirmacion={punto.activo ? "No podrá recibir copias nuevas. Debe estar sin copias por recibir o por recoger." : undefined}
            campos={{ id: punto.id, activo: String(!punto.activo) }}
            tono={punto.activo ? "peligro" : "primario"}
          />
        </section>
      </div>
    </div>
  );
}
