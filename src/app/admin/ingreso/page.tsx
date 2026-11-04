import { redirect } from "next/navigation";

// El ingreso vive en /ingreso; esta ruta queda por marcadores y enlaces viejos.
export default function PaginaIngresoAdmin() {
  redirect("/ingreso");
}
