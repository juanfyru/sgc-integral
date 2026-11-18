import { Insignia } from "@/componentes/ui/Insignia";
import type { FirmaDelHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import { fechaYHora } from "@/lib/mejoramiento/formato";
import { textoDeVence } from "../ListaDeHallazgos";

export type FirmaEnPanel = { nombre: string; cargo: string | null; cuando: Date };
export type FirmasDelEnvio = { elaboro: FirmaEnPanel | null; reviso: FirmaEnPanel | null; aprobo: FirmaEnPanel | null };

const NINGUNA: FirmasDelEnvio = { elaboro: null, reviso: null, aprobo: null };

/**
 * Las firmas del envío vigente de la ronda (spec 15 §12.1): desde su última «Elaboró», por orden (un reenvío sin cambios
 * tiene la misma huella, y la «Revisó» de antes de una devolución no es de este envío). Con el plan otra vez en borrador,
 * ninguna: el próximo envío firma de nuevo.
 */
export function firmasDelEnvio(firmas: readonly FirmaDelHallazgo[], ronda: number, estadoPlan: string): FirmasDelEnvio {
  if (estadoPlan === "borrador") return NINGUNA;
  const deLaRonda = firmas.filter((f) => f.ronda === ronda);
  const desde = deLaRonda.findLastIndex((f) => f.firma === "elaboro");
  if (desde === -1) return NINGUNA;
  const envio = deLaRonda.slice(desde);
  const de = (firma: "elaboro" | "reviso" | "aprobo"): FirmaEnPanel | null => {
    const f = envio.find((x) => x.firma === firma);
    return f ? { nombre: f.nombre, cargo: f.cargo, cuando: f.cuando } : null;
  };
  return { elaboro: de("elaboro"), reviso: de("reviso"), aprobo: de("aprobo") };
}

type Casilla = { firma: "elaboro" | "reviso" | "aprobo"; titulo: string; estado: "firmada" | "pendiente" | "no_aplica"; detalle: string };

const INSIGNIA = {
  firmada: { variante: "bien", texto: "Firmada" },
  pendiente: { variante: "neutra", texto: "Pendiente" },
  no_aplica: { variante: "sin-dato", texto: "No aplica" },
} as const;

const quien = (f: FirmaEnPanel, zona: string) => [f.nombre, f.cargo, fechaYHora(f.cuando, zona)].filter(Boolean).join(" · ");
const dias = (n: number) => `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;

/**
 * Las tres firmas del plan con su estado (siempre con texto) y su plazo (spec 15 §8.6 y §12.1, maqueta 5): «Elaboró» al
 * enviar; «Revisó», del Administrador del SGC, o «No aplica» si elaboró uno sin otro que lo revise; «Aprobó», de Gerencia con
 * la condición que la hace aplicar, o «No aplica» cuando la revisión valió como aprobación. La firma en curso dice su fecha
 * límite. `children` es lo que se hace con la firma en curso (enviar, en la formulación).
 */
export function PanelDeFirmas({
  firmas,
  elabora,
  sinRevision,
  gerencia,
  enCurso,
  vence,
  plazos,
  contexto,
  children,
}: {
  firmas: FirmasDelEnvio;
  /** Lo que dice «Elaboró» mientras falta: quién la da y cuándo. */
  elabora: string;
  /** Elaboró un Administrador del SGC y no hay otro que lo revise: el envío pasa directo a aprobación. */
  sinRevision: boolean;
  /** Por qué aprueba Gerencia (`razonDeGerencia`), o `null`: la revisión vale como aprobación, salvo que marque recursos. */
  gerencia: string | null;
  /** La firma que espera ahora, si alguna. */
  enCurso: "elaboro" | "reviso" | "aprobo" | null;
  /** La fecha límite del paso en curso. */
  vence: Date | null;
  plazos: { revisar: number; aprobar: number };
  contexto: Pick<ContextoMejora, "ahora" | "calendario" | "zona">;
  children?: React.ReactNode;
}) {
  const zona = contexto.zona;
  const casillas: Casilla[] = [
    firmas.elaboro
      ? { firma: "elaboro", titulo: "Elaboró", estado: "firmada", detalle: quien(firmas.elaboro, zona) }
      : { firma: "elaboro", titulo: "Elaboró", estado: "pendiente", detalle: elabora },
    firmas.reviso
      ? { firma: "reviso", titulo: "Revisó", estado: "firmada", detalle: quien(firmas.reviso, zona) }
      : sinRevision
        ? {
            firma: "reviso",
            titulo: "Revisó",
            estado: "no_aplica",
            detalle: "No hay otro Administrador del SGC activo: nadie firma «Revisó» sobre lo que elaboró",
          }
        : { firma: "reviso", titulo: "Revisó", estado: "pendiente", detalle: `Administrador del SGC · ${dias(plazos.revisar)}` },
    firmas.aprobo
      ? { firma: "aprobo", titulo: "Aprobó", estado: "firmada", detalle: quien(firmas.aprobo, zona) }
      : gerencia !== null
        ? { firma: "aprobo", titulo: "Aprobó", estado: "pendiente", detalle: `Gerencia · aplica: ${gerencia} · ${dias(plazos.aprobar)}` }
        : firmas.reviso
          ? { firma: "aprobo", titulo: "Aprobó", estado: "no_aplica", detalle: "La revisión valió como aprobación" }
          : {
              firma: "aprobo",
              titulo: "Aprobó",
              estado: "pendiente",
              detalle: "Gerencia · solo si la revisión marca recursos adicionales o impacto institucional",
            },
  ];
  const plazo = textoDeVence(vence, contexto);
  return (
    <section aria-labelledby="firmas-titulo" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h3 id="firmas-titulo" className="font-display text-base font-semibold">
        Firmas
      </h3>
      <ol className="flex list-none flex-col gap-2">
        {casillas.map((x) => (
          <li key={x.firma} className="flex min-w-0 flex-col gap-1 rounded-md border border-linea-suave p-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{x.titulo}</span>
              <Insignia variante={INSIGNIA[x.estado].variante}>{INSIGNIA[x.estado].texto}</Insignia>
            </span>
            <span className="break-words text-sm text-muted-foreground">{x.detalle}</span>
            {x.firma === enCurso && x.estado === "pendiente" && plazo ? (
              <span className={`text-xs ${plazo.vencida ? "font-semibold text-estado-critico-texto" : "text-muted-foreground"}`}>
                {plazo.vencida ? `${plazo.plazo} (vencía el ${plazo.fecha})` : `Vence el ${plazo.fecha} · ${plazo.plazo}`}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {children}
    </section>
  );
}
