export type ResultadoUrlPublica = { ok: true; url: string } | { ok: false; error: string };

const ERROR =
  "La dirección debe empezar por http:// o https:// y llevar solo el servidor y el puerto, sin ruta, consulta ni fragmento; por ejemplo https://sgc.hospital.gov.co";

/** La dirección pública de la plataforma: solo el origen. Vacía es válida (el sello sale sin QR). */
export function validarUrlPublica(texto: string): ResultadoUrlPublica {
  const limpio = texto.trim();
  if (limpio === "") return { ok: true, url: "" };
  if (/\s/.test(limpio)) return { ok: false, error: ERROR };
  try {
    const u = new URL(limpio);
    const valida =
      (u.protocol === "http:" || u.protocol === "https:") &&
      u.hostname !== "" &&
      u.username === "" &&
      u.password === "" &&
      u.pathname === "/" &&
      u.search === "" &&
      u.hash === "" &&
      !/[?#]$/.test(limpio);
    if (!valida) return { ok: false, error: ERROR };
    return { ok: true, url: `${u.protocol}//${u.host}` };
  } catch {
    return { ok: false, error: ERROR };
  }
}
