"use client";

import { useEffect, useId, useRef } from "react";

export function Dialogo({
  abierto,
  alCerrar,
  titulo,
  children,
  className,
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (abierto && !el.open) el.showModal();
    else if (!abierto && el.open) el.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      className={className}
      onClose={alCerrar}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <h2 id={idTitulo} className="sr-only">
        {titulo}
      </h2>
      {children}
    </dialog>
  );
}
