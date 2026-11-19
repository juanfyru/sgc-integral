import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, FileSpreadsheet, Plus } from "lucide-react";
import { FiltrosDeHallazgos } from "@/componentes/mejoramiento/FiltrosDeHallazgos";
import { ListaDeHallazgos } from "@/componentes/mejoramiento/ListaDeHallazgos";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { contarMisActividades } from "@/db/consultas/mejoramiento/actividades";
import { listarHallazgos, veAlgunHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { veAlgunPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { contarReportesPorClasificar } from "@/db/consultas/mejoramiento/reportes";
import { rutaDeReportar } from "@/lib/mejoramiento/reportes";
import { adondeVaSinLista } from "@/lib/mejoramiento/rutas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { consultaDeFiltro, filtroDeConsulta } from "@/lib/mejoramiento/filtro";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mejoramiento" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

function CifraEnlazada({ href, ...cifra }: { href: string; etiqueta: string; valor: number; estado?: "atencion" | "critico" }) {
  return (
    <Link href={href} className={`block rounded-lg ${FOCO}`}>
      <TarjetaCifra {...cifra} />
    </Link>
  );
}

/**
 * «Mejoramiento» (spec 15 §16.1, maqueta 1): las cifras de lo que ve la persona (cada una lleva a su filtro), los filtros (un
 * formulario `GET`; un valor que no se entiende se ignora) y la lista. Qué hallazgos ve cada persona lo decide
 * `filtroHallazgos`. Se quedan quien ve alguno y, aunque no vea ninguno, quien registra o ve todos (un estado vacío); los demás
 * van, sin saber si existen otros, a «Mis actividades» si tienen alguna y si no a «Mis reportes» (`adondeVaSinLista`, la misma
 * regla de la pestaña «Hallazgos»).
 */
export default async function PaginaMejoramiento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  const veAlgo = await veAlgunHallazgo(sesion);
  if (!veAlgo) {
    const destino = adondeVaSinLista(sesion, { veHallazgos: false, tieneActividades: (await contarMisActividades(sesion)) > 0 });
    if (destino) redirect(destino);
  }
  const filtro = filtroDeConsulta(await searchParams);
  const ahora = new Date();
  const [{ filas, cifras }, procesos, contexto, porClasificar, vePlanes] = await Promise.all([
    listarHallazgos(sesion, filtro, { ahora }),
    procesosDelAlcance(sesion),
    contextoDeMejora(obtenerSql(), ahora),
    contarReportesPorClasificar(sesion),
    veAlgunPlan(sesion),
  ]);
  const registra = puede(sesion, "mejora.registrar");
  // El Excel lleva los filtros puestos (spec §16.3); es una descarga auditada: un enlace simple, sin precarga.
  const consulta = consultaDeFiltro(filtro);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo="Mejoramiento"
        descripcion={
          veAlgo
            ? `${cuenta(filas.length, "hallazgo", "hallazgos")} · cada uno dice en qué va y quién tiene el turno.`
            : "Hallazgos, planes de acción y su seguimiento."
        }
        acciones={
          veAlgo || registra ? (
            <>
              {veAlgo ? (
                <a href={`/mejoramiento/excel${consulta ? `?${consulta}` : ""}`} className={`${claseBoton("secundario")} ${FOCO}`}>
                  <FileSpreadsheet aria-hidden="true" className="size-4" />
                  Excel
                </a>
              ) : null}
              {registra ? (
                <Link href="/mejoramiento/nuevo" className={`${claseBoton("primario")} ${FOCO}`}>
                  <Plus aria-hidden="true" className="size-4" />
                  Registrar hallazgo
                </Link>
              ) : null}
            </>
          ) : null
        }
      />
      <PestanasMejoramiento activa="hallazgos" visibles={pestanasVisibles(sesion, { veHallazgos: veAlgo, vePlanes })} numeros={{ reportes: porClasificar }} />
      {veAlgo ? (
        <>
          <section aria-label="Cifras de los hallazgos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <CifraEnlazada href="/mejoramiento?estado=abiertos" etiqueta="Abiertos" valor={cifras.abiertos} />
            <CifraEnlazada
              href="/mejoramiento?vencidos=1"
              etiqueta="Con algo vencido"
              valor={cifras.conAlgoVencido}
              estado={cifras.conAlgoVencido > 0 ? "critico" : undefined}
            />
            <CifraEnlazada
              href="/mejoramiento?decision=1"
              etiqueta="Esperan su decisión"
              valor={cifras.esperanSuDecision}
              estado={cifras.esperanSuDecision > 0 ? "atencion" : undefined}
            />
            <CifraEnlazada href="/mejoramiento?estado=en_espera" etiqueta="En espera de eficacia" valor={cifras.enEspera} />
            <CifraEnlazada
              href="/mejoramiento?estado=por_evaluar"
              etiqueta="Por evaluar la eficacia"
              valor={cifras.porEvaluar}
              estado={cifras.porEvaluar > 0 ? "atencion" : undefined}
            />
            <CifraEnlazada href="/mejoramiento?estado=reabiertos" etiqueta="Reabiertos" valor={cifras.reabiertos} />
          </section>
          <FiltrosDeHallazgos filtro={filtro} procesos={procesos} />
          <ListaDeHallazgos filas={filas} contexto={contexto} />
        </>
      ) : (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="Aún no hay hallazgos a la vista"
          texto="Cuando se registre un hallazgo que le corresponda, aparecerá aquí con en qué va y quién tiene el turno."
          accion={
            registra
              ? { href: "/mejoramiento/nuevo", etiqueta: "Registrar hallazgo" }
              : { href: rutaDeReportar(), etiqueta: "Reportar una posible no conformidad" }
          }
        />
      )}
    </div>
  );
}
