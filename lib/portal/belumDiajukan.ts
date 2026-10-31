// lib/portal/belumDiajukan.ts  (hanya server)
//
// (21 Okt 2026) Tab "Belum diajukan": daftar Sub SLS yang belum diajukan + plotting awalnya, dan penugasan admin ke PML plotting / PML (tim) lain.
// Seluruh logika berat ada di fungsi database (hanya service_role): bencana_belum_diajukan, bencana_tim_untuk_tugas, bencana_admin_tugaskan.
// Penugasan = membuat permintaan "menunggu" bertanda dari_admin (TIDAK menghabiskan kuota 7/9/11 PML). Alur selanjutnya sama: admin meng-assign di FASIH
// lalu menandai "sudah keluar". Bila PML tujuan beda dari plotting awal, alokasi lama dipindah (barisnya disimpan di audit).

import type { Db } from "@/lib/sigap";
import { kirimFasih } from "@/lib/portal/pushTerkelola"; // (31 Okt 2026) saklar per kegiatan: tab Notifikasi di Kelola Pendataan
import { catatAudit } from "@/lib/sigapAkses";
import { akunPerPetugas, emailPerAkun, petaWilayah, type Galat } from "@/lib/portal/permintaanDaftar";
import { labelJorong, tanggalWib } from "@/lib/permintaanDaftar";
import { pesanTugas, susunPushTugas, urutBelum, type BelumItem, type DataBelum, type TimTugas, type TugasPilihan } from "@/lib/belumDiajukan";

const adalahBanyak = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/**
 * (24 Okt 2026) Menambah email FASIH PML dan PPL ke daftar tim untuk templat Pengawas-Pencacah di tab "Belum diajukan".
 * Aturan sama dengan permintaan di tab Menunggu admin: bencana_petugas.email_fasih diutamakan, lalu email mitra akun. Gagal membaca email tidak
 * menggagalkan daftar (email dibiarkan kosong; layar memberi peringatan).
 */
async function denganEmailTim(db: Db, tim: TimTugas[]): Promise<TimTugas[]> {
  if (!tim.length) return tim;
  try {
    const pmlIds = tim.map((t) => t.pml_id);
    const pplPetugas = tim.flatMap((t) => t.ppl.map((p) => p.petugas_id));
    const [{ data: ep }, akunPml] = await Promise.all([
      db.from("bencana_petugas").select("id, email_fasih").in("id", [...new Set([...pmlIds, ...pplPetugas])]),
      akunPerPetugas(db, pmlIds),
    ]);
    const emailFasih = new Map<number, string>();
    for (const p of ep ?? []) if (p.email_fasih) emailFasih.set(p.id as number, String(p.email_fasih));
    const emailAkun = await emailPerAkun(db, [...akunPml.values(), ...tim.flatMap((t) => t.ppl.map((p) => p.akun_id))]);
    return tim.map((t) => ({
      ...t,
      pml_email: emailFasih.get(t.pml_id) ?? emailAkun.get(akunPml.get(t.pml_id) ?? -1) ?? "",
      ppl: t.ppl.map((p) => ({ ...p, email: emailFasih.get(p.petugas_id) ?? emailAkun.get(p.akun_id) ?? "" })),
    }));
  } catch (e) {
    console.error("[belum email]", e instanceof Error ? e.message : e);
    return tim;
  }
}

export async function daftarBelumDiajukan(db: Db): Promise<Omit<DataBelum, "boleh_kelola">> {
  const [a, b] = await Promise.all([db.rpc("bencana_belum_diajukan"), db.rpc("bencana_tim_untuk_tugas")]);
  if (a.error) throw new Error("Gagal memuat daftar Sub SLS yang belum diajukan.");
  if (b.error) throw new Error("Gagal memuat daftar tim.");
  return { items: urutBelum(adalahBanyak<BelumItem>(a.data)), tim: await denganEmailTim(db, adalahBanyak<TimTugas>(b.data)) };
}

type HasilRpc =
  | { status: "ok"; ids: number[]; diganti: { idsubsls: string; dari: { pml_id: number }[] }[] }
  | { status: "ditolak"; alasan?: string; idsubsls?: string };

export async function tugaskanSubsls(
  db: Db,
  akun: { id: number },
  pilihan: TugasPilihan[],
): Promise<{ ids: number[]; dikirim: number; dipindah: number } | Galat> {
  const { data, error } = await db.rpc("bencana_admin_tugaskan", { p_akun: akun.id, p_tanggal: tanggalWib(Date.now()), p_pilihan: pilihan });
  if (error) {
    if (/SUB_NONAKTIF/.test(error.message)) return { galat: pesanTugas("nonaktif"), status: 409 };
    if (/check_violation|bukan peserta/i.test(error.message)) return { galat: pesanTugas("bukan_peserta"), status: 409 };
    return { galat: "Penugasan gagal disimpan. Coba lagi.", status: 500 };
  }
  const r = data as HasilRpc;
  if (r.status !== "ok") {
    let label = "";
    if (r.idsubsls) {
      const w = (await petaWilayah(db, [r.idsubsls])).get(r.idsubsls);
      label = w ? labelJorong(String(w.sls ?? ""), String(w.sub_sls ?? "")) : r.idsubsls;
    }
    return { galat: pesanTugas(r.alasan, label), status: r.alasan === "sudah_diminta" || r.alasan === "sudah_didata" ? 409 : 400 };
  }
  const ids = r.ids ?? [];
  const diganti = r.diganti ?? [];
  await catatAudit(db, akun.id, "pendataan_admin_tugaskan", { permintaan: ids, pilihan, diganti }).catch(() => undefined);

  let dikirim = 0;
  try {
    const wil = await petaWilayah(db, pilihan.map((p) => p.idsubsls));
    const jorong = (id: string) => {
      const w = wil.get(id);
      return w ? labelJorong(String(w.sls ?? ""), String(w.sub_sls ?? "")) : id;
    };
    const { data: ppl } = await db.from("sigap_akun").select("id, nama").in("id", [...new Set(pilihan.map((p) => p.ppl_akun_id))]);
    const namaPpl = new Map((ppl ?? []).map((p) => [p.id as number, String(p.nama ?? "")]));
    const pmlLama = [...new Set(diganti.flatMap((d) => d.dari.map((x) => x.pml_id)))];
    const akunPml = await akunPerPetugas(db, [...pilihan.map((p) => p.pml_id), ...pmlLama]);

    const perPml = new Map<number, TugasPilihan[]>();
    const perPpl = new Map<number, TugasPilihan[]>();
    for (const p of pilihan) {
      perPml.set(p.pml_id, [...(perPml.get(p.pml_id) ?? []), p]);
      perPpl.set(p.ppl_akun_id, [...(perPpl.get(p.ppl_akun_id) ?? []), p]);
    }
    for (const [pmlId, rows] of perPml) {
      const a = akunPml.get(pmlId);
      if (!a) continue;
      const { judul, isi } = susunPushTugas("pml", rows.map((p) => ({ jorong: jorong(p.idsubsls), ppl: namaPpl.get(p.ppl_akun_id) ?? "PPL" })));
      dikirim += (await kirimFasih(db, "fasih_tugas", [a], { judul, isi, url: "/sigap/pendataan", tag: `tugas-pml-${pmlId}` })).terkirim;
    }
    for (const [pplId, rows] of perPpl) {
      const { judul, isi } = susunPushTugas("ppl", rows.map((p) => ({ jorong: jorong(p.idsubsls), ppl: namaPpl.get(pplId) ?? "PPL" })));
      dikirim += (await kirimFasih(db, "fasih_tugas", [pplId], { judul, isi, url: "/sigap/pendataan", tag: `tugas-ppl-${pplId}` })).terkirim;
    }
    // PML asal (bila Sub SLS-nya dipindah ke tim lain): satu notifikasi per PML
    const perLama = new Map<number, string[]>();
    for (const d of diganti) for (const x of d.dari) if (!pilihan.some((p) => p.idsubsls === d.idsubsls && p.pml_id === x.pml_id)) perLama.set(x.pml_id, [...new Set([...(perLama.get(x.pml_id) ?? []), jorong(d.idsubsls)])]);
    for (const [pmlId, daftar] of perLama) {
      const a = akunPml.get(pmlId);
      if (!a) continue;
      const { judul, isi } = susunPushTugas("lama", daftar.map((j) => ({ jorong: j, ppl: "" })));
      dikirim += (await kirimFasih(db, "fasih_tugas", [a], { judul, isi, url: "/sigap/pendataan", tag: `tugas-lama-${pmlId}` })).terkirim;
    }
  } catch (e) {
    console.error("[tugaskan push]", e instanceof Error ? e.message : e);
  }
  return { ids, dikirim, dipindah: diganti.length };
}

/**
 * (30 Okt 2026) Admin menandai Sub SLS yang SUDAH di-assign di FASIH (di luar alur permintaan SIGAP: assign langsung ke FASIH) sebagai "sudah keluar".
 * Sub SLS itu langsung masuk tab Sudah keluar (permintaan dari_admin berstatus sudah_keluar) dan keluar dari tab Belum diajukan. TANPA notifikasi
 * (petugasnya sudah bekerja di FASIH) dan tidak memakai kuota PML. Tiap Sub SLS diproses sendiri-sendiri lewat fungsi bencana_admin_tugaskan supaya satu
 * Sub SLS yang ditolak (mis. daftar KK belum diunggah) tidak menggagalkan yang lain; yang ditolak dilaporkan beserta alasannya.
 */
export async function tandaiKeluarLangsung(
  db: Db,
  akun: { id: number },
  pilihan: TugasPilihan[],
): Promise<{ ids: number[]; ditolak: { idsubsls: string; label: string; alasan: string }[] } | Galat> {
  const wil = await petaWilayah(db, pilihan.map((p) => p.idsubsls));
  const labelDari = (id: string) => {
    const w = wil.get(id);
    return w ? labelJorong(String(w.sls ?? ""), String(w.sub_sls ?? "")) : id;
  };
  const ids: number[] = [];
  const ditolak: { idsubsls: string; label: string; alasan: string }[] = [];
  const tanggal = tanggalWib(Date.now());
  for (const p of pilihan) {
    const { data, error } = await db.rpc("bencana_admin_tugaskan", { p_akun: akun.id, p_tanggal: tanggal, p_pilihan: [p] });
    if (error) {
      const alasan = /SUB_NONAKTIF/.test(error.message) ? "nonaktif" : /check_violation|bukan peserta/i.test(error.message) ? "bukan_peserta" : "gagal";
      ditolak.push({ idsubsls: p.idsubsls, label: labelDari(p.idsubsls), alasan });
      continue;
    }
    const r = data as HasilRpc;
    if (r.status !== "ok") {
      ditolak.push({ idsubsls: p.idsubsls, label: labelDari(p.idsubsls), alasan: r.alasan ?? "gagal" });
      continue;
    }
    ids.push(...(r.ids ?? []));
  }
  if (ids.length) {
    const { data, error } = await db
      .from("bencana_pendataan_permintaan")
      .update({ status: "sudah_keluar", selesai_oleh: akun.id, selesai_at: new Date().toISOString() })
      .in("id", ids)
      .eq("status", "menunggu")
      .select("id");
    if (error) return { galat: "Penugasan tercatat tetapi gagal ditandai sudah keluar. Buka tab Menunggu admin lalu tandai sudah keluar di sana.", status: 500 };
    const ok = new Set(((data ?? []) as { id: number }[]).map((x) => x.id));
    await catatAudit(db, akun.id, "pendataan_admin_tandai_keluar", { permintaan: [...ok], pilihan: pilihan.map((p) => p.idsubsls), ditolak }).catch(() => undefined);
    return { ids: [...ok], ditolak };
  }
  return { ids: [], ditolak };
}
