/** Notificaciones de la campana, contra la BD de desarrollo (usuarios únicos por corrida). */
import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  contarNoLeidas,
  crearNotificacion,
  listarRecientes,
  marcarLeida,
  marcarTodasLeidas,
} from "@/db/consultas/notificaciones";

let a: number;
let b: number;

async function crearUsuario(nombre: string): Promise<number> {
  const [u] = await obtenerSql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave, rol, acepto_datos_en)
    VALUES (${nombre}, ${nombre}, 'hash-falso', 'consulta', now()) RETURNING id`;
  return Number(u.id);
}

beforeAll(async () => {
  const ts = Date.now();
  a = await crearUsuario(`zz_notif_a_${ts}`);
  b = await crearUsuario(`zz_notif_b_${ts}`);
});

describe("notificaciones", () => {
  it("crear, contar y listar; marcar propias y no ajenas", async () => {
    const id = await crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "Hola", enlace: "/cuenta" });
    expect(await contarNoLeidas(a)).toBe(1);
    expect((await listarRecientes(a))[0]).toMatchObject({ id, titulo: "Hola", leidaEn: null });
    expect(await marcarLeida(id, b)).toBeNull();
    expect(await contarNoLeidas(a)).toBe(1);
    expect(await marcarLeida(id, a)).toBe("/cuenta");
    expect(await contarNoLeidas(a)).toBe(0);
    expect(await marcarLeida(id, a)).toBe("/cuenta");
    await crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "Dos" });
    await crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "Tres" });
    expect(await marcarTodasLeidas(a)).toBe(2);
  });

  it("crearNotificacion acepta una transacción", async () => {
    const id = await obtenerSql().begin((tx) => crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "En tx" }, tx));
    expect((await listarRecientes(a))[0]).toMatchObject({ id, titulo: "En tx" });
    await marcarTodasLeidas(a);
  });

  it("listarRecientes devuelve como máximo el límite, más recientes primero", async () => {
    for (let i = 0; i < 12; i++) await crearNotificacion({ usuarioId: b, tipo: "prueba", titulo: `N${i}` });
    const lista = await listarRecientes(b);
    expect(lista).toHaveLength(10);
    expect(lista[0].titulo).toBe("N11");
  });
});
