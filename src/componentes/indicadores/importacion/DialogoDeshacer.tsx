"use client";

import { deshacerImportacionAccion } from "@/app/admin/acciones-indicadores";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { cuenta } from "@/lib/plural";

/** Lo que el diálogo dice antes de la clave: qué se borra, qué queda y el motivo, que queda en el registro del lote. */
export function CamposDeDeshacer({ fichas }: { fichas: number }) {
  return (
    <>
      <p className="text-sm">
        {`${fichas === 1 ? "Se borra" : "Se borran"} ${cuenta(fichas, "ficha", "fichas")} de esta importación, con sus periodos abiertos sin datos, y sus códigos quedan libres para importarlos otra vez.`}
      </p>
      <p className="text-sm text-muted-foreground">
        Quedan el registro de la importación con este motivo, la bitácora, la plantilla subida y las siglas que se dieron a los subprocesos.
      </p>
      <Campo etiqueta="Motivo" nombre="motivo" ayuda="De 10 a 500 caracteres: por qué se deshace (una meta escrita como fracción, un sentido al revés…).">
        <textarea required minLength={10} maxLength={500} rows={3} className={`${claseControl} w-full`} />
      </Campo>
    </>
  );
}

/** «Deshacer la importación» (spec 14A §5.9): con motivo y la clave de quien la deshace, en el mismo envío. */
export function DialogoDeshacer({ loteId, fichas, pideCodigo }: { loteId: number; fichas: number; pideCodigo: boolean }) {
  return (
    <DialogoFirma
      titulo={`Deshacer la importación n.º ${loteId}`}
      etiquetaBoton="Deshacer la importación"
      accion={deshacerImportacionAccion}
      ocultos={{ id: String(loteId) }}
      pideCodigo={pideCodigo}
    >
      <CamposDeDeshacer fichas={fichas} />
    </DialogoFirma>
  );
}
