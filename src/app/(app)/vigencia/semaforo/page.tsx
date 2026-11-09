import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Download } from "lucide-react";
import { DialogoFijarFecha } from "@/componentes/vigencia/DialogoFijarFecha";
import { PestanasVigencia } from "@/componentes/vigencia/PestanasVigencia";
import { TablaSemaforo } from "@/componentes/vigencia/TablaSemaforo";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { accionesDeFila, listarSemaforo, procesosDelSemaforo, resumirSemaforo } from "@/db/consultas/vigencia/semaforo";
import { alcanceProcesos } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { filtroDeConsulta } from "@/lib/vigencia/filtro-semaforo";
import { limitesDeFechaFijada, textoFecha } from "@/lib/vigencia/plazo";
import { ETIQUETA_VIGENCIA, type EstadoVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirVigencia } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vigencia" };

const FILTROS_ESTADO: { clave: EstadoVigencia | "todos"; etiqueta: string }[] = [
  { clave: "vencida", etiqueta: "Vencidas" },
  { clave: "atencion", etiqueta: ETIQUETA_VIGENCIA.atencion },
  { clave: "al_dia", etiqueta: ETIQUETA_VIGENCIA.al_dia },
  { clave: "en_tramite", etiqueta: ETIQUETA_VIGENCIA.en_tramite },
  { clave: "todos", etiqueta: "Todos" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

export default async function PaginaSemaforo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  await exigirVigencia(sesion);
  // La pestaña «Semáforo» es de `vigencia.ver`; quien entra a Vigencia por otra regla no la tiene.
  if (!puede(sesion, "vigencia.ver")) notFound();

  const filtro = filtroDeConsulta(await searchParams);
  const ahora = new Date();
  const zona = zonaHoraria();
  const [todas, procesos, alcance, config] = await Promise.all([
    listarSemaforo(sesion, { estado: "todos", procesoId: filtro.procesoId, origen: filtro.origen }, { ahora }),
    procesosDelSemaforo(sesion),
    alcanceProcesos(sesion),
    obtenerConfigDocumental(),
  ]);
  const conteos = resumirSemaforo(todas, ahora);
  const filas = (filtro.estado === "todos" ? todas : todas.filter((f) => f.vigencia.estado === filtro.estado)).map((f) => ({
    ...f,
    acciones: accionesDeFila(sesion, f, alcance),
  }));

  const consulta = (cambio: Partial<Record<"estado" | "proceso" | "origen", string>>) => {
    const q = new URLSearchParams();
    const estado = cambio.estado ?? filtro.estado;
    if (estado !== "todos") q.set("estado", estado);
    const proceso = cambio.proceso ?? (filtro.procesoId === undefined ? "" : String(filtro.procesoId));
    if (proceso) q.set("proceso", proceso);
    const origen = cambio.origen ?? filtro.origen;
    if (origen !== "todos") q.set("origen", origen);
    const texto = q.toString();
    return texto ? `?${texto}` : "";
  };

  // Fijar la fecha aplica a los internos filtrados; el límite es el menor de sus plazos.
  const fijables = puede(sesion, "revision_anual.gestionar") ? filas.filter((f) => f.origen === "interno") : [];
  const limites = fijables.length > 0 ? limitesDeFechaFijada({ meses: Math.min(...fijables.map((f) => f.mesesRevision)) }, ahora, zona) : null;
  const cuantos = (estado: EstadoVigencia | "todos") => (estado === "todos" ? conteos.total : conteos[estado]);

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Vigencia"
        descripcion="Plazo de revisión, revisión anual, documentos externos e indicadores del proceso documental"
        acciones={
          <a href={`/vigencia/semaforo/excel${consulta({})}`} className={`${claseBoton("secundario")} ${FOCO}`}>
            <Download aria-hidden="true" className="size-4" />
            Descargar Excel
          </a>
        }
      />
      <PestanasVigencia activa="semaforo" visibles={["semaforo"]} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Revisión vencida" valor={conteos.vencida} estado={conteos.vencida > 0 ? "critico" : "bien"} />
        <TarjetaCifra
          etiqueta={`Atención · vence en ${config.vigencia.atencionDias} días o menos`}
          valor={conteos.atencion}
          estado={conteos.atencion > 0 ? "atencion" : "bien"}
        />
        <TarjetaCifra
          etiqueta="Al día"
          valor={conteos.al_dia}
          detalle={conteos.dentroDelPlazoPct === null ? undefined : `${conteos.dentroDelPlazoPct} % de los vigentes dentro del plazo`}
          estado="bien"
        />
        <TarjetaCifra etiqueta="En trámite" valor={conteos.en_tramite} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <nav aria-label="Estado de vigencia">
          <ul className="flex list-none flex-wrap gap-2">
            {FILTROS_ESTADO.map((f) => {
              const esActivo = f.clave === filtro.estado;
              return (
                <li key={f.clave}>
                  <Link
                    href={`/vigencia/semaforo${consulta({ estado: f.clave })}`}
                    aria-current={esActivo ? "page" : undefined}
                    className={`inline-block rounded-full border px-3 py-1 text-sm ${FOCO} ${
                      esActivo ? "border-marca bg-muted font-semibold text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {`${f.etiqueta} (${cuantos(f.clave)})`}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <form method="get" action="/vigencia/semaforo" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
          {filtro.estado === "todos" ? null : <input type="hidden" name="estado" value={filtro.estado} />}
          {/* Los nombres de proceso son largos: a 390 px el selector cede al ancho disponible. */}
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <label htmlFor="filtro-proceso" className="text-sm font-medium">
              Proceso
            </label>
            <select id="filtro-proceso" name="proceso" defaultValue={filtro.procesoId ?? ""} className={`${claseControl} w-full max-w-full`}>
              <option value="">Todos</option>
              {procesos.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.sigla} · ${p.nombre}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-origen" className="text-sm font-medium">
              Origen
            </label>
            <select id="filtro-origen" name="origen" defaultValue={filtro.origen === "todos" ? "" : filtro.origen} className={claseControl}>
              <option value="">Internos y externos</option>
              <option value="interno">Internos</option>
              <option value="externo">Externos</option>
            </select>
          </div>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
        </form>
      </div>

      {limites ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground">
            Para que la carga inicial no amanezca en rojo, el Administrador del SGC puede fijar a mano la próxima revisión
            de los documentos internos de este filtro, con una nota.
          </p>
          <DialogoFijarFecha
            documentoIds={fijables.map((f) => f.documentoId)}
            etiqueta={
              fijables.length === 1
                ? "Fijar próxima revisión al documento filtrado"
                : `Fijar próxima revisión a los ${cuenta(fijables.length, "documento", "documentos")} filtrados`
            }
            minima={limites.minima}
            maxima={limites.maxima}
            maximaTexto={textoFecha(limites.maxima, zona)}
          />
        </div>
      ) : null}

      {filas.length === 0 ? (
        <EstadoVacio
          icono={CalendarClock}
          titulo="No hay documentos aquí"
          texto="Ningún documento vigente de su alcance tiene este estado de vigencia con los filtros elegidos."
        />
      ) : (
        <TablaSemaforo filas={filas} ahora={ahora} pideCodigo={sesion.totpActivo} />
      )}
    </div>
  );
}
