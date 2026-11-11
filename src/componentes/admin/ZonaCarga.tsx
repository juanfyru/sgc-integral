"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Duplicado consciente de ROLES_ARCHIVO: importar @/lib/subida aquí
// arrastraría file-type al bundle del cliente.
const ROLES = ["principal", "editable", "anexo"] as const;
type RolArchivo = (typeof ROLES)[number];

type Carga = {
  nombre: string;
  progreso: number; // 0–100
  estado: "subiendo" | "listo" | "error";
  mensaje?: string;
};

const ETIQUETA_ROL: Record<RolArchivo, string> = {
  principal: "Principal (lectura)",
  editable: "Editable (diligenciamiento)",
  anexo: "Anexo",
};

// Aviso previo de la evidencia (PDF o imagen): el servidor valida el contenido con `validarTipoEvidencia`,
// que no se puede importar aquí por el mismo motivo.
const EXTENSIONES_EVIDENCIA = ["pdf", "png", "jpg", "jpeg", "webp"];
const ERROR_EVIDENCIA = "La evidencia debe ser PDF o imagen (PNG, JPG, WebP)";
const ERROR_SOLO_PDF = "Solo se admite un PDF";
// El soporte de una medición admite además un Excel .xlsx (nunca .xls); el servidor lo valida por su contenido.
const EXTENSIONES_SOPORTE = [...EXTENSIONES_EVIDENCIA, "xlsx"];
const ERROR_SOPORTE = "El soporte debe ser PDF, imagen (PNG, JPG, WebP) o Excel (.xlsx)";

/**
 * `evidencia`: archivos de respaldo de una jornada, sin rol de archivo y limitados a PDF e imágenes. `soloPdf`: un
 * solo PDF sin rol (el de una norma; el servidor lo valida por sus bytes y reemplaza el anterior). `soporte`: como la
 * evidencia, y además un Excel `.xlsx` (el soporte de una medición de indicador).
 */
export function ZonaCarga({
  direccion,
  evidencia = false,
  soloPdf = false,
  soporte = false,
}: {
  direccion: string;
  evidencia?: boolean;
  soloPdf?: boolean;
  soporte?: boolean;
}) {
  const router = useRouter();
  const [rol, setRol] = useState<RolArchivo>("principal");
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);

  function actualizar(nombre: string, cambio: Partial<Carga>) {
    setCargas((prev) => prev.map((c) => (c.nombre === nombre ? { ...c, ...cambio } : c)));
  }

  function subir(archivo: File) {
    const extension = archivo.name.slice(archivo.name.lastIndexOf(".") + 1).toLowerCase();
    if (
      (evidencia && !EXTENSIONES_EVIDENCIA.includes(extension)) ||
      (soporte && !EXTENSIONES_SOPORTE.includes(extension)) ||
      (soloPdf && extension !== "pdf")
    ) {
      setCargas((prev) => [
        ...prev.filter((c) => c.nombre !== archivo.name),
        { nombre: archivo.name, progreso: 0, estado: "error", mensaje: soloPdf ? ERROR_SOLO_PDF : soporte ? ERROR_SOPORTE : ERROR_EVIDENCIA },
      ]);
      return;
    }
    setCargas((prev) => [
      ...prev.filter((c) => c.nombre !== archivo.name),
      { nombre: archivo.name, progreso: 0, estado: "subiendo" },
    ]);
    const xhr = new XMLHttpRequest();
    const url = evidencia || soloPdf || soporte ? direccion : `${direccion}${direccion.includes("?") ? "&" : "?"}rol=${rol}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("x-nombre-archivo", encodeURIComponent(archivo.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        actualizar(archivo.name, { progreso: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        actualizar(archivo.name, { estado: "listo", progreso: 100 });
        router.refresh();
      } else {
        let mensaje = "Error en la subida";
        try { mensaje = JSON.parse(xhr.responseText).error ?? mensaje; } catch {}
        actualizar(archivo.name, { estado: "error", mensaje });
      }
    };
    xhr.onerror = () =>
      actualizar(archivo.name, { estado: "error", mensaje: "Error de red" });
    xhr.send(archivo);
  }

  function recibir(lista: FileList | null) {
    if (!lista) return;
    for (const archivo of Array.from(lista)) subir(archivo);
  }

  return (
    <div className="flex flex-col gap-3">
      {evidencia || soloPdf || soporte ? null : (
        // A 390 px el selector baja de línea en lugar de desbordar la página.
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
          Rol de los archivos a subir
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as RolArchivo)}
            className="min-w-0 max-w-full rounded-md border border-border bg-card px-2 py-1"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
            ))}
          </select>
        </label>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={soloPdf ? "Zona de carga: arrastre el PDF o presione para elegirlo" : "Zona de carga: arrastre archivos o presione para elegirlos"}
        onClick={() => entradaRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && entradaRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); recibir(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
          arrastrando ? "border-marca bg-azul/5" : "border-border text-muted-foreground"
        }`}
      >
        <span className="font-medium">{soloPdf ? "Arrastre el PDF aquí" : "Arrastre los archivos aquí"}</span>
        <span>
          {soloPdf
            ? "o haga clic para elegirlo (un PDF, máx. 25 MB)"
            : soporte
              ? "o haga clic para elegirlos (PDF, imagen o Excel .xlsx, máx. 25 MB c/u)"
              : evidencia
                ? "o haga clic para elegirlos (PDF o imagen, máx. 25 MB c/u)"
              : "o haga clic para elegirlos (máx. 25 MB c/u)"}
        </span>
        <input
          ref={entradaRef}
          type="file"
          accept={soloPdf ? "application/pdf,.pdf" : undefined}
          multiple={!soloPdf}
          hidden
          onChange={(e) => { recibir(e.target.files); e.target.value = ""; }}
        />
      </div>

      {cargas.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {cargas.map((c) => (
            <li key={c.nombre} className="text-sm">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="min-w-0 break-words">{c.nombre}</span>
                <span className={c.estado === "error" ? "text-estado-critico-texto" : "text-muted-foreground"}>
                  {c.estado === "listo" ? "Listo" : c.estado === "error" ? c.mensaje : `${c.progreso}%`}
                </span>
              </span>
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-muted">
                <span
                  className={`block h-full transition-all ${c.estado === "error" ? "bg-estado-critico" : "bg-marca-relleno"}`}
                  style={{ width: `${c.progreso}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
