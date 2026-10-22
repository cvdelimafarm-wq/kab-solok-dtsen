// (22 Okt 2026) Uji lib/supabaseServer.ts: opsi auth dimatikan (penyebab kebocoran memori), klien tanpa opsi dipakai bersama, dengan opsi dibuat baru.
import { beforeEach, describe, expect, it, vi } from "vitest";

const panggilan: { url: string; kunci: string; opsi: any }[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, kunci: string, opsi: any) => {
    panggilan.push({ url, kunci, opsi });
    return { __klien: panggilan.length };
  },
}));

import { createClient, jumlahKlienBersama, kosongkanKlienBersama, OPSI_AUTH_SERVER } from "../supabaseServer";

beforeEach(() => {
  panggilan.length = 0;
  kosongkanKlienBersama();
});

describe("createClient server (klien bersama)", () => {
  it("mematikan autoRefreshToken, persistSession, dan detectSessionInUrl", () => {
    createClient("https://a.supabase.co", "kunci-1");
    expect(panggilan).toHaveLength(1);
    expect(panggilan[0].opsi.auth).toEqual({ autoRefreshToken: false, persistSession: false, detectSessionInUrl: false });
    expect(OPSI_AUTH_SERVER.autoRefreshToken).toBe(false);
  });

  it("memakai ulang klien yang sama untuk url dan kunci yang sama (tidak membuat klien per request)", () => {
    const a = createClient("https://a.supabase.co", "kunci-1");
    for (let i = 0; i < 1000; i++) expect(createClient("https://a.supabase.co", "kunci-1")).toBe(a);
    expect(panggilan).toHaveLength(1);
    expect(jumlahKlienBersama()).toBe(1);
  });

  it("membuat klien terpisah untuk kunci berbeda (mis. service-role vs kunci lain)", () => {
    const a = createClient("https://a.supabase.co", "kunci-1");
    const b = createClient("https://a.supabase.co", "kunci-2");
    expect(a).not.toBe(b);
    expect(jumlahKlienBersama()).toBe(2);
  });

  it("dengan opsi: klien dibuat baru (tidak dibagikan), opsi pemanggil dipertahankan, auth tetap dimatikan", () => {
    const a = createClient("https://a.supabase.co", "kunci-1", { global: { headers: { "x-uji": "1" } } });
    const b = createClient("https://a.supabase.co", "kunci-1", { global: { headers: { "x-uji": "2" } } });
    expect(a).not.toBe(b);
    expect(panggilan[0].opsi.global.headers["x-uji"]).toBe("1");
    expect(panggilan[0].opsi.auth.autoRefreshToken).toBe(false);
    expect(jumlahKlienBersama()).toBe(0);
  });

  it("pemanggil boleh menimpa satu opsi auth secara eksplisit", () => {
    createClient("https://a.supabase.co", "kunci-1", { auth: { persistSession: true } });
    expect(panggilan[0].opsi.auth).toEqual({ autoRefreshToken: false, persistSession: true, detectSessionInUrl: false });
  });
});
