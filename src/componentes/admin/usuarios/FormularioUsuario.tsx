"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { EstadoCreacion } from "@/app/admin/acciones-usuarios";
import { ClaveTemporal } from "@/componentes/admin/usuarios/ClaveTemporal";
import { ETIQUETA_ROL, ROLES } from "@/lib/roles";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20 read-only:bg-muted";

type Valores = {
  usuario: string;
  nombre: string;
  correo: string | null;
  rol: string;
  cargoId: number | null;
  jefeInmediatoId: number | null;
  procesoIds: number[];
  verHistorial: boolean;
};

type Props = {
  accion: (estado: EstadoCreacion, formData: FormData) => Promise<EstadoCreacion>;
  id?: number;
  valores?: Valores;
  cargos: Array<{ id: number; nombre: string; areaNombre: string }>;
  jefes: Array<{ id: number; nombre: string; usuario: string }>;
  procesos: Array<{ id: number; nombre: string; sigla: string }>;
};

export function FormularioUsuario({ accion, id, valores, cargos, jefes, procesos }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);

  if (estado?.ok === true && "claveTemporal" in estado) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          Usuario <strong>{estado.usuario}</strong> creado.
        </p>
        <ClaveTemporal clave={estado.claveTemporal} usuario={estado.usuario} />
        <p className="flex gap-4 text-sm">
          <Link href={`/admin/usuarios/${estado.id}`} className="text-marca underline">Ver el usuario</Link>
          <Link href="/admin/usuarios" className="text-marca underline">Volver a la lista</Link>
        </p>
      </div>
    );
  }

  const enviado = estado && !estado.ok ? estado.valores : undefined;
  const texto = (campo: string, previo: string | null | undefined): string => {
    const x = enviado?.[campo];
    return typeof x === "string" ? x : enviado ? "" : (previo ?? "");
  };
  const procesosMarcados = new Set(
    enviado ? [enviado.procesoIds ?? []].flat().map(Number) : (valores?.procesoIds ?? []),
  );
  const verHistorial = enviado ? enviado.verHistorial !== undefined : (valores?.verHistorial ?? false);
  const edicion = id !== undefined;

  return (
    <form action={enviar} className="flex max-w-xl flex-col gap-5">
      {edicion && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre de usuario
        <input
          name="usuario"
          required
          readOnly={edicion}
          autoComplete="off"
          defaultValue={edicion ? valores?.usuario : texto("usuario", valores?.usuario)}
          className={claseCampo}
          aria-describedby="ayuda-usuario"
        />
        <span id="ayuda-usuario" className="text-xs font-normal text-muted-foreground">
          {edicion
            ? "El nombre de usuario no se puede cambiar."
            : "Minúsculas, números, punto, guion o guion bajo (3 a 40 caracteres)."}
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre completo
        <input name="nombre" required defaultValue={texto("nombre", valores?.nombre)} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Correo (opcional)
        <input name="correo" type="email" defaultValue={texto("correo", valores?.correo)} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Rol
        <select name="rol" required defaultValue={texto("rol", valores?.rol ?? "consulta")} className={claseCampo}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Cargo (opcional)
        <select
          name="cargoId"
          defaultValue={texto("cargoId", valores?.cargoId ? String(valores.cargoId) : "")}
          className={claseCampo}
        >
          <option value="">Sin cargo</option>
          {cargos.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre} — {c.areaNombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Jefe inmediato (opcional)
        <select
          name="jefeInmediatoId"
          defaultValue={texto("jefeInmediatoId", valores?.jefeInmediatoId ? String(valores.jefeInmediatoId) : "")}
          className={claseCampo}
        >
          <option value="">Según el organigrama</option>
          {jefes.map((j) => (
            <option key={j.id} value={j.id}>{j.nombre} ({j.usuario})</option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Procesos</legend>
        <p className="text-xs text-muted-foreground">
          Para un líder: los procesos que lidera. Para los demás: los procesos a los que pertenece; le dan acceso a sus documentos restringidos.
        </p>
        <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {procesos.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="procesoIds" value={p.id} defaultChecked={procesosMarcados.has(p.id)} />
                {p.sigla} — {p.nombre}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="verHistorial" defaultChecked={verHistorial} />
        Puede ver el historial de documentos (versiones obsoletas y anuladas)
      </label>
      {estado && !estado.ok && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">{estado.error}</p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : edicion ? "Guardar cambios" : "Crear usuario"}
      </button>
    </form>
  );
}
