import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import { FiltrosDeHallazgos } from "@/componentes/mejoramiento/FiltrosDeHallazgos";
import { ListaDeHallazgos } from "@/componentes/mejoramiento/ListaDeHallazgos";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { misActividades } from "@/db/consultas/mejoramiento/actividades";
import { listarHallazgos, veAlgunHallazgoCompleto } from "@/db/consultas/mejoramiento/lectura";
import { procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { filtroDeConsulta } from "@/lib/mejoramiento/filtro";

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
 * «Mejoramiento» (spec 15 §16.1, maqueta 1), para toda persona con sesión: las cifras de lo que ve (cada una lleva a su
 * filtro), los filtros (un formulario `GET`; un valor que no se entiende se ignora) y la lista. Qué hallazgos ve cada
 * persona lo decide `filtroHallazgos`; quien no ve ninguno recibe un estado vacío, sin saber si existen otros. Quien no ve
 * ninguno completo y tiene alguna actividad va a «Mis actividades» (spec §16.1): lo que ve, lo ve desde sus actividades.
 */
export default async function PaginaMejoramiento({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  if (!(await veAlgunHallazgoCompleto(sesion)) && (await misActividades(sesion)).length > 0) redirect("/mejoramiento/actividades");
  const filtro = filtroDeConsulta(await searchParams);
  const ahora = new Date();
  const [{ filas, cifras }, procesos, contexto] = await Promise.all([
    listarHallazgos(sesion, filtro, { ahora }),
    procesosDelAlcance(sesion),
    contextoDeMejora(obtenerSql(), ahora),
  ]);
  const filtrada = Object.keys(filtro).length > 0;
  const registra = puede(sesion, "mejora.registrar");
  const veAlgo = filas.length > 0 || filtrada;

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
          registra ? (
            <Link href="/mejoramiento/nuevo" className={`${claseBoton("primario")} ${FOCO}`}>
              <Plus aria-hidden="true" className="size-4" />
              Registrar hallazgo
            </Link>
          ) : null
        }
      />
      <PestanasMejoramiento activa="hallazgos" visibles={pestanasVisibles(sesion, { veHallazgos: veAlgo })} />
      {!veAlgo ? (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="No tiene hallazgos a la vista"
          texto="Cuando un hallazgo de mejoramiento le corresponda, aparecerá aquí. Si usted ve una posible no conformidad, puede reportarla."
          accion={{ href: "/mejoramiento/reportar", etiqueta: "Reportar una posible no conformidad" }}
        />
      ) : (
        <>
          <section aria-label="Cifras de los hallazgos" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
            <CifraEnlazada href="/mejoramiento?estado=reabiertos" etiqueta="Reabiertos" valor={cifras.reabiertos} />
          </section>
          <FiltrosDeHallazgos filtro={filtro} procesos={procesos} />
          <ListaDeHallazgos filas={filas} contexto={contexto} />
        </>
      )}
    </div>
  );
}
