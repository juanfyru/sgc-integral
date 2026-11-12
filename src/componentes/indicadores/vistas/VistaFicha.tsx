import Link from "next/link";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { AprobarFicha, DevolverFicha, type FilaPorAprobar } from "@/componentes/indicadores/ficha/ListaPorAprobar";
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

/** «Ficha técnica» (spec §12.3): el estado de la versión mostrada y su contenido en lectura, con los datos de operación. */
export function VistaFicha({ operacion, ...d }: DatosDeFicha) {
  return (
    <>
      <EstadoDeLaVersion {...d} />
      <FichaTecnica ficha={d.ficha} operacion={operacion} />
    </>
  );
}
