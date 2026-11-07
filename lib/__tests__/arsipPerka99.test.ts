import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kkaSah } from "@/lib/arsip/nomor";

// Memeriksa SQL 20261107e_arsip_kka_perka99.sql: tabel kode klasifikasi arsip harus sesuai bentuk Lampiran Perka BPS 99/2018.
const SQL = readFileSync(path.join(process.cwd(), "skema-sql/fase-b/20261107e_arsip_kka_perka99.sql"), "utf8");

function barisKode(): { kode: string; nama: string; fungsi: string; induk: string | null; tingkat: number }[] {
  const mulai = SQL.indexOf("from (values", SQL.indexOf("insert into public.arsip_kode"));
  const akhir = SQL.indexOf(") as v(kode, nama, fungsi, induk, tingkat, kelompok, catatan)", mulai);
  const isi = SQL.slice(mulai, akhir);
  const hasil: { kode: string; nama: string; fungsi: string; induk: string | null; tingkat: number }[] = [];
  const re = /\('([A-Z]{2}\.\d{3})', '((?:[^']|'')*)', '([A-Z]{2})', (null|'[A-Z]{2}\.\d{3}'), (\d), '(?:substantif|fasilitatif)', (?:null|'(?:[^']|'')*')\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(isi))) hasil.push({ kode: m[1], nama: m[2].replace(/''/g, "'"), fungsi: m[3], induk: m[4] === "null" ? null : m[4].slice(1, -1), tingkat: Number(m[5]) });
  return hasil;
}

describe("kode klasifikasi arsip Perka BPS 99/2018", () => {
  const kode = barisKode();
  const peta = new Map(kode.map((k) => [k.kode, k]));
  const mulai = SQL.indexOf("from (values", SQL.indexOf("insert into public.arsip_kode"));
  const barisMentah = (SQL.slice(mulai, SQL.indexOf(") as v(kode, nama, fungsi, induk", mulai)).match(/^ {2}\('/gm) ?? []).length;

  it("semua baris terbaca dan tidak ada kode kembar", () => {
    expect(kode.length).toBeGreaterThan(550);
    expect(peta.size).toBe(kode.length);
    expect(kode.length).toBe(barisMentah); // setiap baris nilai terbaca oleh pola (tidak ada baris yang lolos diam-diam)
  });

  it("nama kode memenuhi batas tabel arsip_kode (3 sampai 200 karakter), uraian panjang dipindah ke catatan", () => {
    for (const k of kode) {
      const n = k.nama.trim().length;
      expect(n >= 3 && n <= 200, `${k.kode} (${n} karakter)`).toBe(true);
    }
    expect(peta.get("KU.830")?.nama.endsWith("SPDR")).toBe(true);
  });

  it("setiap kode sah menurut pola dua huruf, titik, tiga angka (paling banyak 5 digit)", () => {
    for (const k of kode) expect(kkaSah(k.kode), k.kode).toBe(true);
  });

  it("induk ada, sefungsi, dan tingkat sesuai (x00 = pokok masalah, xx0 = sub masalah, xxx = sub-sub masalah)", () => {
    for (const k of kode) {
      const [, n] = k.kode.split(".");
      const tingkat = n[2] !== "0" ? 3 : n[1] !== "0" ? 2 : 1;
      expect(k.tingkat, k.kode).toBe(tingkat);
      if (tingkat === 1) expect(k.induk, k.kode).toBeNull();
      else {
        expect(k.induk, k.kode).not.toBeNull();
        expect(peta.has(k.induk!), `${k.kode} induk ${k.induk}`).toBe(true);
        expect(peta.get(k.induk!)!.fungsi).toBe(k.fungsi);
      }
    }
  });

  it("kode yang dipakai kantor sesuai uraian Perka (bukan menurut kegiatan)", () => {
    expect(peta.get("VS.220")?.nama).toBe("Pelatihan Petugas");
    expect(peta.get("VS.230")?.nama).toBe("Pelatihan Petugas Pengolahan");
    expect(peta.get("VS.330")?.nama).toBe("Pengumpulan Data");
    expect(peta.get("SS.330")?.nama).toBe("Pengumpulan Data");
    expect(peta.get("KU.330")?.nama).toBe("Belanja Jasa (Konsultan, Profesi)");
    expect(peta.get("KP.650")?.nama).toBe("Surat Perintah Dinas/Surat Tugas");
    expect(peta.get("KA.110")?.nama).toBe("Surat Masuk/Surat Keluar");
  });

  it("tidak ada lagi pemetaan kode per kegiatan", () => {
    expect(SQL).toMatch(/drop table if exists public\.arsip_kegiatan_kka/);
    const fungsiBaru = SQL.slice(SQL.indexOf("create or replace function public.arsip_ambil_nomor"));
    expect(fungsiBaru).not.toMatch(/from public\.arsip_kegiatan_kka/);
  });

  it("pola nomor pengadaan barang/jasa dan 22 nomor paket Susenas Maret + Seruti TW I 2026", () => {
    expect(SQL).toContain("'{urut3}/PPK-BPSKAB/SOLOK/K/{tahun}'");
    const paket = SQL.slice(SQL.indexOf("insert into public.arsip_nomor"));
    const urut = Array.from(paket.matchAll(/^ {2}\((\d+), '/gm)).map((m) => Number(m[1]));
    expect(urut).toHaveLength(22);
    expect(urut[0]).toBe(74);
    expect(urut[urut.length - 1]).toBe(97);
    expect(urut).not.toContain(85);
    expect(urut).not.toContain(86);
    expect(new Set(urut).size).toBe(22);
  });
});
