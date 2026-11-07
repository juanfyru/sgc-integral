"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { emitirCopiaAccion } from "@/app/acciones-distribucion";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { agruparPuntos } from "@/lib/distribucion/copias";

export type DocumentoEmitible = { id: number; codigo: string; titulo: string; procesoIds: number[] };
export type PuntoEmitible = { id: number; nombre: string; sede: string | null; procesoIds: number[] };
/** Sin `url_publica` el sello sale sin QR; `enlace` solo para quien puede editar «Entidad y marca». */
export type AvisoSinQr = { enlace: boolean } | null;

function AvisoQr({ aviso }: { aviso: NonNullable<AvisoSinQr> }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-md bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        Sin dirección de la plataforma configurada, el sello saldrá sin código QR.
        {aviso.enlace ? (
          <>
            {" "}
            <Link href="/admin/entidad" className="font-medium underline underline-offset-2">
              Configurarla en Entidad y marca
            </Link>
          </>
        ) : null}
      </span>
    </p>
  );
}

/** El formulario del diálogo; se exporta para probar lo que pinta sin abrir el diálogo. */
export function FormularioEmitir({
  documentos,
  puntos,
  avisoSinQr,
  alCancelar,
}: {
  documentos: DocumentoEmitible[];
  puntos: PuntoEmitible[];
  avisoSinQr: AvisoSinQr;
  alCancelar: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(emitirCopiaAccion, null);
  const [busqueda, setBusqueda] = useState("");
  const unico = documentos.length === 1 ? documentos[0] : null;
  const [elegido, setElegido] = useState<number | null>(unico?.id ?? null);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    // El elegido no desaparece de la lista al seguir buscando.
    return q === ""
      ? documentos
      : documentos.filter((d) => d.id === elegido || `${d.codigo} ${d.titulo}`.toLowerCase().includes(q));
  }, [busqueda, documentos, elegido]);
  const documento = documentos.find((d) => d.id === elegido) ?? null;
  const { delDocumento, otros } = agruparPuntos(puntos, documento?.procesoIds ?? null);
  const opcion = (p: PuntoEmitible) => (
    <option key={p.id} value={p.id}>
      {p.sede ? `${p.nombre} · ${p.sede}` : p.nombre}
    </option>
  );

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      <p aria-hidden="true" className="font-semibold">
        Emitir copia controlada
      </p>
      {unico ? (
        <>
          <input type="hidden" name="documentoId" value={unico.id} />
          <p className="text-sm">
            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{unico.codigo}</span>
            {unico.titulo}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="buscar-documento" className="text-sm font-medium">
              Buscar por código
            </label>
            {/* Sin `name`: solo filtra la lista, no viaja en el formulario. */}
            <input
              id="buscar-documento"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoComplete="off"
              className={claseControl}
            />
          </div>
          <Campo
            etiqueta="Documento"
            nombre="documentoId"
            ayuda={`${visibles.length} de ${documentos.length} documentos vigentes con PDF`}
          >
            <select
              required
              value={elegido ?? ""}
              onChange={(e) => setElegido(e.target.value === "" ? null : Number(e.target.value))}
              className={claseControl}
            >
              <option value="" disabled>
                Elija el documento
              </option>
              {visibles.map((d) => (
                <option key={d.id} value={d.id}>
                  {`${d.codigo} · ${d.titulo}`}
                </option>
              ))}
            </select>
          </Campo>
        </>
      )}
      <Campo etiqueta="Punto de uso" nombre="puntoUsoId">
        <select required defaultValue="" className={claseControl}>
          <option value="" disabled>
            Elija el punto
          </option>
          {delDocumento.length > 0 ? (
            <optgroup label="De los procesos del documento">{delDocumento.map(opcion)}</optgroup>
          ) : null}
          {otros.length > 0 ? (
            <optgroup label={delDocumento.length > 0 ? "Otros puntos activos" : "Puntos de uso activos"}>{otros.map(opcion)}</optgroup>
          ) : null}
        </select>
      </Campo>
      {avisoSinQr ? <AvisoQr aviso={avisoSinQr} /> : null}
      <Campo etiqueta="Nota (opcional)" nombre="nota" ayuda="Hasta 200 caracteres; queda en el historial de la copia.">
        <textarea maxLength={200} rows={2} className={`${claseControl} w-full`} />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Emitiendo…" : "Emitir"}
        </Boton>
      </div>
    </form>
  );
}

/** «Emitir copia controlada»: elige documento y punto, y aterriza en la copia con el enlace al PDF. */
export function DialogoEmitir({
  documentos,
  puntos,
  avisoSinQr,
  etiqueta = "Emitir copia controlada",
  variante = "primario",
}: {
  documentos: DocumentoEmitible[];
  puntos: PuntoEmitible[];
  avisoSinQr: AvisoSinQr;
  etiqueta?: string;
  variante?: "primario" | "secundario";
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante={variante} onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Emitir copia controlada"
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {abierto ? (
          <FormularioEmitir
            documentos={documentos}
            puntos={puntos}
            avisoSinQr={avisoSinQr}
            alCancelar={() => setAbierto(false)}
          />
        ) : null}
      </Dialogo>
    </>
  );
}
