import Link from "next/link";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { AprobarFicha, AvisosDeDeduccion, DevolverFicha, type FilaPorAprobar } from "@/componentes/indicadores/ficha/ListaPorAprobar";
import { Insignia } from "@/componentes/ui/Insignia";
import { desdePeriodo, enlaceDeVersion, type FichaLeida, type OperacionLeida, type VersionVisible } from "@/db/consultas/indicadores/aprobacion";
import { rutaDeEdicion, rutaDeIndicador } from "@/lib/indicadores/rutas";
import { ENLACE, Recuadro } from "./comun";

export const ESTADO_VERSION: Record<VersionVisible["estado"], string> = {
  borrador: "en borrador",
  por_aprobar: "por aprobar",
  aprobada: "aprobada",
  descartada: "descartada",
};

export type DatosDeFicha = {
  ficha: FichaLeida;
  codigo: string;
  vigente: VersionVisible | null;
  enCurso: VersionVisible | null;
  administra: boolean;
  /** Lo que «Aprobar» firma, solo si la versión está por aprobar. */
  porAprobar: FilaPorAprobar | null;
  pideCodigo: boolean;
  /** Los datos de operación, a quien ve el indicador y a quien debe aprobar su ficha. */
  operacion: OperacionLeida | null;
  /** Los compuestos que toman su resultado y que la persona ve (`loToman`, anexo 14C §6.5); vacío, sin sección. */
  loToman?: { codigo: string; nombre: string }[];
};

/**
 * Lo que la versión mostrada es frente a la vigente: un cambio por aprobar (con «Aprobar» y «Devolver» para quien le
 * toca), un borrador, una versión anterior o una descartada. Sobre la vigente, el aviso de un cambio en curso.
 */
function EstadoDeLaVersion({ ficha, codigo, vigente, enCurso, administra, porAprobar, pideCodigo }: Omit<DatosDeFicha, "operacion">) {
  if (ficha.estado === "aprobada" && ficha.versionId === vigente?.id) {
    if (!enCurso) return null;
    return (
      <Recuadro>
        <p>
          {`Hay un cambio ${ESTADO_VERSION[enCurso.estado]} (versión ${enCurso.numero}). `}
          <Link href={enlaceDeVersion(codigo, enCurso.numero)} className={ENLACE}>
            {`Ver la versión ${enCurso.numero}`}
          </Link>
        </p>
      </Recuadro>
    );
  }
  if (ficha.estado === "aprobada") {
    return (
      <Recuadro>
        <p>
          {`Versión ${ficha.numero}, anterior a la vigente. `}
          {vigente ? (
            <Link href={enlaceDeVersion(codigo, vigente.numero)} className={ENLACE}>
              {`Ver la vigente (versión ${vigente.numero})`}
            </Link>
          ) : null}
        </p>
      </Recuadro>
    );
  }
  if (ficha.estado === "descartada") {
    return (
      <Recuadro>
        <p>{`Versión ${ficha.numero}, descartada: nunca rigió.`}</p>
      </Recuadro>
    );
  }
  if (ficha.estado === "borrador") {
    return (
      <Recuadro>
        <p className="flex flex-wrap items-center gap-2">
          <Insignia variante={ficha.notaDevolucion ? "atencion" : "neutra"}>{ficha.notaDevolucion ? "Devuelta" : "Borrador"}</Insignia>
          {`Versión ${ficha.numero} en borrador: aún no rige.`}
        </p>
        {ficha.notaDevolucion ? <p>{`Nota de quien la devolvió: ${ficha.notaDevolucion}`}</p> : null}
        {administra ? (
          <p>
            <Link href={rutaDeEdicion(codigo)} className={ENLACE}>
              Seguir editando y enviarla
            </Link>
          </p>
        ) : null}
      </Recuadro>
    );
  }
  return (
    <Recuadro>
      <p className="flex flex-wrap items-center gap-2">
        <Insignia variante="atencion">Por aprobar</Insignia>
        {`Versión ${ficha.numero}: ${ficha.tipoCambio === "inicial" ? "ficha nueva" : `cambio mayor en ${porAprobar?.cambios.join(", ") ?? ""}`}.`}
      </p>
      {porAprobar?.elaboro ? <p>{`La envió ${porAprobar.elaboro} el ${porAprobar.enviada}.`}</p> : null}
      {ficha.rigeDesde && ficha.tipoCambio === "mayor" ? <p>{`Regirá ${desdePeriodo(ficha.rigeDesde)}.`}</p> : null}
      <AvisosDeDeduccion nombres={porAprobar?.restringidos ?? []} />
      {ficha.aprueba && porAprobar ? (
        <div className="flex flex-wrap items-start gap-2">
          <AprobarFicha ficha={porAprobar} volver={rutaDeIndicador(codigo)} pideCodigo={pideCodigo} />
          <DevolverFicha versionId={ficha.versionId} codigo={codigo} />
        </div>
      ) : (
        <p className="text-muted-foreground">Espera la aprobación de quien corresponde según su clasificación.</p>
      )}
    </Recuadro>
  );
}

/**
 * «Lo toman» (anexo 14C, §6.5): los compuestos que toman el resultado de este indicador y que la persona ve, con su enlace. Si
 * no ve ninguno, la sección no existe: no se dice si hay otros.
 */
function LoToman({ indicadores }: { indicadores: { codigo: string; nombre: string }[] }) {
  if (indicadores.length === 0) return null;
  return (
    <section aria-labelledby="indicador-lo-toman" className="rounded-lg border border-border bg-card p-4">
      <h2 id="indicador-lo-toman" className="text-base font-semibold">
        Lo toman
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Los indicadores que usan su resultado.</p>
      <ul className="mt-2 flex list-none flex-col gap-1 text-sm">
        {indicadores.map((i) => (
          <li key={i.codigo} className="min-w-0 break-words">
            <Link href={rutaDeIndicador(i.codigo)} className={ENLACE}>
              {`${i.codigo} ${i.nombre}`}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * «Ficha técnica» (spec §12.3): el estado de la versión mostrada y su contenido en lectura, con los datos de operación y
 * «Lo toman».
 */
export function VistaFicha({ operacion, loToman = [], ...d }: DatosDeFicha) {
  return (
    <>
      <EstadoDeLaVersion {...d} />
      <FichaTecnica ficha={d.ficha} operacion={operacion} />
      <LoToman indicadores={loToman} />
    </>
  );
}
