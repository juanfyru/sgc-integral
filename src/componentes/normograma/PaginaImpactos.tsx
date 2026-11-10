import Link from "next/link";
import { resolverImpactoAccion } from "@/app/acciones-normograma";
import { claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Impacto } from "@/db/consultas/normograma/impactos";
import { cuenta } from "@/lib/plural";
import { ETIQUETA_ESTADO_NORMA, ETIQUETA_RESOLUCION, fechaDeNorma } from "@/lib/normograma/tipos";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { ETIQUETA_RESULTADO, type ResultadoVerificacion } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { AccionNormograma } from "./AccionNormograma";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded underline underline-offset-2 ${FOCO}`;
const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

/** La solicitud de cambio que atiende el impacto de un documento interno (la página la lee en la Tarea 11). */
export function rutaSolicitudDeCambio(codigo: string, impactoId: number): string {
  return `/tramites/nueva?documento=${encodeURIComponent(codigo)}&motivo=cambio_normativo&impacto=${impactoId}`;
}

/** La solicitud de creación que atiende el impacto de un proceso sin documentos enlazados. */
export function rutaSolicitudDeCreacion(procesoId: number, impactoId: number): string {
  return `/tramites/nueva?tipo=crear&proceso=${procesoId}&motivo=cambio_normativo&impacto=${impactoId}`;
}

/** La verificación del externo que resuelve su impacto (`/vigencia/externos/[id]?impacto=`). */
export function rutaVerificarExterno(documentoId: number, impactoId: number): string {
  return `/vigencia/externos/${documentoId}?impacto=${impactoId}`;
}

function Estado({ impacto: i, ahora, zona }: { impacto: Impacto; ahora: Date; zona: string }) {
  if (i.estado === "resuelto") {
    return <Insignia variante="bien">{`Resuelto · ${i.resolucion ? ETIQUETA_RESOLUCION[i.resolucion] : "sin resolución"}`}</Insignia>;
  }
  const plazo = estadoPlazo(i.venceEn, ahora, zona);
  if (plazo.estado === "vencido") return <Insignia variante="critico">{`Pendiente · venció hace ${cuenta(plazo.dias, "día", "días")}`}</Insignia>;
  if (plazo.estado === "vence_hoy") return <Insignia variante="atencion">Pendiente · vence hoy</Insignia>;
  return <Insignia variante="atencion">{`Pendiente · vence el ${textoFecha(i.venceEn, zona)}`}</Insignia>;
}

function Resolucion({ impacto: i, zona }: { impacto: Impacto; zona: string }) {
  return (
    <div className="text-sm text-muted-foreground">
      {i.resueltoPor && i.resueltoEn ? <span className="block">{`${i.resueltoPor} · ${textoFecha(i.resueltoEn, zona)}`}</span> : null}
      {i.tramite ? (
        <span className="block">
          {"Con la solicitud "}
          <Link href={`/tramites/${i.tramite.id}`} className={ENLACE}>
            {i.tramite.numero}
          </Link>
        </span>
      ) : null}
      {i.verificacion ? (
        <span className="block">{`Verificación: ${ETIQUETA_RESULTADO[i.verificacion.resultado as ResultadoVerificacion] ?? i.verificacion.resultado}`}</span>
      ) : null}
      {i.nota ? <span className="block whitespace-pre-line break-words">{i.nota}</span> : null}
    </div>
  );
}

function NoAfecta({ impacto: i }: { impacto: Impacto }) {
  return (
    <AccionNormograma
      accion={resolverImpactoAccion}
      boton="Registrar que no afecta"
      campos={{ impactoId: i.id, resolucion: "no_afecta" }}
      desplegable="No afecta…"
      variante="secundario"
      tamano="sm"
    >
      <Campo
        etiqueta="Por qué no afecta"
        nombre="nota"
        id={`impacto-${i.id}-nota`}
        // Con documento, la resolución queda en su historia; sin él, en el impacto del proceso (y en la bitácora).
        ayuda={`Al menos 5 caracteres. ${i.documento ? "Queda en la historia del documento." : "Queda en el impacto del proceso y en la bitácora."}`}
      >
        <textarea required minLength={5} maxLength={1000} rows={2} className={CONTROL} />
      </Campo>
    </AccionNormograma>
  );
}

/** Lo que se puede hacer con un impacto pendiente (spec 13C §10.5). */
function Acciones({ impacto: i }: { impacto: Impacto }) {
  const d = i.documento;
  const boton = `${claseBoton("primario", "sm")} ${FOCO}`;
  if (!d) {
    return (
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <Link href={rutaSolicitudDeCreacion(i.proceso.id, i.id)} className={boton}>
          Abrir solicitud de creación
        </Link>
        <NoAfecta impacto={i} />
      </div>
    );
  }
  if (d.origen === "externo") {
    // Un externo no tiene trámite: su verificación (con sus tres resultados) resuelve el impacto.
    return (
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        {d.version !== null ? (
          <Link href={rutaVerificarExterno(d.id, i.id)} className={boton}>
            Verificar el externo
          </Link>
        ) : null}
        <NoAfecta impacto={i} />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-2">
      {d.tramiteAbierto ? (
        // «Si el documento ya tiene un trámite abierto, se enlaza» (spec 13C §10.5).
        <AccionNormograma
          accion={resolverImpactoAccion}
          boton={`Enlazar el trámite en curso ${d.tramiteAbierto.numero}`}
          campos={{ impactoId: i.id, resolucion: "solicitud", tramiteId: d.tramiteAbierto.id }}
          tamano="sm"
        />
      ) : d.version !== null ? (
        <Link href={rutaSolicitudDeCambio(d.codigo, i.id)} className={boton}>
          Abrir solicitud de cambio
        </Link>
      ) : null}
      <NoAfecta impacto={i} />
    </div>
  );
}

function Documento({ impacto: i }: { impacto: Impacto }) {
  const d = i.documento;
  if (!d) {
    return (
      <>
        <p className="font-medium">{`El proceso ${i.proceso.nombre}`}</p>
        <p className="text-sm text-muted-foreground">
          La norma está asociada al proceso y no tiene documentos enlazados en él: confirme si algo del proceso cambia.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="min-w-0">
        <Link href={`/documentos/${encodeURIComponent(d.codigo.toLowerCase())}`} className={`${ENLACE} font-mono text-xs font-medium`}>
          {d.version !== null ? `${d.codigo} v${d.version}` : d.codigo}
        </Link>{" "}
        <span className="break-words">{d.titulo}</span>
        {d.origen === "externo" ? (
          <>
            {" "}
            <Insignia variante="neutra">Externo</Insignia>
          </>
        ) : null}
      </p>
      {d.version === null ? <p className="text-sm text-muted-foreground">Ya no tiene versión vigente.</p> : null}
      {d.tramiteAbierto && i.estado === "pendiente" ? (
        <p className="text-sm text-muted-foreground">
          {"Tiene el trámite abierto "}
          <Link href={`/tramites/${d.tramiteAbierto.id}`} className={ENLACE}>
            {d.tramiteAbierto.numero}
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}

/**
 * La tarea de impacto de un cambio normativo en un proceso (spec 13C §10.5, maqueta 8): los documentos enlazados con su
 * versión vigente y, por cada pendiente, «Abrir solicitud de cambio» (o enlazar el trámite en curso), «Verificar el
 * externo» si es externo, o «No afecta…» con nota; el impacto de proceso admite «Abrir solicitud de creación». Quien
 * llama ya decidió que la persona ve el impacto: los documentos que no ve no llegan.
 */
export function PaginaImpactos({ impactos, ahora = new Date() }: { impactos: Impacto[]; ahora?: Date }) {
  const zona = zonaHoraria();
  const { cambio, proceso } = impactos[0];
  const pendientes = impactos.filter((i) => i.estado === "pendiente").length;
  const estado = ETIQUETA_ESTADO_NORMA[cambio.estadoNuevo].toLowerCase();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Normograma", href: "/normograma" },
          { nombre: cambio.norma.nombre, href: `/normograma/${cambio.norma.id}` },
          { nombre: `Impacto en ${proceso.nombre}` },
        ]}
        superior="Revisión por cambio normativo"
        titulo={`Revisar el impacto de ${cambio.norma.nombre} (${estado}) en ${proceso.nombre}`}
        descripcion={`${cambio.norma.nombre} pasó a ${estado} el ${fechaDeNorma(cambio.fecha)}. ${
          pendientes === 0 ? "Todo está resuelto." : `${cuenta(pendientes, "pendiente", "pendientes")} de ${impactos.length}.`
        }`}
      />
      <ul className="flex min-w-0 max-w-4xl list-none flex-col gap-3" aria-label="Impactos del cambio en el proceso">
        {impactos.map((i) => (
          <li key={i.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Documento impacto={i} />
              </div>
              <Estado impacto={i} ahora={ahora} zona={zona} />
            </div>
            {i.estado === "pendiente" ? <Acciones impacto={i} /> : <Resolucion impacto={i} zona={zona} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
