"use client";

// app/sigap/pedia/kelola/Penampil.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- viewer bukti (khusus pengelola) -- permintaan user:
//   * .eml: thread kronologis (header + body). Body HTML DISANITASI (DOMPurify) lalu dirender di
//     <iframe sandbox> TANPA allow-scripts, dgn CSP yg memblokir gambar/sumber eksternal secara default.
//   * HTML portal (SingleFile): juga disanitasi + iframe sandbox.
//   * PDF/gambar: signed URL pendek.

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN_O, Memuat, Pesan } from "../../admin/ui";
import { waktuWibPanjang } from "@/lib/pedia/umum";

type IsiLihat =
  | { jenis: "eml"; header: { from: string; to: string; cc: string; subject: string; date: string | null; message_id: string | null; lampiran: { nama: string; ukuran: number }[] }; teks: string; html: string | null }
  | { jenis: "html"; html: string }
  | { jenis: "mhtml"; teks: string }
  | { jenis: "pdf" | "gambar" | "lain"; url: string | null };

function srcdocAman(html: string, izinkanGambar: boolean): string {
  const bersih = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "meta", "link"],
    FORBID_ATTR: ["srcset", "ping", "formaction"],
  });
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: ${izinkanGambar ? "https: http:" : ""}; font-src data:;`;
  const kepala = `<meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">`;
  return /<head[^>]*>/i.test(bersih) ? bersih.replace(/<head[^>]*>/i, (m) => m + kepala) : `<!doctype html><html><head>${kepala}</head><body>${bersih}</body></html>`;
}

function BingkaiAman({ html, tinggi = 520 }: { html: string; tinggi?: number }) {
  const [gambar, setGambar] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[11.5px] text-[#7B8794]">
        <span>Dirender aman (tanpa script{gambar ? "" : ", gambar eksternal diblokir"}).</span>
        <button type="button" className="text-[#1F6FD1] underline" onClick={() => setGambar((g) => !g)}>
          {gambar ? "Blokir gambar eksternal" : "Tampilkan gambar eksternal"}
        </button>
      </div>
      <iframe title="Isi dokumen" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={srcdocAman(html, gambar)} className="w-full rounded-lg border border-[#E3E8EE] bg-white" style={{ height: tinggi }} />
    </div>
  );
}

export function IsiEmail({ isi }: { isi: Extract<IsiLihat, { jenis: "eml" }> }) {
  const [modeTeks, setModeTeks] = useState(!isi.html);
  const h = isi.header;
  return (
    <div className="rounded-lg border border-[#E3E8EE]">
      <dl className="grid gap-x-3 gap-y-0.5 border-b border-[#E3E8EE] bg-[#F8FAFC] px-3 py-2 text-[12.5px] sm:grid-cols-[90px_minmax(0,1fr)]">
        <dt className="text-[#7B8794]">Dari</dt>
        <dd className="break-all font-semibold">{h.from}</dd>
        <dt className="text-[#7B8794]">Kepada</dt>
        <dd className="break-all">{h.to}</dd>
        {h.cc && (
          <>
            <dt className="text-[#7B8794]">Cc</dt>
            <dd className="break-all">{h.cc}</dd>
          </>
        )}
        <dt className="text-[#7B8794]">Subjek</dt>
        <dd className="font-semibold">{h.subject}</dd>
        <dt className="text-[#7B8794]">Tanggal</dt>
        <dd>{h.date ? waktuWibPanjang(h.date) : "–"}</dd>
        <dt className="text-[#7B8794]">Message-ID</dt>
        <dd className="break-all font-mono text-[11.5px]">{h.message_id ?? "–"}</dd>
        {h.lampiran.length > 0 && (
          <>
            <dt className="text-[#7B8794]">Lampiran</dt>
            <dd>{h.lampiran.map((l) => l.nama).join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="p-3">
        {isi.html && (
          <div className="mb-2 flex gap-1 text-[12px]">
            <button type="button" className={`rounded px-2 py-0.5 ${!modeTeks ? "bg-[#E3EEFB] text-[#1F6FD1]" : "text-[#4D5B6B]"}`} onClick={() => setModeTeks(false)}>
              HTML
            </button>
            <button type="button" className={`rounded px-2 py-0.5 ${modeTeks ? "bg-[#E3EEFB] text-[#1F6FD1]" : "text-[#4D5B6B]"}`} onClick={() => setModeTeks(true)}>
              Teks
            </button>
          </div>
        )}
        {modeTeks || !isi.html ? <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed">{isi.teks || "(tanpa isi teks)"}</pre> : <BingkaiAman html={isi.html} />}
      </div>
    </div>
  );
}

export async function muatIsi(fileId: number): Promise<IsiLihat> {
  return fetchJson<IsiLihat>(`/api/sigap/pedia/file/${fileId}?mode=lihat`);
}

/** Modal viewer satu file atau thread email (beberapa .eml diurutkan menurut tanggal). */
export default function Penampil({ fileIds, judul, onTutup }: { fileIds: number[]; judul: string; onTutup: () => void }) {
  const [isi, setIsi] = useState<(IsiLihat & { id: number })[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    Promise.all(fileIds.map(async (id) => ({ ...(await muatIsi(id)), id })))
      .then((x) =>
        setIsi(
          x.sort((a, b) => {
            const ta = a.jenis === "eml" ? Date.parse(a.header.date ?? "") || 0 : 0;
            const tb = b.jenis === "eml" ? Date.parse(b.header.date ?? "") || 0 : 0;
            return ta - tb;
          })
        )
      )
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, [fileIds]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onTutup]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#08101a]/40 p-3 sm:p-6" onClick={onTutup}>
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={judul}>
        <div className="flex items-center gap-2 border-b border-[#E3E8EE] px-4 py-3">
          <h3 className="flex-1 truncate text-[15px] font-semibold">{judul}</h3>
          <button type="button" className={BTN_O} onClick={onTutup}>
            Tutup
          </button>
        </div>
        <div className="space-y-3 p-4">
          {galat && <Pesan>{galat}</Pesan>}
          {!isi && !galat && <Memuat />}
          {isi?.map((x, i) => (
            <div key={x.id}>
              {isi.length > 1 && <p className="mb-1 text-[11.5px] font-semibold text-[#7B8794]">Pesan {i + 1} dari {isi.length}</p>}
              {x.jenis === "eml" ? (
                <IsiEmail isi={x} />
              ) : x.jenis === "html" ? (
                <BingkaiAman html={x.html} tinggi={640} />
              ) : x.jenis === "mhtml" ? (
                <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border border-[#E3E8EE] p-3 text-[11.5px]">{x.teks.slice(0, 200000)}</pre>
              ) : x.jenis === "pdf" && x.url ? (
                <iframe title="PDF" src={x.url} className="h-[70vh] w-full rounded-lg border border-[#E3E8EE]" />
              ) : x.jenis === "gambar" && x.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={x.url} alt="Bukti" className="max-w-full rounded-lg border border-[#E3E8EE]" />
              ) : (
                <p className="text-[13px] text-[#7B8794]">Pratinjau tidak tersedia — silakan unduh file aslinya.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
