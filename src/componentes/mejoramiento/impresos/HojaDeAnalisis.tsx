import type { FirmaDelHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import type { EncabezadoDelFormato } from "@/db/consultas/mejoramiento/formatos";
import type { DetalleDeHallazgo, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { EncabezadoDeFormato } from "./EncabezadoDeFormato";
import {
  Bloque,
  CasillaDeFirma,
  CasillaEnPapel,
  CausasRaiz,
  Campos,
  fechaDelAnalisis,
  Firmas,
  firmasDelPlan,
  Hoja,
  MarcaDeCarga,
  PieDeImpreso,
  preguntasDeCierre,
} from "./Partes";

/** Lo que recibe el impreso de un análisis: el hallazgo, la ronda y el análisis, sus firmas y el encabezado ya leídos. */
export type DatosDelAnalisisImpreso = {
  hallazgo: Pick<DetalleDeHallazgo, "codigo" | "titulo" | "descripcion" | "proceso" | "detectadoEn" | "cargado">;
  /** Los líderes activos del proceso: el responsable del proceso. */
  lideres: readonly string[];
  ronda: RondaDeDetalle;
  analisis: RondaDeDetalle["analisis"][number];
  firmas: readonly FirmaDelHallazgo[];
  /** El nombre de la entidad (`obtenerMarcaSegura`) y la dirección de su logo, o nula. */
  entidad: string;
  logo: string | null;
  /** El del documento elegido para el formato (`encabezadoDeFormato`), o nulo. */
  formato: EncabezadoDelFormato | null;
  impresoEn: Date;
  impresoPor: string;
  zona: string;
};

/**
 * La hoja de un análisis de causa raíz (spec 15 §16.4 y Apéndice A.3 y A.4): el encabezado del formato, la información general
 * (del hallazgo y del análisis), el contenido del método (`children`), la conclusión (las causas raíz de la ronda, las dos
 * preguntas de cierre y las observaciones) y las firmas del plan de su ronda, que incluye el análisis: «Realizó» es «Elaboró»,
 * «Validó» es «Revisó» y «Visto bueno» es «Aprobó». En un plan aprobado en papel, quién lo aprobó y cuándo, sin firma del sistema.
 * La de un hallazgo cargado lleva su marca, como el registro: la hoja puede viajar sola.
 */
export function HojaDeAnalisis({ d, titulo, children }: { d: DatosDelAnalisisImpreso; titulo: string; children: React.ReactNode }) {
  const { hallazgo: h, ronda: r, analisis: a, zona } = d;
  const id = (bloque: string) => `analisis-impreso-${bloque}`;
  const firmas = firmasDelPlan(d.firmas, r);
  const sinFirma = r.estadoPlan === "aprobado" ? "No aplica" : "Pendiente";
  return (
    <Hoja titulo={id("titulo")}>
      <EncabezadoDeFormato entidad={d.entidad} logo={d.logo} titulo={titulo} formato={d.formato} zona={zona} idTitulo={id("titulo")} />
      {h.cargado ? <MarcaDeCarga /> : null}
      <Bloque id={id("general")} titulo="Información general" corto>
        <Campos
          nombre="Información general"
          campos={[
            { termino: "Hallazgo", valor: `${h.codigo} · ${h.titulo}` },
            { termino: "Proceso", valor: h.proceso },
            { termino: "Responsable del proceso", valor: d.lideres.length > 0 ? d.lideres.join(", ") : "Sin líder activo" },
            { termino: "Fecha en que se detectó", valor: fechaDeDia(h.detectadoEn) },
            { termino: "Fecha del análisis", valor: fechaDelAnalisis(r, zona) },
            { termino: "Ronda", valor: String(r.numero) },
            { termino: "Equipo", valor: a.equipo ?? "Sin registrar" },
            { termino: "Descripción del hallazgo", valor: h.descripcion },
          ]}
        />
      </Bloque>
      {children}
      <Bloque id={id("conclusion")} titulo="Conclusión">
        <Campos
          nombre="Conclusión del análisis"
          campos={[
            { termino: "Causas raíz", valor: <CausasRaiz causas={r.causas} /> },
            ...preguntasDeCierre(r),
            { termino: "Observaciones", valor: a.observaciones ?? "Sin observaciones" },
          ]}
        />
      </Bloque>
      <Bloque id={id("firmas")} titulo="Firmas" corto>
        <Firmas nombre="Firmas del análisis">
          {r.aprobadoFuera && r.aprobadoEn ? (
            <CasillaEnPapel rol="Visto bueno" quien={r.aprobadoFuera} cuando={r.aprobadoEn} zona={zona} />
          ) : (
            <>
              <CasillaDeFirma rol="Realizó" firma={firmas.elaboro} sinFirma="Pendiente" zona={zona} />
              <CasillaDeFirma rol="Validó" firma={firmas.reviso} sinFirma={sinFirma} zona={zona} />
              <CasillaDeFirma rol="Visto bueno" firma={firmas.aprobo} sinFirma={sinFirma} zona={zona} />
            </>
          )}
        </Firmas>
      </Bloque>
      <PieDeImpreso impresoEn={d.impresoEn} impresoPor={d.impresoPor} zona={zona} />
    </Hoja>
  );
}
