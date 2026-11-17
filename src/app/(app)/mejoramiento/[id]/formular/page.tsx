import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  guardarAnalisisAccion,
  guardarCausasAccion,
  quitarAnalisisAccion,
  responderPreguntasAccion,
} from "@/app/acciones-mejoramiento";
import { ArchivosDe } from "@/componentes/mejoramiento/ArchivosDe";
import { CausasRaiz } from "@/componentes/mejoramiento/analisis/CausasRaiz";
import { LaVezPasada } from "@/componentes/mejoramiento/analisis/LaVezPasada";
import { PestanasDeMetodo } from "@/componentes/mejoramiento/analisis/PestanasDeMetodo";
import { PreguntasDeCierre } from "@/componentes/mejoramiento/analisis/PreguntasDeCierre";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { laVezPasada, puedeFormular } from "@/db/consultas/mejoramiento/analisis";
import { archivosDe, archivosQuitables, autorizarSubida } from "@/db/consultas/mejoramiento/archivos";
import { exigirSesion } from "@/lib/paginas";
import { exigirHallazgo, rutaDeFormular, rutaDeHallazgo } from "../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Formular el análisis y el plan" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Formular la causa raíz y el plan de un hallazgo (spec 15 §8.6, §9 y §16.2, maqueta 4). Solo quien actúa por el proceso y
 * solo con el hallazgo «Por formular»: para cualquier otra persona, o en otro estado, no existe. Dos pestañas: «Causa raíz»
 * (una pestaña por método, y a la derecha lo común: las causas raíz y las dos preguntas de cierre) y «Plan de acción».
 */
export default async function PaginaFormular({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pestana?: string }>;
}) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const { pestana } = await searchParams;
  const h = await exigirHallazgo(sesion, id);
  const sql = obtenerSql();
  if (h.ve !== "completo" || h.estado !== "por_formular" || !(await puedeFormular(sql, sesion, { procesoId: h.procesoId }))) notFound();
  const ronda = h.rondas.find((r) => r.numero === h.ronda);
  if (!ronda) notFound();

  const dueno = { contexto: "mejora_ronda", contextoId: ronda.id } as const;
  const analisis = (await archivosDe(sql, sesion, dueno)).filter((a) => a.rol === "analisis");
  const puedeSubir = (await autorizarSubida(sesion, { contexto: "mejora_ronda", id: ronda.id, rol: "analisis" })).ok;
  const quitables = await archivosQuitables(sql, sesion, analisis, dueno);
  const anterior = h.reincidenteDe && "id" in h.reincidenteDe ? await laVezPasada(sql, h.id) : null;
  const opcional = h.clase !== "no_conformidad";
  const verPlan = pestana === "plan";

  const pestanas = [
    { clave: "causa", etiqueta: "Causa raíz", href: rutaDeFormular(h.id), activa: !verPlan },
    { clave: "plan", etiqueta: "Plan de acción", href: `${rutaDeFormular(h.id)}?pestana=plan`, activa: verPlan },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: h.codigo, href: rutaDeHallazgo(h.id) }, { nombre: "Formular" }]}
        codigo={h.codigo}
        titulo="Formular el análisis y el plan"
        descripcion={`${h.titulo} · ${h.proceso}`}
      />
      <nav aria-label="Partes de la formulación">
        <ul className="flex list-none flex-wrap gap-1 border-b border-border">
          {pestanas.map((p) => (
            <li key={p.clave} className="-mb-px">
              <Link
                href={p.href}
                aria-current={p.activa ? "page" : undefined}
                className={`inline-block rounded-t-md border-b-2 px-3 py-2 text-sm ${FOCO} ${
                  p.activa ? "border-mod-planes font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {verPlan ? (
        <section aria-labelledby="plan-titulo" className="rounded-lg border border-border bg-card p-4">
          <h2 id="plan-titulo" className="font-display text-base font-semibold">
            Plan de acción
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">El plan de acción llega con la siguiente parte de la formulación.</p>
        </section>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-labelledby="analisis-titulo" className="flex min-w-0 flex-col gap-3">
            <h2 id="analisis-titulo" className="font-display text-base font-semibold">
              Análisis de la causa raíz
            </h2>
            {opcional ? (
              <p className="text-sm text-muted-foreground">El análisis es opcional en esta clase de hallazgo.</p>
            ) : null}
            <PestanasDeMetodo
              hallazgoId={h.id}
              analisis={ronda.analisis.map((a) => ({
                id: a.id,
                metodo: a.metodo,
                equipo: a.equipo,
                observaciones: a.observaciones,
                contenido: a.contenido,
              }))}
              guardar={guardarAnalisisAccion}
              quitar={quitarAnalisisAccion}
              adjuntos={
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <h3 className="text-sm font-semibold">Adjuntos del análisis</h3>
                  <ArchivosDe
                    archivos={analisis}
                    quitables={quitables}
                    direccionDeSubida={puedeSubir ? `/api/mejoramiento/rondas/${ronda.id}/archivos?rol=analisis` : null}
                    nombre="Zona de carga de los adjuntos del análisis"
                    vacio="Sin adjuntos del análisis."
                  />
                </div>
              }
            />
          </section>
          <div className="flex min-w-0 flex-col gap-4">
            {anterior ? <LaVezPasada codigo={anterior.codigo} causas={anterior.causas} acciones={anterior.acciones} /> : null}
            <CausasRaiz key={`causas-${ronda.causas.map((c) => c.id).join("-")}`} hallazgoId={h.id} causas={ronda.causas} guardar={guardarCausasAccion} />
            <PreguntasDeCierre
              hallazgoId={h.id}
              respuestas={{ similares: ronda.similares, similaresDetalle: ronda.similaresDetalle, cambios: ronda.cambios }}
              guardar={responderPreguntasAccion}
            />
          </div>
        </div>
      )}
    </div>
  );
}
