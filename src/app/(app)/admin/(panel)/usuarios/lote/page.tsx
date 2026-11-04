import type { Metadata } from "next";
import Link from "next/link";
import { crearLoteAccion } from "@/app/admin/acciones-usuarios";
import { FormularioLote } from "@/componentes/admin/usuarios/FormularioLote";
import { obtenerSql } from "@/db/cliente";
import { listarCargos } from "@/db/consultas/estructura";
import { MAXIMO_FILAS_LOTE } from "@/lib/lote-usuarios";
import { exigirPermiso } from "@/lib/paginas";
import { ETIQUETA_ROL, ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alta de usuarios por lote — Administración SGC" };

export default async function PaginaLote() {
  await exigirPermiso("usuarios.administrar");
  const [cargos, procesos] = await Promise.all([
    listarCargos(),
    obtenerSql()`SELECT sigla FROM procesos WHERE activo ORDER BY orden, id`,
  ]);
  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Alta de usuarios por lote</h1>
      <section className="flex max-w-3xl flex-col gap-3 text-sm" aria-labelledby="instrucciones">
        <h2 id="instrucciones" className="font-display text-lg font-semibold">Instrucciones</h2>
        <ol className="list-decimal pl-5">
          <li>
            <Link href="/admin/usuarios/lote/plantilla" prefetch={false} className="text-marca underline">Descargue la plantilla (CSV)</Link>{" "}
            y complétela, una persona por fila (hasta {MAXIMO_FILAS_LOTE}).
          </li>
          <li>Guarde el archivo con codificación UTF-8: en Excel, «Guardar como» y elija «CSV UTF-8».</li>
          <li>Súbalo aquí. Las filas válidas se crean; las erradas se rechazan con su línea y el motivo.</li>
        </ol>
        <p>
          <strong>Roles válidos:</strong> {ROLES.map((r) => `${r} (${ETIQUETA_ROL[r]})`).join("; ")}. El líder de
          proceso necesita al menos un proceso. Los procesos se separan con «|» (por ejemplo GTH|CEX).
        </p>
        <p>
          <strong>Cargos disponibles:</strong>{" "}
          {cargos.filter((c) => c.activo).map((c) => `${c.areaNombre} > ${c.nombre}`).join("; ") || "ninguno"}. En la
          columna cargo basta el nombre; si el mismo nombre existe en varias áreas, escríbalo como Área &gt; Cargo.
        </p>
        <p><strong>Siglas de proceso:</strong> {procesos.map((p) => String(p.sigla)).join(", ") || "ninguna"}.</p>
        <p>Cada cuenta nace con una clave temporal que deberá cambiar al ingresar.</p>
      </section>
      <FormularioLote accion={crearLoteAccion} />
      <p className="text-sm"><Link href="/admin/usuarios" className="text-marca underline">Volver a la lista</Link></p>
    </main>
  );
}
