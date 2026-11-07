import { BadgeCheck, TriangleAlert } from "lucide-react";

/** La versión del `?v=` del QR de una copia controlada: solo de uno a cuatro dígitos; lo demás se ignora. */
export function versionDeQr(valor: string | string[] | undefined): number | null {
  return typeof valor === "string" && /^\d{1,4}$/.test(valor) ? Number(valor) : null;
}

/** Dice a quien escaneó el sello si su copia es de la versión vigente. El estado va siempre en texto. */
export function AvisoVersionQr({ solicitada, vigente }: { solicitada: number | null; vigente: number }) {
  if (solicitada === null) return null;
  const vigenteIgual = solicitada === vigente;
  const texto = vigenteIgual
    ? "Esta copia corresponde a la versión vigente"
    : `Esta copia es de la versión ${solicitada}; la vigente es la ${vigente}`;
  const Icono = vigenteIgual ? BadgeCheck : TriangleAlert;
  return (
    <p
      role="status"
      className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
        vigenteIgual ? "bg-estado-bien-fondo text-estado-bien-texto" : "bg-estado-atencion-fondo text-estado-atencion-texto"
      }`}
    >
      <Icono className="size-4 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  );
}
