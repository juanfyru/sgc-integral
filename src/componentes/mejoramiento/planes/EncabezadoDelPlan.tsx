import Link from "next/link";
import { FileSpreadsheet, ListPlus, Pencil, Plus } from "lucide-react";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DetalleDePlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { ETIQUETA_ORIGEN } from "@/lib/mejoramiento/origenes";
import { RUTA_PLANES, rutaDeAnadirAPlan, rutaDeEditarPlan, rutaDeRegistro, rutaDelExcelDelPlan } from "@/lib/mejoramiento/rutas";
import { InsigniaEstadoPlan } from "./ListaDePlanes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * El encabezado de la página del plan (anexo §3.9, maqueta 2): el código, el nombre, el origen, la vigencia y el estado, y sus
 * botones a quien puede: «Excel para el ente» a quien ve todo (`puede.verTodo`); «Editar», «Añadir hallazgos» y «Registrar
 * hallazgo en este plan» a quien gestiona planes en un plan que no está anulado (`puede.gestionar`). `anular` es el diálogo de
 * anular, que la página pasa solo cuando el plan no tiene hallazgos.
 */
export function EncabezadoDelPlan({ plan, anular }: { plan: DetalleDePlan; anular?: React.ReactNode }) {
  const acciones =
    plan.puede.verTodo || plan.puede.gestionar || anular ? (
      <>
        {plan.puede.verTodo && plan.estado !== "anulado" ? (
          <a href={rutaDelExcelDelPlan(plan.id)} className={`${claseBoton("secundario")} ${FOCO}`}>
            <FileSpreadsheet aria-hidden="true" className="size-4" />
            Excel para el ente
          </a>
        ) : null}
        {plan.puede.gestionar ? (
          <>
            <Link href={rutaDeEditarPlan(plan.id)} className={`${claseBoton("secundario")} ${FOCO}`}>
              <Pencil aria-hidden="true" className="size-4" />
              Editar
            </Link>
            <Link href={rutaDeAnadirAPlan(plan.id)} className={`${claseBoton("secundario")} ${FOCO}`}>
              <ListPlus aria-hidden="true" className="size-4" />
              Añadir hallazgos
            </Link>
            <Link href={rutaDeRegistro({ plan: String(plan.id) })} className={`${claseBoton("primario")} ${FOCO}`}>
              <Plus aria-hidden="true" className="size-4" />
              Registrar hallazgo en este plan
            </Link>
          </>
        ) : null}
        {anular ?? null}
      </>
    ) : null;
  return (
    <EncabezadoPagina
      migas={[
        { nombre: "Mejoramiento", href: "/mejoramiento" },
        { nombre: "Planes", href: RUTA_PLANES },
        { nombre: plan.codigo },
      ]}
      codigo={plan.codigo}
      insignias={
        <>
          <Insignia variante="neutra">{ETIQUETA_ORIGEN[plan.origen]}</Insignia>
          <Insignia variante="neutra">{`Vigencia ${plan.vigencia}`}</Insignia>
          <InsigniaEstadoPlan estado={plan.estado} />
        </>
      }
      titulo={plan.nombre}
      acciones={acciones}
    />
  );
}
