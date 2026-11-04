import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("redirecciones del proxy", () => {
  it("/admin/ingreso sin cookie redirige a /ingreso", () => {
    const res = proxy(new NextRequest("http://localhost/admin/ingreso"));
    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/ingreso");
  });
});
