import type { Metadata } from "next";
import { paraReportar } from "@/componentes/indicadores/datos/comun";
import { FichaDelDato } from "@/componentes/indicadores/datos/FichaDelDato";
import { BorrarDato, EditarDato, EstadoDelDato, ResponsablesDelDato } from "@/componentes/indicadores/datos/FormularioDato";
import { HistorialDelDato } from "@/componentes/indicadores/datos/HistorialDelDato";
import { ReportarDato } from "@/componentes/indicadores/datos/ReportarDato";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { datoBorrable, indicadoresQueLoUsan, opcionesDeDato, pestanaDeDatos } from "@/db/consultas/indicadores/datos";
import { asegurarPeriodosDeDatos, historialesDeDato, periodosDeDato } from "@/db/consultas/indicadores/datos-periodos";
import { soportesDeDato } from "@/db/consultas/indicadores/datos-soporte";
import { reaperturaEnTexto, type ReaperturaEnTexto } from "@/db/consultas/indicadores/reapertura";
import { puedeReportarDato } from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import { exigirDato } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dato compartido" };

/**
 * La página de un dato compartido (anexo 14C, §4.4 a §4.7, maqueta 12), para quien lo ve: reportar el periodo que se pide
 * más antiguo (quien responde por él), la ficha del dato, sus periodos con el antes y el después de cada corrección, sus
 * soportes y su historial. Quien administra edita el dato y sus responsables aquí mismo, lo activa o lo desactiva y, si no
 * tiene historia (`datoBorrable`: ninguna ficha lo cita y no tiene periodos), lo borra (lo que una ficha aprobada congela
 * va de solo lectura), y reabre un periodo cerrado, con la lista de lo que se reabre en
 * cascada, o cierra de nuevo uno reabierto. Antes de leer abre los periodos que se piden del dato. Para quien no lo ve, no
 * existe.
 */
export default async function PaginaDato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sesion, dato } = await exigirDato(id);
  await asegurarPeriodosDeDatos({ datoIds: [dato.id] });
  const administra = puede(sesion, "indicadores.administrar");
  const [periodos, historiales, soportes, usan, capacidad, pestana, opciones, borrable] = await Promise.all([
    periodosDeDato(sesion, dato.id),
    historialesDeDato(sesion, dato.id),
    soportesDeDato(sesion, dato.id),
    indicadoresQueLoUsan(sesion, [dato.id]),
    puedeReportarDato(dato.id, sesion),
    pestanaDeDatos(sesion),
    administra ? opcionesDeDato(dato) : null,
    // «Borrar el dato» solo se ofrece si el servidor lo va a aceptar, como «Borrar» en las dimensiones.
    administra ? datoBorrable(dato.id) : false,
  ]);
  const reporta = capacidad.puede && puede(sesion, "indicadores.medir");
  // Quien administra reabre un periodo cerrado (en cascada: el diálogo lista lo que se reabre, anexo 14C §3.5) y cierra de
  // nuevo uno reabierto.
  const reaperturas = new Map<number, ReaperturaEnTexto>();
  if (administra) {
    for (const p of (periodos ?? []).filter((x) => x.estado === "cerrado")) {
      const lista = await reaperturaEnTexto(sesion, { clase: "dato", periodoId: p.id });
      if (lista) reaperturas.set(p.id, lista);
    }
  }
  // Del más reciente al más viejo: el último que se pide es el más antiguo.
  const pedido = (periodos ?? []).filter((p) => p.sePide).at(-1) ?? null;
  const ahora = new Date();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo={dato.nombre}
        descripcion={`Dato compartido de ${dato.proceso}`}
        tituloEnfocable
        insignias={dato.activa ? undefined : <Insignia variante="sin-dato">Inactivo</Insignia>}
        acciones={
          opciones ? (
            <>
              <EditarDato dato={dato} opciones={opciones} />
              <ResponsablesDelDato dato={dato} usuarios={opciones.usuarios} />
              <EstadoDelDato dato={dato} />
              {borrable ? <BorrarDato dato={dato} /> : null}
            </>
          ) : null
        }
      />
      <PestanasIndicadores
        activa="datos"
        visibles={pestanasVisibles(sesion, { aprueba: apruebaFichas(sesion), veDatos: pestana.visible })}
        numeros={{ datos: pestana.porReportar }}
      />
      <div className={`grid min-w-0 grid-cols-1 gap-6 ${reporta && pedido ? "lg:grid-cols-2" : ""}`}>
        {reporta && pedido ? (
          <ReportarDato datoId={dato.id} periodo={paraReportar(pedido, ahora)} soportes={soportes?.get(pedido.id) ?? []} />
        ) : null}
        <section aria-labelledby="ficha-del-dato" className="flex min-w-0 flex-col gap-3">
          <h2 id="ficha-del-dato" className="text-base font-semibold">
            Ficha del dato
          </h2>
          <FichaDelDato dato={dato} usan={usan.get(dato.id) ?? []} />
        </section>
      </div>
      <section aria-labelledby="periodos-del-dato" className="flex min-w-0 flex-col gap-3">
        <h2 id="periodos-del-dato" className="text-base font-semibold">
          Periodos
        </h2>
        <HistorialDelDato
          datoId={dato.id}
          periodos={periodos ?? []}
          historiales={historiales ?? new Map()}
          soportes={soportes ?? new Map()}
          editable={reporta}
          administra={administra}
          reaperturas={reaperturas}
          ahora={ahora}
        />
      </section>
    </div>
  );
}
