"use client";

// app/sigap/pedia/kelola/BagianFile.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- tabel & unggah file bukti, Verifikasi Ulang, Paket Bukti -- permintaan user.

import { useMemo, useRef, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Pesan, TD, TH } from "../../admin/ui";
import { JENIS_FILE, ukuranRapi, waktuWibPanjang } from "@/lib/pedia/umum";
import { unduhBiner, unggahFile } from "../api";
import Penampil from "./Penampil";

export type BarisFile = {
  id: number;
  induk_file_id: number | null;
  jenis: string;
  nama_asli: string;
  mime: string | null;
  ukuran: number;
  sha256: string;
  tsa_status: string;
  tsa_nama: string | null;
  tsa_gen_time: string | null;
  tsa_serial: string | null;
  tsa_percobaan: number;
  tsa_galat: string | null;
  email: { subject?: string; date?: string | null; from?: string } | null;
  dkim: { status: string; domain: string | null; selector: string | null; algoritma: string | null; diverifikasi_at: string; snapshot_dns: { nama: string }[] } | null;
  diunggah_oleh: string | null;
  dibuat_at: string;
};

type HasilVerif = {
  semua_cocok: boolean;
  file: {
    file_id: number;
    nama: string;
    jenis: string;
    sha256_tersimpan: string;
    sha256_storage: string | null;
    hash_cocok: boolean;
    tsa: { status: string; valid: boolean | null; gen_time: string | null; tsa: string | null; catatan: string | null };
    dkim: { dns_sekarang: string | null; snapshot: string | null; domain: string | null; catatan: string | null } | null;
    galat: string | null;
  }[];
};

function tebakDariNama(n: string): string {
  const x = n.toLowerCase();
  if (x.endsWith(".eml")) return "eml";
  if (x.endsWith(".html") || x.endsWith(".htm") || x.endsWith(".mhtml") || x.endsWith(".mht")) return "html";
  if (x.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp)$/.test(x)) return "dkim_screenshot";
  return "otomatis";
}

export default function BagianFile({
  entriId,
  nomor,
  file,
  bolehTambah,
  verifTerakhir,
  onBerubah,
}: {
  entriId: number;
  nomor: string;
  file: BarisFile[];
  bolehTambah: boolean;
  verifTerakhir: { at: string; oleh: string | null; semua_cocok: boolean } | null;
  onBerubah: () => void;
}) {
  const [antre, setAntre] = useState<{ file: File; jenis: string }[]>([]);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat" | "peringatan"; teks: React.ReactNode } | null>(null);
  const [lihat, setLihat] = useState<{ ids: number[]; judul: string } | null>(null);
  const [verif, setVerif] = useState<HasilVerif | null>(null);
  const masuk = useRef<HTMLInputElement>(null);
  const eml = useMemo(() => file.filter((f) => f.jenis === "eml"), [file]);

  async function unggah() {
    if (!antre.length) return;
    setSibuk("unggah");
    setPesan(null);
    try {
      const r = await unggahFile(entriId, antre);
      const gagal = r.hasil.filter((h) => !h.ok);
      setPesan({
        jenis: gagal.length ? (r.ok ? "peringatan" : "galat") : "ok",
        teks: (
          <ul className="list-disc pl-4">
            {r.hasil.map((h) => (
              <li key={h.nama}>
                <b>{h.nama}</b>:{" "}
                {h.ok
                  ? `tersimpan · SHA-256 ${h.sha256?.slice(0, 12)}… · timestamp ${h.tsa_status === "ok" ? "✔" : "tertunda (bisa dicoba ulang)"}${h.dkim ? ` · DKIM ${h.dkim.toUpperCase()}` : ""}${h.lampiran ? ` · ${h.lampiran} lampiran diekstrak` : ""}`
                  : h.galat}
              </li>
            ))}
          </ul>
        ),
      });
      setAntre([]);
      if (masuk.current) masuk.current.value = "";
      onBerubah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  async function unduh(f: BarisFile, mode: "unduh" | "tsr") {
    try {
      const r = await fetchJson<{ url: string }>(`/api/sigap/pedia/file/${f.id}?mode=${mode}`);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  async function ulangTsa(f: BarisFile) {
    setSibuk(`tsa-${f.id}`);
    try {
      const r = await fetchJson<{ ok: boolean; galat?: string[] }>(`/api/sigap/pedia/file/${f.id}`, { method: "POST" });
      setPesan(r.ok ? { jenis: "ok", teks: `Timestamp ${f.nama_asli} berhasil.` } : { jenis: "peringatan", teks: `Semua TSA masih gagal: ${(r.galat ?? []).join(" | ")}` });
      onBerubah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  async function verifikasiUlang() {
    setSibuk("verif");
    try {
      setVerif(await fetchJson<HasilVerif>(`/api/sigap/pedia/${entriId}/verifikasi`, { method: "POST" }));
      onBerubah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  async function paket() {
    setSibuk("paket");
    try {
      await unduhBiner(`/api/sigap/pedia/paket?id=${entriId}`, `PaketBukti_${nomor.replace(/\//g, "_")}.zip`);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#E3E8EE] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E3E8EE] px-4 py-3">
        <h2 className="mr-auto text-[15px] font-semibold">File bukti ({file.length})</h2>
        {eml.length > 1 && (
          <button type="button" className={BTN_O} onClick={() => setLihat({ ids: eml.map((f) => f.id), judul: "Thread email (kronologis)" })}>
            Lihat thread email
          </button>
        )}
        <button type="button" className={BTN_O} disabled={!file.length || !!sibuk} onClick={verifikasiUlang}>
          {sibuk === "verif" ? "Memverifikasi…" : "Verifikasi Ulang"}
        </button>
        <button type="button" className={BTN} disabled={!file.length || !!sibuk} onClick={paket}>
          {sibuk === "paket" ? "Menyiapkan ZIP…" : "Paket Bukti (ZIP)"}
        </button>
      </div>

      {pesan && (
        <div className="px-4 pt-3">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>
            {pesan.teks}
          </Pesan>
        </div>
      )}

      {verif && (
        <div className="px-4 pt-3">
          <Pesan jenis={verif.semua_cocok ? "ok" : "galat"} onTutup={() => setVerif(null)}>
            <b>{verif.semua_cocok ? "Semua file COCOK" : "Ada file yang TIDAK COCOK"}</b> — hasil verifikasi ulang:
            <ul className="mt-1 space-y-0.5">
              {verif.file.map((h) => (
                <li key={h.file_id}>
                  <b>{h.nama}</b>: hash {h.hash_cocok ? "cocok ✔" : `TIDAK cocok ✘ (storage ${h.sha256_storage?.slice(0, 12) ?? "–"}…)`} · timestamp{" "}
                  {h.tsa.valid === null ? "tertunda" : h.tsa.valid ? `valid ✔ (${h.tsa.tsa}, ${waktuWibPanjang(h.tsa.gen_time)})` : `TIDAK valid ✘ (${h.tsa.catatan})`}
                  {h.dkim && ` · DKIM DNS sekarang: ${String(h.dkim.dns_sekarang).toUpperCase()}, dgn kunci tersimpan: ${String(h.dkim.snapshot ?? "–").toUpperCase()}`}
                  {h.dkim?.catatan && <span className="block text-[12px]">{h.dkim.catatan}</span>}
                  {h.galat && <span className="block text-[12px]">Galat: {h.galat}</span>}
                </li>
              ))}
            </ul>
          </Pesan>
        </div>
      )}
      {!verif && verifTerakhir && (
        <p className="px-4 pt-2 text-[12px] text-[#7B8794]">
          Verifikasi ulang terakhir: {waktuWibPanjang(verifTerakhir.at)} oleh {verifTerakhir.oleh ?? "–"} —{" "}
          <b className={verifTerakhir.semua_cocok ? "text-[#12816A]" : "text-[#B5352D]"}>{verifTerakhir.semua_cocok ? "semua cocok" : "ada yang tidak cocok"}</b>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={TH}>File</th>
              <th className={TH}>Jenis</th>
              <th className={`${TH} text-right`}>Ukuran</th>
              <th className={TH}>SHA-256</th>
              <th className={TH}>Timestamp (TSA)</th>
              <th className={TH}>DKIM</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {file.length === 0 && (
              <tr>
                <td colSpan={7} className={`${TD} py-6 text-center text-[#7B8794]`}>
                  Belum ada file bukti. Unggah .eml jawaban (Gmail → ⋮ → Download message), PDF export portal, dan HTML SingleFile.
                </td>
              </tr>
            )}
            {file.map((f) => (
              <tr key={f.id} className="hover:bg-[#F8FAFC]">
                <td className={`${TD} max-w-[260px]`}>
                  <div className="truncate font-semibold" title={f.nama_asli}>
                    {f.induk_file_id ? "↳ " : ""}
                    {f.nama_asli}
                  </div>
                  <div className="text-[11.5px] text-[#7B8794]">
                    {f.email?.subject ? `${f.email.subject} · ` : ""}diunggah {waktuWibPanjang(f.dibuat_at)}
                  </div>
                </td>
                <td className={TD}>
                  <span className="text-[12px]">{JENIS_FILE[f.jenis]?.split(" (")[0] ?? f.jenis}</span>
                </td>
                <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{ukuranRapi(f.ukuran)}</td>
                <td className={TD}>
                  <button type="button" title={`${f.sha256} — klik untuk menyalin`} className="font-mono text-[11.5px] text-[#4D5B6B] hover:text-[#1F6FD1]" onClick={() => navigator.clipboard?.writeText(f.sha256)}>
                    {f.sha256.slice(0, 16)}…
                  </button>
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {f.tsa_status === "ok" ? (
                    <span title={`serial ${f.tsa_serial}`}>
                      <Chip w="ok">✔ {f.tsa_nama}</Chip>
                      <span className="ml-1 text-[11.5px] text-[#7B8794]">{waktuWibPanjang(f.tsa_gen_time)}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5" title={f.tsa_galat ?? ""}>
                      <Chip w="wait">pending ({f.tsa_percobaan}x)</Chip>
                      <button type="button" className="text-[12px] font-semibold text-[#1F6FD1] hover:underline" disabled={!!sibuk} onClick={() => ulangTsa(f)}>
                        {sibuk === `tsa-${f.id}` ? "mencoba…" : "coba ulang"}
                      </button>
                    </span>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {f.dkim ? (
                    <span title={`s=${f.dkim.selector ?? "-"} · ${f.dkim.algoritma ?? ""} · diverifikasi ${waktuWibPanjang(f.dkim.diverifikasi_at)} · kunci DNS tersimpan: ${f.dkim.snapshot_dns?.length ?? 0}`}>
                      <Chip w={f.dkim.status === "pass" ? "ok" : "bad"}>
                        {f.dkim.status === "pass" ? "✔" : "✘"} {f.dkim.status.toUpperCase()}
                      </Chip>
                      {f.dkim.domain && <span className="ml-1 text-[11.5px] text-[#4D5B6B]">d={f.dkim.domain}</span>}
                    </span>
                  ) : (
                    <span className="text-[#CDD5DE]">–</span>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  <div className="flex justify-end gap-2 text-[12px] font-semibold">
                    <button type="button" className="text-[#1F6FD1] hover:underline" onClick={() => setLihat({ ids: [f.id], judul: f.nama_asli })}>
                      Lihat
                    </button>
                    <button type="button" className="text-[#1F6FD1] hover:underline" onClick={() => unduh(f, "unduh")}>
                      Unduh
                    </button>
                    {f.tsa_status === "ok" && (
                      <button type="button" className="text-[#1F6FD1] hover:underline" onClick={() => unduh(f, "tsr")}>
                        .tsr
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bolehTambah && (
        <div className="space-y-2 border-t border-[#E3E8EE] bg-[#F8FAFC] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={masuk}
              type="file"
              multiple
              accept=".eml,.html,.htm,.mhtml,.mht,.pdf,.png,.jpg,.jpeg,.webp,message/rfc822,application/pdf,text/html,image/*,*/*"
              onChange={(e) => setAntre(Array.from(e.target.files ?? []).map((file) => ({ file, jenis: tebakDariNama(file.name) })))}
              className="text-[13px]"
            />
            <span className="text-[11.5px] text-[#7B8794]">Maks 25 MB per file. File disimpan apa adanya (tidak dikompres/diubah), lalu di-hash & diberi timestamp.</span>
          </div>
          {antre.length > 0 && (
            <div className="space-y-1.5">
              {antre.map((a, i) => (
                <div key={`${a.file.name}-${i}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{a.file.name}</span>
                  <span className="text-[12px] text-[#7B8794]">{ukuranRapi(a.file.size)}</span>
                  <select value={a.jenis} onChange={(e) => setAntre(antre.map((x, j) => (j === i ? { ...x, jenis: e.target.value } : x)))} className={`${INPUT} h-8`}>
                    <option value="otomatis">otomatis (dari isi)</option>
                    {Object.entries(JENIS_FILE).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button type="button" className={BTN} disabled={!!sibuk} onClick={unggah}>
                {sibuk === "unggah" ? "Mengunggah, menghitung hash & meminta timestamp…" : `Unggah ${antre.length} file`}
              </button>
            </div>
          )}
        </div>
      )}

      {lihat && <Penampil fileIds={lihat.ids} judul={lihat.judul} onTutup={() => setLihat(null)} />}
    </section>
  );
}
