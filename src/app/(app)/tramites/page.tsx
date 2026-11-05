import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { TablaTramites } from "@/componentes/tramites/TablaTramites";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { listarTramites } from "@/db/consultas/tramites";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trámites" };

const PESTANAS = [
  {
    clave: "por_hacer",
    etiqueta: "Por hacer",
    vacioTitulo: "No tiene pasos pendientes",
    vacioTexto: "Cuando un trámite espere algo de usted, aparecerá aquí y en Mis tareas.",
  },
  {
    clave: "en_curso",
    etiqueta: "En curso",
    vacioTitulo: "No hay trámites en curso",
    vacioTexto: "Aquí aparecen los trámites abiertos en los que participa o que son de sus procesos.",
  },
  {
    clave: "cerrados",
    etiqueta: "Cerrados",
    vacioTitulo: "No hay trámites cerrados",
    vacioTexto: "Aquí aparecen los trámites publicados, eliminados, rechazados y cancelados que puede ver.",
  },
] as const;

export default async function PaginaTramites({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { pestana: pedida } = await searchParams;
  const activa = PESTANAS.find((p) => p.clave === pedida) ?? PESTANAS[0];
  const puedePedir = puede(sesion, "tramites.solicitar");

  const [porHacer, enCurso] = await Promise.all([
    listarTramites(sesion, "por_hacer"),
    listarTramites(sesion, "en_curso"),
  ]);
  const cuantos = { por_hacer: porHacer.length, en_curso: enCurso.length };
  const tramites =
    activa.clave === "por_hacer" ? porHacer : activa.clave === "en_curso" ? enCurso : await listarTramites(sesion, "cerrados");

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Trámites"
        descripcion="Solicitudes de creación, modificación y eliminación de documentos"
        acciones={
          puedePedir ? (
            <Link href="/tramites/nueva" className={claseBoton("primario")}>
              Nueva solicitud
            </Link>
          ) : undefined
        }
      />

      <nav aria-label="Bandejas de trámites">
        <ul className="flex list-none flex-wrap gap-1 border-b border-border">
          {PESTANAS.map((p) => {
            const esActiva = p.clave === activa.clave;
            const cuenta = p.clave === "cerrados" ? null : cuantos[p.clave];
            return (
              <li key={p.clave} className="-mb-px">
                <Link
                  href={`/tramites?pestana=${p.clave}`}
                  aria-current={esActiva ? "page" : undefined}
                  className={`inline-block rounded-t-md border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${
                    esActiva
                      ? "border-marca font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cuenta === null ? p.etiqueta : `${p.etiqueta} (${cuenta})`}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tramites.length === 0 ? (
        <EstadoVacio
          icono={ClipboardList}
          titulo={activa.vacioTitulo}
          texto={activa.vacioTexto}
          accion={puedePedir ? { href: "/tramites/nueva", etiqueta: "Nueva solicitud" } : undefined}
        />
      ) : (
        <TablaTramites tramites={tramites} ahora={new Date()} />
      )}
    </div>
  );
}
