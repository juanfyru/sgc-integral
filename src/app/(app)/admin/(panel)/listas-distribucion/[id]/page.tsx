import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { alternarListaAccion, editarListaAccion } from "@/app/admin/acciones-listas";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { FormularioLista } from "@/componentes/distribucion/listas/FormularioLista";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerLista, opcionesFormularioLista } from "@/db/consultas/distribucion/listas";
import { exigirPermiso } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lista de distribución — Administración SGC" };

export default async function PaginaLista({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermiso("distribucion.gestionar");
  const id = Number((await params).id);
  const lista = Number.isInteger(id) && id > 0 ? await obtenerLista(id) : null;
  if (!lista) notFound();
  const opciones = await opcionesFormularioLista();
  const n = lista.resueltas.length;
  return (
    <div>
      <EncabezadoPagina
        titulo={lista.nombre}
        migas={[{ nombre: "Listas de distribución", href: "/admin/listas-distribucion" }, { nombre: lista.nombre }]}
        insignias={<Insignia variante={lista.activa ? "bien" : "sin-dato"}>{lista.activa ? "Activa" : "Inactiva"}</Insignia>}
      />
      <div className="flex flex-col gap-8">
        <FormularioLista
          accion={editarListaAccion}
          id={lista.id}
          opciones={opciones}
          valores={{ nombre: lista.nombre, descripcion: lista.descripcion, miembros: lista.miembros }}
        />
        <section aria-labelledby="titulo-resuelve" className="flex max-w-2xl flex-col gap-2">
          <h2 id="titulo-resuelve" className="font-display text-lg font-semibold">
            Resuelve hoy a {n} {n === 1 ? "persona" : "personas"}
          </h2>
          {n === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna persona activa coincide con los miembros de esta lista.</p>
          ) : (
            <ul className="columns-1 gap-6 text-sm sm:columns-2">
              {lista.resueltas.map((p) => (
                <li key={p.id}>{p.nombre}</li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="titulo-estado" className="flex max-w-lg flex-col gap-3">
          <h2 id="titulo-estado" className="font-display text-lg font-semibold">Estado</h2>
          <FormAccion
            accion={alternarListaAccion}
            etiqueta={lista.activa ? "Desactivar" : "Activar"}
            confirmacion={lista.activa ? "Dejará de llegar a las personas de esta lista, en los documentos que la tienen asignada." : undefined}
            campos={{ id: lista.id, activo: String(!lista.activa) }}
            tono={lista.activa ? "peligro" : "primario"}
          />
        </section>
      </div>
    </div>
  );
}
