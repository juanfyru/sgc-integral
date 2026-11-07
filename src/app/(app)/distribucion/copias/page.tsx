import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { DialogoEmitir } from "@/componentes/distribucion/copias/DialogoEmitir";
import { ListaPuntos } from "@/componentes/distribucion/copias/ListaPuntos";
import { TablaCopias } from "@/componentes/distribucion/copias/TablaCopias";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import {
  conteosPorPunto,
  documentosParaEmitir,
  listarCopias,
  puntosParaEmitir,
  type FiltroCopias,
} from "@/db/consultas/distribucion/copias";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirDistribucion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Distribución" };

const FILTROS: { clave: NonNullable<FiltroCopias["estado"]>; etiqueta: string }[] = [
  { clave: "vivas", etiqueta: "En circulación" },
  { clave: "por_recoger", etiqueta: "Por recoger" },
  { clave: "sin_recibido", etiqueta: "Sin recibido" },
  { clave: "anuladas", etiqueta: "Anuladas" },
  { clave: "todas", etiqueta: "Historial" },
];

const entero = (v: string | string[] | undefined): number | undefined => {
  const texto = Array.isArray(v) ? v[0] : v;
  return texto && /^\d{1,15}$/.test(texto) ? Number(texto) : undefined;
};

export default async function PaginaCopias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  const pedidos = await searchParams;
  const filtro = FILTROS.find((f) => f.clave === pedidos.estado) ?? FILTROS[0];
  const puntoId = entero(pedidos.punto);
  const documentoId = entero(pedidos.documento);
  const puedeEmitir = puede(sesion, "copias.emitir");

  const [puntos, copias, documentos, puntosEmitibles] = await Promise.all([
    conteosPorPunto(sesion),
    listarCopias(sesion, { estado: filtro.clave, puntoId, documentoId }),
    puedeEmitir ? documentosParaEmitir(sesion) : Promise.resolve([]),
    puedeEmitir ? puntosParaEmitir(sesion) : Promise.resolve([]),
  ]);
  const cuantos = {
    vivas: puntos.reduce((n, p) => n + p.vivas, 0),
    por_recoger: puntos.reduce((n, p) => n + p.porRecoger, 0),
    sin_recibido: puntos.reduce((n, p) => n + p.sinRecibido, 0),
  } as Partial<Record<(typeof FILTROS)[number]["clave"], number>>;
  const href = (estado: string) => {
    const q = new URLSearchParams({ estado });
    if (puntoId !== undefined) q.set("punto", String(puntoId));
    if (documentoId !== undefined) q.set("documento", String(documentoId));
    return `/distribucion/copias?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Distribución"
        descripcion="Copias controladas, acuses de lectura, socializaciones y verificaciones"
        acciones={
          puedeEmitir ? <DialogoEmitir documentos={documentos} puntos={puntosEmitibles} /> : undefined
        }
      />
      <PestanasDistribucion activa="copias" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside>
          <ListaPuntos puntos={puntos} activo={puntoId ?? null} estado={filtro.clave === "vivas" ? undefined : filtro.clave} />
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          <nav aria-label="Estado de las copias">
            <ul className="flex list-none flex-wrap gap-2">
              {FILTROS.map((f) => {
                const esActivo = f.clave === filtro.clave;
                const n = cuantos[f.clave];
                return (
                  <li key={f.clave}>
                    <Link
                      href={href(f.clave)}
                      aria-current={esActivo ? "page" : undefined}
                      className={`inline-block rounded-full border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${
                        esActivo
                          ? "border-marca bg-muted font-semibold text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n === undefined ? f.etiqueta : `${f.etiqueta} (${n})`}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {copias.length === 0 ? (
            <EstadoVacio
              icono={Printer}
              titulo="No hay copias controladas aquí"
              texto="Cuando se emita una copia controlada de un documento, aparecerá en su punto de uso."
            />
          ) : (
            <TablaCopias copias={copias} ahora={new Date()} />
          )}
        </div>
      </div>
    </div>
  );
}
