import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DialogoDeshacer } from "@/componentes/indicadores/importacion/DialogoDeshacer";
import { FormularioImportacion } from "@/componentes/indicadores/importacion/FormularioImportacion";
import { ESTADO_DE_LOTE } from "@/componentes/indicadores/importacion/estados";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { obtenerSql } from "@/db/cliente";
import {
  condicionDeDeshacer,
  resumenDeLote,
  vistaPrevia,
  type CondicionDeDeshacer,
  type ResumenDeLote,
  type VistaPrevia,
} from "@/db/consultas/indicadores/importacion";
import { fechaYHora } from "@/lib/indicadores/ficha-en-texto";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { exigirPermiso } from "@/lib/paginas";
import { cuenta } from "@/lib/plural";

export const metadata: Metadata = { title: "Importación de indicadores — Administración SGC" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

function NuevaImportacion() {
  return (
    <Link href="/admin/indicadores/importar" className={claseBoton("secundario")}>
      Nueva importación
    </Link>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-l-4 border-border border-l-mod-indicadores bg-muted px-3 py-2 text-sm">{children}</p>;
}

/** Después de importar: las cifras salen del evento del lote, nunca de la dirección (que cualquiera puede escribir). */
function Resultado({ lote }: { lote: ResumenDeLote }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-resultado">
      <h2 id="titulo-resultado" className="font-display text-lg font-semibold">
        Resultado
      </h2>
      <p role="status" className="rounded-md border border-l-4 border-border border-l-estado-bien bg-muted px-3 py-2 text-sm font-medium">
        {`Se ${lote.aprobadas === 1 ? "importó" : "importaron"} ${cuenta(lote.aprobadas, "ficha aprobada", "fichas aprobadas")} y ${lote.borradores} en borrador`}
      </p>
      {lote.omitidas > 0 ? (
        <p className="text-sm text-muted-foreground">{`${cuenta(lote.omitidas, "fila omitida", "filas omitidas")} por problemas o correspondencias sin resolver.`}</p>
      ) : null}
      {lote.importadoEn ? <p className="text-sm text-muted-foreground">{`Importadas el ${fechaYHora(lote.importadoEn)}.`}</p> : null}
      <p>
        <Link href="/indicadores" className={ENLACE}>
          Ver la lista de indicadores
        </Link>
      </p>
    </section>
  );
}

/**
 * «Deshacer la importación» (spec 14A §5.9): se ofrece mientras ninguna ficha tenga trabajo hecho en la app; si alguna lo
 * tiene, dice cuáles y por qué, y no se ofrece.
 */
function Deshacer({
  lote,
  condicion,
  pideCodigo,
}: {
  lote: ResumenDeLote;
  condicion: CondicionDeDeshacer;
  pideCodigo: boolean;
}) {
  const fichas = lote.aprobadas + lote.borradores;
  return (
    <section id="deshacer-importacion" className="flex flex-col items-start gap-3" aria-labelledby="titulo-deshacer">
      <h2 id="titulo-deshacer" className="font-display text-lg font-semibold">
        Deshacer la importación
      </h2>
      {condicion.puede ? (
        <>
          <p className="max-w-prose text-sm text-muted-foreground">
            {`Si la importación salió mal, se deshace entera: se borran ${fichas === 1 ? "su ficha" : `sus ${cuenta(fichas, "ficha", "fichas")}`} y la plantilla corregida se puede importar otra vez con los mismos códigos. Se puede mientras ninguna ficha tenga datos reportados, personas designadas ni otra versión, y ninguna propuesta se haya editado o enviado a aprobación.`}
          </p>
          <DialogoDeshacer loteId={lote.id} fichas={fichas} pideCodigo={pideCodigo} />
        </>
      ) : (
        <>
          <p className="max-w-prose text-sm text-muted-foreground">
            Ya no se puede deshacer: el trabajo hecho en la app sobre estas fichas no se borra.
          </p>
          {condicion.impiden.length > 0 ? (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {condicion.impiden.map((i) => (
                <li key={`${i.codigo}-${i.motivo}`}>{`No se puede deshacer: ${i.codigo} ${i.motivo}`}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

/** La importación de un lote (spec 14A §5.3): por importar, ya importada, deshecha o sin plantilla. */
export default async function PaginaLoteDeImportacion({
  params,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirPermiso("indicadores.administrar");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const loteId = Number(id);
  const lote = await resumenDeLote(sesion, loteId);
  if (!lote) notFound();

  let vista: VistaPrevia | null = null;
  let problema: string | null = null;
  if (lote.estado === "por_importar") {
    try {
      vista = await vistaPrevia(sesion, loteId, {
        correspondencias: { subprocesos: {}, cargos: {}, tipos: {}, unidades: {} },
        regla: { pctAscendente: 90, pctDescendente: 110 },
      });
    } catch (err) {
      // Un archivo que no es la plantilla (o que cambió) no sirve: el lote no se reutiliza.
      if (!(err instanceof ErrorIndicador)) throw err;
      problema = err.message;
    }
    if (vista === null && problema === null) notFound();
  }
  const condicion = lote.estado === "importado" ? await condicionDeDeshacer(obtenerSql(), loteId) : null;

  const estado = ESTADO_DE_LOTE[lote.estado];
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina
        titulo={`Importación n.º ${lote.id}`}
        descripcion={`Cargada por ${lote.cargadoPor} el ${fechaYHora(lote.cargadoEn)}${lote.archivo ? ` · ${lote.archivo}` : ""}`}
        insignias={<Insignia variante={estado.variante}>{estado.texto}</Insignia>}
        migas={[
          { nombre: "Configuración de indicadores", href: "/admin/indicadores" },
          { nombre: "Importar indicadores", href: "/admin/indicadores/importar" },
          { nombre: `Importación n.º ${lote.id}` },
        ]}
        acciones={lote.archivo ? <a href={`/admin/indicadores/importar/${lote.id}/archivo`} className={claseBoton("secundario")}>Descargar la plantilla subida</a> : undefined}
      />

      {lote.estado === "sin_archivo" ? (
        <div className="flex flex-col items-start gap-3">
          <Aviso>Esta importación no tiene plantilla: la subida no terminó. Empiece una importación nueva.</Aviso>
          <NuevaImportacion />
        </div>
      ) : null}

      {lote.estado === "deshecho" ? (
        <div className="flex flex-col items-start gap-3">
          <Aviso>Esta importación se deshizo: sus fichas ya no están. La plantilla no se puede volver a importar; empiece una importación nueva.</Aviso>
          <NuevaImportacion />
        </div>
      ) : null}

      {lote.estado === "importado" && condicion ? (
        <>
          <Resultado lote={lote} />
          <Deshacer lote={lote} condicion={condicion} pideCodigo={sesion.totpActivo} />
        </>
      ) : null}

      {problema !== null ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-md border border-l-4 border-border border-l-estado-critico bg-muted px-3 py-2 text-sm text-estado-critico-texto">
            {problema}
          </p>
          <p className="text-sm text-muted-foreground">Esta importación no se puede reutilizar: empiece una importación nueva con la plantilla.</p>
          <NuevaImportacion />
        </div>
      ) : null}

      {vista ? <FormularioImportacion loteId={lote.id} vistaInicial={vista} pideCodigo={sesion.totpActivo} /> : null}
    </div>
  );
}
