/** Lo que se firma al importar (spec 14A §5.3, paso 6): las fichas, la aprobación previa, la regla y las siglas. */
export function ResumenDeImportacion({
  fichas,
  documento,
  aprobadoPor,
  fecha,
  pctAscendente,
  pctDescendente,
  siglas,
}: {
  fichas: number;
  documento: string;
  aprobadoPor: string;
  fecha: string;
  pctAscendente: string;
  pctDescendente: string;
  siglas: { sigla: string; subproceso: string }[];
}) {
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Fichas</dt>
        <dd>{fichas}</dd>
        <dt className="text-muted-foreground">Documento</dt>
        <dd className="break-words">{documento}</dd>
        <dt className="text-muted-foreground">Quién aprobó</dt>
        <dd className="break-words">{aprobadoPor}</dd>
        <dt className="text-muted-foreground">Fecha</dt>
        <dd>{fecha}</dd>
        <dt className="text-muted-foreground">Regla</dt>
        <dd>{`Atención desde el ${pctAscendente} % de la meta, en ascendente, y hasta el ${pctDescendente} %, en descendente`}</dd>
        {siglas.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Siglas</dt>
            <dd className="break-words">{siglas.map((s) => `${s.sigla} para ${s.subproceso}`).join("; ")}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-sm text-muted-foreground">
        Entra todo o nada. Las fichas «Aprobado» quedan aprobadas con esta aprobación previa y las «Propuesto» quedan en borrador. La clave deja
        constancia de quién importó.
      </p>
    </>
  );
}
