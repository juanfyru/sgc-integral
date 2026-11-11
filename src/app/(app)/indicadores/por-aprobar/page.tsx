import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCheck } from "lucide-react";
import { ListaPorAprobar, type FilaPorAprobar } from "@/componentes/indicadores/ficha/ListaPorAprobar";
import { apruebaFichas, PestanasIndicadores, pestanasVisibles } from "@/componentes/indicadores/PestanasIndicadores";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos } from "@/componentes/ui/TablaDatos";
import { enlaceDeVersion, fichasEnCurso, fichasPorAprobar, type FichaEnCurso } from "@/db/consultas/indicadores/aprobacion";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaHoraLocal } from "@/lib/zona-horaria";
import { rutaDeEdicion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fichas por aprobar" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

const COLUMNAS_BORRADORES = [
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "nota", etiqueta: "Nota de quien la devolvió" },
  { clave: "fecha", etiqueta: "Guardado" },
];
const COLUMNAS_ENVIADAS = [
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "tipo", etiqueta: "Tipo" },
  { clave: "fecha", etiqueta: "Enviada" },
];

function Indicador({ f, href }: { f: FichaEnCurso; href: string }) {
  return (
    <>
      <span className="block font-mono text-xs text-muted-foreground">{f.codigo}</span>
      <Link href={href} className={ENLACE}>
        {f.nombre || f.codigo}
      </Link>
      <span className="block text-xs text-muted-foreground">{`${f.proceso} · versión ${f.numero}`}</span>
    </>
  );
}

/**
 * «Por aprobar» (spec §12.6): las fichas que la persona puede aprobar, en bloque con una clave o devolviéndolas una a
 * una; quien administra ve además los borradores, las devueltas con su nota y lo que espera aprobación. Para quien no
 * administra ni aprueba, «no encontrada».
 */
export default async function PaginaPorAprobar() {
  const sesion = await exigirSesion();
  const administra = puede(sesion, "indicadores.administrar");
  const aprueba = apruebaFichas(sesion);
  if (!administra && !aprueba) notFound();
  const [fichas, enCurso] = await Promise.all([fichasPorAprobar(sesion), fichasEnCurso(sesion)]);
  const filas: FilaPorAprobar[] = fichas.map((f) => ({
    versionId: f.versionId,
    codigo: f.codigo,
    nombre: f.nombre,
    proceso: f.proceso,
    numero: f.numero,
    tipoCambio: f.tipoCambio,
    cambios: f.cambios,
    motivo: f.motivo,
    elaboro: f.elaboro,
    enviada: fechaHoraLocal(f.enviadaEn),
    enlace: enlaceDeVersion(f.codigo, f.numero),
  }));
  const borradores = enCurso.filter((f) => f.estado === "borrador");
  const enviadas = enCurso.filter((f) => f.estado === "por_aprobar");

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        titulo="Indicadores"
        descripcion="Las fichas técnicas que esperan aprobación: se aprueban con su clave y se devuelven con una nota."
        tituloEnfocable
      />
      <PestanasIndicadores activa="por-aprobar" visibles={pestanasVisibles(sesion, { aprueba })} numeros={{ "por-aprobar": fichas.length }} />

      {aprueba ? (
        <section aria-labelledby="por-aprobar-suyas" className="flex min-w-0 flex-col gap-3">
          <h2 id="por-aprobar-suyas" className="text-lg font-semibold">
            Le toca aprobar
          </h2>
          {filas.length === 0 ? (
            <EstadoVacio
              icono={FileCheck}
              titulo="No tiene fichas por aprobar"
              texto="Cuando se envíe a aprobación una ficha que le corresponda, aparecerá aquí y le llegará un aviso."
            />
          ) : (
            // La clave cambia con las fichas: tras aprobar o devolver, la lista y su diálogo vuelven a empezar.
            <ListaPorAprobar key={filas.map((f) => f.versionId).join("-")} fichas={filas} pideCodigo={sesion.totpActivo} />
          )}
        </section>
      ) : null}

      {administra ? (
        <>
          <section aria-labelledby="por-aprobar-borradores" className="flex min-w-0 flex-col gap-3">
            <h2 id="por-aprobar-borradores" className="text-lg font-semibold">
              Borradores y devueltas
            </h2>
            <TablaDatos titulo="Borradores y devueltas" columnas={COLUMNAS_BORRADORES} filas={borradores.length} vacio="No hay fichas en borrador.">
              {borradores.map((f) => (
                <tr key={f.versionId}>
                  <td className={celda}>
                    <Indicador f={f} href={rutaDeEdicion(f.codigo)} />
                  </td>
                  <td className={celda}>
                    {f.nota ? <Insignia variante="atencion">Devuelta</Insignia> : <Insignia variante="neutra">Borrador</Insignia>}
                  </td>
                  <td className={celda}>{f.nota ?? <span className="text-muted-foreground">(no se ha devuelto)</span>}</td>
                  <td className={`${celda} whitespace-nowrap`}>{fechaHoraLocal(f.fecha)}</td>
                </tr>
              ))}
            </TablaDatos>
          </section>
          <section aria-labelledby="por-aprobar-enviadas" className="flex min-w-0 flex-col gap-3">
            <h2 id="por-aprobar-enviadas" className="text-lg font-semibold">
              Enviadas, esperando aprobación
            </h2>
            <TablaDatos titulo="Enviadas, esperando aprobación" columnas={COLUMNAS_ENVIADAS} filas={enviadas.length} vacio="No hay fichas esperando aprobación.">
              {enviadas.map((f) => (
                <tr key={f.versionId}>
                  <td className={celda}>
                    <Indicador f={f} href={enlaceDeVersion(f.codigo, f.numero)} />
                  </td>
                  <td className={celda}>{f.tipoCambio === "inicial" ? "Nueva" : "Cambio mayor"}</td>
                  <td className={`${celda} whitespace-nowrap`}>{fechaHoraLocal(f.fecha)}</td>
                </tr>
              ))}
            </TablaDatos>
          </section>
        </>
      ) : null}
    </div>
  );
}
