import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---- DB tiruan sederhana (tabel di memori; rantai select/eq/in/order/update/insert) ----
type Baris = Record<string, unknown>;
let tabel: Record<string, Baris[]> = {};
const panggilanRpc: { nama: string; arg: Record<string, unknown> }[] = [];
let jawabRpc: (nama: string, arg: Record<string, unknown>) => { data: unknown; error: { message: string } | null } = () => ({ data: { ok: true }, error: null });
const sisipan: { tabel: string; baris: Baris }[] = [];

function rantai(nama: string) {
  const saring: ((b: Baris) => boolean)[] = [];
  let patch: Baris | null = null;
  const q = {
    select: () => q,
    order: () => q,
    eq: (k: string, v: unknown) => {
      saring.push((b) => b[k] === v);
      return q;
    },
    in: (k: string, arr: unknown[]) => {
      saring.push((b) => arr.includes(b[k]));
      return q;
    },
    update: (p: Baris) => {
      patch = p;
      return q;
    },
    insert: (b: Baris) => {
      sisipan.push({ tabel: nama, baris: b });
      return Promise.resolve({ data: null, error: null });
    },
    then: (ok: (v: unknown) => unknown) => {
      const kena = (tabel[nama] ?? []).filter((b) => saring.every((f) => f(b)));
      if (patch) kena.forEach((b) => Object.assign(b, patch));
      return Promise.resolve({ data: patch ? null : kena, error: null }).then(ok);
    },
  };
  return q;
}
const db = { from: (n: string) => rantai(n), rpc: async (nama: string, arg: Record<string, unknown>) => { panggilanRpc.push({ nama, arg }); return jawabRpc(nama, arg); } };

let akses: unknown = { penugasan: {}, tanggal: "2026-10-20", susulan: true };
let jarak = 100; // m dari wilayah untuk semua foto
let mode = "kamera";

vi.mock("@/lib/sigap", () => ({
  hariIniWib: () => "2026-10-21",
  tanggalValid: (t: unknown) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t),
  penugasanAkun: async () => [{ id: 49, kegiatan: { id: 1, nama: "Pendataan", jumlah_foto: 5 } }],
  cekAksesIsian: async () => akses,
}));
vi.mock("@/lib/sigapFotoServer", () => ({
  modeKegiatan: async () => ({ 1: mode }),
  jarakKeWilayah: async () => jarak,
  jarakKeRumah: async () => null,
}));
vi.mock("@/lib/sigapFotoRoute", () => ({
  masukFoto: async () => ({ db, akunId: 266, akun: { id: 266, nama: "Hariston", token: "tok123" } }),
  galat: (error: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error, ...ekstra }, { status }),
}));

import { GET, POST } from "@/app/api/sigap/foto/susun/route";

const foto = (id: number, menit: number, o: Baris = {}): Baris => ({
  id, kode: "K" + id, kepercayaan: "hijau", alasan: [], diambil_at: new Date(Date.UTC(2026, 9, 20, 8, menit)).toISOString(), status_periksa: "belum",
  lat: -0.8, lng: 100.6, akun_pengambil: 266, kegiatan_id: 1, tanggal: "2026-10-20", ...o,
});
const tag = (id: number, foto_id: number, status = "diajukan"): Baris => ({ id, foto_id, akun_id: 266, peran_tag: "pemotret", status });

function req(isi: Record<string, unknown>) {
  return new NextRequest("http://x/api/sigap/foto/susun", { method: "POST", body: JSON.stringify({ kegiatan_id: 1, tanggal: "2026-10-20", ...isi }), headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  panggilanRpc.length = 0;
  sisipan.length = 0;
  jawabRpc = () => ({ data: { ok: true }, error: null });
  akses = { penugasan: {}, tanggal: "2026-10-20", susulan: true };
  jarak = 100;
  mode = "kamera";
  // kasus penugasan 49 (20 Okt): nomor 3 dan 5 sudah kamera; 1 dan 2 unggahan manual; nomor 4 kosong; dua foto tak bernomor
  tabel = {
    sigap_dokumentasi: [
      { id: 10, penugasan_id: 49, tanggal: "2026-10-20", slot: 1, sumber: "unggah", susulan: true, foto_id: null },
      { id: 11, penugasan_id: 49, tanggal: "2026-10-20", slot: 2, sumber: "unggah", susulan: true, foto_id: null },
      { id: 12, penugasan_id: 49, tanggal: "2026-10-20", slot: 3, sumber: "kamera", susulan: false, foto_id: 311 },
      { id: 13, penugasan_id: 49, tanggal: "2026-10-20", slot: 5, sumber: "kamera", susulan: false, foto_id: 369 },
    ],
    sigap_foto: [foto(279, 38), foto(364, 55), foto(311, 70), foto(369, 80)],
    sigap_foto_tag: [tag(305, 279), tag(399, 364, "dilepas"), tag(345, 311, "diterima"), tag(404, 369, "diterima")],
  };
});

describe("GET /api/sigap/foto/susun", () => {
  it("melaporkan nomor terisi/kosong, cadangan, dan saran nomor berikutnya", async () => {
    const r = await GET(new NextRequest("http://x/api/sigap/foto/susun?kegiatan=1&tanggal=2026-10-20"));
    const j = await r.json();
    expect(j.boleh).toBe(true);
    expect(j.kosong).toEqual([4]);
    expect(j.saran).toBe(4);
    expect(j.nomor.map((n: { terisi: boolean }) => n.terisi)).toEqual([true, true, true, false, true]);
    expect(j.nomor[0].foto).toBeNull(); // unggahan manual
    expect(j.nomor[2].foto.id).toBe(311);
    expect(j.cadangan.map((c: { id: number }) => c.id)).toEqual([279, 364]); // termasuk yang tergeser (tag dilepas)
    // tombol "Rapikan nomor foto": tautan dalam ke kartu hari tanggal itu, bagian foto
    expect(j.href_kerja).toBe("/sigap/translok/tok123?p=49&tab=hari_kerja&tgl=2026-10-20&fokus=foto");
  });
  it("tanggal hari ini: tautan membuka tab hari ini", async () => {
    const j = await (await GET(new NextRequest("http://x/api/sigap/foto/susun?kegiatan=1&tanggal=2026-10-21"))).json();
    expect(j.href_kerja).toBe("/sigap/translok/tok123?p=49&tab=hari_ini&tgl=2026-10-21&fokus=foto");
  });
  it("foto merah yang belum diperiksa dan foto 'dipertanyakan' tidak ikut cadangan", async () => {
    tabel.sigap_foto.push(foto(500, 5, { kepercayaan: "merah" }), foto(501, 6, { status_periksa: "dipertanyakan" }), foto(502, 7, { kepercayaan: "merah", status_periksa: "diperiksa" }));
    tabel.sigap_foto_tag.push(tag(600, 500), tag(601, 501), tag(602, 502));
    const j = await (await GET(new NextRequest("http://x/api/sigap/foto/susun?kegiatan=1&tanggal=2026-10-20"))).json();
    expect(j.cadangan.map((c: { id: number }) => c.id).sort()).toEqual([279, 364, 502]);
  });
  it("hari yang sudah ditutup: boleh=false dan alasan tampil", async () => {
    akses = { error: "Batas waktu tanggal ini sudah lewat", status: 403 };
    const j = await (await GET(new NextRequest("http://x/api/sigap/foto/susun?kegiatan=1&tanggal=2026-10-20"))).json();
    expect(j.boleh).toBe(false);
    expect(j.alasan_tutup).toMatch(/Batas waktu/);
  });
});

describe("POST aksi 'isi' (susun otomatis)", () => {
  it("memasang foto cadangan ke nomor kosong saja; tidak menyentuh nomor terisi", async () => {
    const r = await POST(req({ aksi: "isi" }));
    const j = await r.json();
    expect(r.status).toBe(200);
    // satu nomor kosong (4), dua foto: dipilih satu, satu jadi cadangan
    expect(j.ditempatkan).toHaveLength(1);
    expect(j.ditempatkan[0].slot).toBe(4);
    expect(j.cadangan).toBe(1);
    expect(panggilanRpc).toHaveLength(1);
    expect(panggilanRpc[0].nama).toBe("sigap_foto_tempatkan");
    expect(panggilanRpc[0].arg).toMatchObject({ p_akun_id: 266, p_penugasan_id: 49, p_slot: 4, p_susulan: true, p_tahan: false });
    expect(sisipan.some((s) => s.tabel === "sigap_audit" && s.baris.aksi === "foto.isi_otomatis")).toBe(true);
  });
  it("tag 'dilepas' dikembalikan ke 'diajukan' sebelum ditempatkan", async () => {
    tabel.sigap_foto = tabel.sigap_foto.filter((f) => f.id !== 279); // hanya foto 364 (tag dilepas)
    tabel.sigap_foto_tag = tabel.sigap_foto_tag.filter((t) => t.foto_id !== 279);
    await POST(req({ aksi: "isi" }));
    expect(tabel.sigap_foto_tag.find((t) => t.id === 399)?.status).toBe("diajukan");
    expect(panggilanRpc).toHaveLength(1);
  });
  it("banyak nomor kosong: foto disusun urut waktu dari nomor terkecil", async () => {
    tabel.sigap_dokumentasi = []; // semua nomor kosong; foto cadangan 279, 364, 311, 369 -> 311 dan 369 bertag diterima, jadi hanya 279 & 364
    tabel.sigap_foto_tag = tabel.sigap_foto_tag.map((t) => (t.foto_id === 311 || t.foto_id === 369 ? { ...t, status: "dilepas" } : t));
    const j = await (await POST(req({ aksi: "isi" }))).json();
    expect(j.ditempatkan.map((d: { foto_id: number; slot: number }) => [d.foto_id, d.slot])).toEqual([[279, 1], [364, 2], [311, 3], [369, 4]]);
  });
  it("tanpa nomor kosong: tidak ada panggilan", async () => {
    tabel.sigap_dokumentasi.push({ id: 14, penugasan_id: 49, tanggal: "2026-10-20", slot: 4, sumber: "unggah", susulan: true, foto_id: null });
    const j = await (await POST(req({ aksi: "isi" }))).json();
    expect(j.ditempatkan).toEqual([]);
    expect(panggilanRpc).toHaveLength(0);
  });
  it("foto jauh dari wilayah tidak diletakkan di nomor berlokasi (4)", async () => {
    jarak = 50_000;
    const j = await (await POST(req({ aksi: "isi" }))).json();
    expect(j.ditempatkan).toEqual([]);
    expect(panggilanRpc).toHaveLength(0);
  });
  it("galat dari fungsi DB dilaporkan di 'gagal', bukan dilempar", async () => {
    jawabRpc = () => ({ data: { ok: false, error: "penugasan_tidak_valid" }, error: null });
    const j = await (await POST(req({ aksi: "isi" }))).json();
    expect(j.ditempatkan).toEqual([]);
    expect(j.gagal).toHaveLength(1);
  });
  it("hari terkunci / bukan izin: ditolak dengan status dari cekAksesIsian", async () => {
    akses = { error: "Batas waktu tanggal ini sudah lewat (23:59 WIB).", status: 403 };
    const r = await POST(req({ aksi: "isi" }));
    expect(r.status).toBe(403);
    expect(panggilanRpc).toHaveLength(0);
  });
  it("kegiatan bermode unggah: ditolak", async () => {
    mode = "unggah";
    expect((await POST(req({ aksi: "isi" }))).status).toBe(403);
  });
});

describe("POST aksi 'pindah' dan 'pasang'", () => {
  it("pindah: memanggil sigap_foto_pindah_nomor dengan nomor yang benar", async () => {
    const r = await POST(req({ aksi: "pindah", dari: 5, ke: 4 }));
    expect(r.status).toBe(200);
    expect(panggilanRpc[0]).toEqual({ nama: "sigap_foto_pindah_nomor", arg: { p_akun: 266, p_penugasan: 49, p_tanggal: "2026-10-20", p_dari: 5, p_ke: 4 } });
  });
  it("pindah: nomor asal kosong ditolak oleh route; nomor tidak sah ditolak", async () => {
    expect((await POST(req({ aksi: "pindah", dari: 4, ke: 1 }))).status).toBe(400);
    expect((await POST(req({ aksi: "pindah", dari: 0, ke: 1 }))).status).toBe(400);
    expect((await POST(req({ aksi: "pindah", dari: 1, ke: 9 }))).status).toBe(400);
    expect(panggilanRpc).toHaveLength(0);
  });
  it("pindah foto kamera yang jauh dari wilayah ke nomor berlokasi ditolak (tidak bisa menyiasati cek lokasi)", async () => {
    jarak = 50_000;
    const r = await POST(req({ aksi: "pindah", dari: 5, ke: 4 }));
    expect(r.status).toBe(422);
    expect(panggilanRpc).toHaveLength(0);
  });
  it("pindah foto jauh ke nomor 1/5 (tidak berlokasi) tetap boleh", async () => {
    jarak = 50_000;
    tabel.sigap_dokumentasi = tabel.sigap_dokumentasi.filter((d) => d.slot !== 1);
    const r = await POST(req({ aksi: "pindah", dari: 3, ke: 1 })); // nomor 1 kosong dan tidak berlokasi
    expect(r.status).toBe(200);
    expect(panggilanRpc).toHaveLength(1);
  });
  it("pasang: foto yang bukan cadangan hari ini -> 404", async () => {
    expect((await POST(req({ aksi: "pasang", foto_id: 311, slot: 4 }))).status).toBe(404);
  });
  it("pasang: foto cadangan ke nomor pilihan memanggil fungsi tempatkan", async () => {
    const r = await POST(req({ aksi: "pasang", foto_id: 279, slot: 4 }));
    expect(r.status).toBe(200);
    expect(panggilanRpc[0].nama).toBe("sigap_foto_tempatkan");
    expect(panggilanRpc[0].arg).toMatchObject({ p_tag_id: 305, p_slot: 4, p_tahan: false });
  });
  it("aksi tidak dikenal ditolak", async () => {
    expect((await POST(req({ aksi: "hapus" }))).status).toBe(400);
  });
});
