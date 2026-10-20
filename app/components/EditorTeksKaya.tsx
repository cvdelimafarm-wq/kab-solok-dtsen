"use client";

// app/components/EditorTeksKaya.tsx
//
// (21 Okt 2026) Editor isi modal bergaya Word: ketik langsung, pilih teks lalu tekan Tebal / Miring / Sorot / Subjudul / Daftar / Nomor / Tautan; tampil seperti hasil akhirnya.
// Yang tersimpan tetap TEKS BERPENANDA yang sama seperti sebelumnya (**tebal**, __miring__, ==sorot==, "- " daftar, "1. " bernomor, "## " subjudul, [teks](https://...); lihat lib/teksKaya.ts),
// jadi modal di HP petugas, templat, dan data lama tidak berubah. Komponen ini hanya memberi tampilan visual di Kelola.
// Enter = paragraf baru, Shift+Enter = baris baru dalam paragraf. Tempel selalu sebagai teks polos (tidak membawa huruf/warna dari Word atau web).

import { useCallback, useEffect, useRef, useState } from "react";
import { urlAman } from "@/lib/sigapPengumuman";
import { WARNA_SOROT, htmlDariMarkup, markupDariSimpul, memuatPenanda } from "@/lib/teksKaya";

type Keadaan = { tebal: boolean; miring: boolean; sorot: boolean; judul: boolean; daftar: boolean; nomor: boolean; tautan: boolean };
const KOSONG: Keadaan = { tebal: false, miring: false, sorot: false, judul: false, daftar: false, nomor: false, tautan: false };

function perintah(nama: string, nilai?: string): boolean {
  try {
    return document.execCommand(nama, false, nilai);
  } catch {
    return false;
  }
}

/** Naik dari titik seleksi sampai akar editor; benar bila ada elemen yang memenuhi `cocok`. */
function adaDiAtas(akar: HTMLElement, cocok: (e: HTMLElement) => boolean): boolean {
  const sel = window.getSelection();
  let n: Node | null = sel?.anchorNode ?? null;
  while (n && n !== akar) {
    if (n.nodeType === 1 && cocok(n as HTMLElement)) return true;
    n = n.parentNode;
  }
  return false;
}

const judulAktif = (e: HTMLElement) => /^H[1-6]$/.test(e.nodeName);
const butirAktif = (e: HTMLElement) => e.nodeName === "LI";
const tautanAktif = (e: HTMLElement) => e.nodeName === "A";

// ---- menjaga seleksi saat struktur blok berubah (daftar, subjudul): Chromium memindahkan kursor ke awal baris setelah perintahnya.
// Tiap titik dicatat sebagai (urutan baris, jumlah huruf dari awal baris) lalu dipulihkan; urutan baris tidak berubah oleh perintah blok.
const BLOK_DAUN = "p,div,li,h1,h2,h3,h4,h5,h6";
type Titik = { urut: number; huruf: number };
type Seleksi = { a: Titik; f: Titik };

function barisDaun(akar: HTMLElement): HTMLElement[] {
  return Array.from(akar.querySelectorAll<HTMLElement>(BLOK_DAUN)).filter((b) => !b.querySelector(BLOK_DAUN));
}
function titikDari(akar: HTMLElement, simpul: Node | null, offset: number): Titik | null {
  if (!simpul || !akar.contains(simpul)) return null;
  const baris = barisDaun(akar);
  const urut = baris.findIndex((b) => b.contains(simpul));
  if (urut < 0) return null;
  const r = document.createRange();
  r.selectNodeContents(baris[urut]);
  r.setEnd(simpul, offset);
  return { urut, huruf: r.toString().length };
}
function catatKursor(akar: HTMLElement): Seleksi | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const a = titikDari(akar, sel.anchorNode, sel.anchorOffset);
  const f = titikDari(akar, sel.focusNode, sel.focusOffset);
  return a && f ? { a, f } : null;
}
function simpulDari(akar: HTMLElement, t: Titik): { n: Node; o: number } | null {
  const b = barisDaun(akar)[t.urut];
  if (!b) return null;
  const jalan = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  let sisa = t.huruf;
  for (let n = jalan.nextNode(); n; n = jalan.nextNode()) {
    const panjang = (n.nodeValue ?? "").length;
    if (sisa <= panjang) return { n, o: sisa };
    sisa -= panjang;
  }
  const akhirBr = b.lastChild?.nodeName === "BR";
  return { n: b, o: akhirBr ? b.childNodes.length - 1 : b.childNodes.length };
}
function pulihkanKursor(akar: HTMLElement, c: Seleksi | null): void {
  const sel = window.getSelection();
  if (!c || !sel) return;
  const sekarang = catatKursor(akar);
  if (sekarang && sekarang.a.urut === c.a.urut && sekarang.a.huruf === c.a.huruf && sekarang.f.urut === c.f.urut && sekarang.f.huruf === c.f.huruf) return; // sudah benar
  const a = simpulDari(akar, c.a);
  const f = simpulDari(akar, c.f);
  if (a && f) sel.setBaseAndExtent(a.n, a.o, f.n, f.o);
}

const sorotAktif = (e: HTMLElement) => {
  if (e.nodeName === "MARK") return true;
  const bg = (e.style?.backgroundColor ?? "").replace(/\s+/g, "").toLowerCase();
  return !!bg && bg !== "transparent" && bg !== "initial" && bg !== "inherit" && bg !== "rgba(0,0,0,0)";
};

export default function EditorTeksKaya({ nilai, onUbah, maks = 2000, tinggiMin = 150 }: { nilai: string; onUbah: (markup: string) => void; maks?: number; tinggiMin?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const terakhir = useRef<string | null>(null); // markup yang terakhir dimuat ke / dikeluarkan dari editor
  const kabar = useRef(onUbah);
  kabar.current = onUbah;
  const [aktif, setAktif] = useState<Keadaan>(KOSONG);
  const [panjang, setPanjang] = useState(nilai.length);
  const [pesan, setPesan] = useState<string | null>(null);

  // isi dari luar (mis. memilih templat) -> editor; perubahan yang berasal dari editor sendiri tidak memuat ulang (kursor tidak loncat)
  useEffect(() => {
    const e = ref.current;
    if (!e) return;
    if (terakhir.current === nilai) return;
    e.innerHTML = htmlDariMarkup(nilai);
    terakhir.current = nilai;
    setPanjang(nilai.length);
  }, [nilai]);

  const sinkron = useCallback(() => {
    const e = ref.current;
    if (!e) return;
    const m = markupDariSimpul(Array.from(e.childNodes));
    setPanjang(m.length);
    if (m !== terakhir.current) {
      terakhir.current = m;
      kabar.current(m);
    }
  }, []);

  const bacaKeadaan = useCallback(() => {
    const e = ref.current;
    if (!e || !e.contains(window.getSelection()?.anchorNode ?? null)) return;
    setAktif({
      tebal: !adaDiAtas(e, judulAktif) && document.queryCommandState("bold"), // subjudul tampak tebal dari bentuknya, bukan dari penanda
      miring: document.queryCommandState("italic"),
      sorot: adaDiAtas(e, sorotAktif),
      judul: adaDiAtas(e, judulAktif),
      daftar: document.queryCommandState("insertUnorderedList"),
      nomor: document.queryCommandState("insertOrderedList"),
      tautan: adaDiAtas(e, tautanAktif),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", bacaKeadaan);
    return () => document.removeEventListener("selectionchange", bacaKeadaan);
  }, [bacaKeadaan]);

  const jalankan = (fn: () => void) => {
    const e = ref.current;
    if (!e) return;
    if (document.activeElement !== e) e.focus(); // memfokus ulang editor yang sudah fokus bisa memindahkan kursor ke awal
    setPesan(null);
    fn();
    sinkron();
    bacaKeadaan();
  };

  // Penanda tidak bersarang: satu teks hanya satu gaya (sorot > tebal > miring). Memilih gaya baru = melepas gaya lain lebih dulu.
  const lepas = (kecuali: "tebal" | "miring" | "sorot") => {
    const e = ref.current!;
    if (kecuali !== "sorot" && adaDiAtas(e, sorotAktif)) perintah("hiliteColor", "transparent");
    if (kecuali !== "tebal" && !adaDiAtas(e, judulAktif) && document.queryCommandState("bold")) perintah("bold");
    if (kecuali !== "miring" && document.queryCommandState("italic")) perintah("italic");
  };

  const tebal = () =>
    jalankan(() => {
      if (adaDiAtas(ref.current!, judulAktif)) {
        setPesan("Subjudul sudah otomatis tebal.");
        return;
      }
      lepas("tebal");
      perintah("bold");
    });

  const miring = () =>
    jalankan(() => {
      lepas("miring");
      perintah("italic");
    });

  const sorot = () =>
    jalankan(() => {
      const e = ref.current!;
      if (adaDiAtas(e, sorotAktif)) perintah("hiliteColor", "transparent");
      else {
        lepas("sorot");
        perintah("hiliteColor", WARNA_SOROT);
      }
    });

  const judul = () =>
    jalankan(() => {
      const e = ref.current!;
      if (adaDiAtas(e, butirAktif)) {
        setPesan("Subjudul tidak bisa di dalam daftar. Keluarkan baris dari daftar dulu.");
        return;
      }
      const c = catatKursor(e);
      const jadiJudul = !adaDiAtas(e, judulAktif);
      perintah("formatBlock", jadiJudul ? "<h3>" : "<div>");
      if (jadiJudul) {
        // formatBlock membungkus isi dengan span "font-weight:700" (tebal dari bentuk subjudul): buang, supaya baris sesudahnya (Enter) tidak ikut tebal
        const sel = window.getSelection();
        e.querySelectorAll("h3").forEach((h) => {
          if (!h.querySelector("[style]") || !sel) return;
          const r = document.createRange();
          r.selectNodeContents(h);
          sel.removeAllRanges();
          sel.addRange(r);
          perintah("removeFormat");
        });
      }
      pulihkanKursor(e, c);
    });

  const buatDaftar = (nama: "insertUnorderedList" | "insertOrderedList") =>
    jalankan(() => {
      if (adaDiAtas(ref.current!, judulAktif)) {
        setPesan("Subjudul tidak bisa dijadikan daftar. Ubah dulu menjadi paragraf biasa.");
        return;
      }
      const e = ref.current!;
      const c = catatKursor(e);
      perintah(nama);
      pulihkanKursor(e, c);
    });

  const daftar = () => buatDaftar("insertUnorderedList");
  const nomor = () => buatDaftar("insertOrderedList");

  const tautan = () =>
    jalankan(() => {
      const e = ref.current!;
      if (adaDiAtas(e, tautanAktif)) {
        perintah("unlink");
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setPesan("Blok dulu tulisan yang ingin dijadikan tautan, lalu tekan Tautan.");
        return;
      }
      const url = window.prompt("Alamat tautan (harus diawali https://)", "https://");
      if (url === null) return;
      if (!urlAman(url.trim())) {
        setPesan("Alamat tautan tidak sah. Gunakan alamat lengkap berawalan https://");
        return;
      }
      perintah("createLink", url.trim());
    });

  const bersihkan = () =>
    jalankan(() => {
      perintah("removeFormat");
      perintah("unlink");
      const e = ref.current!;
      if (adaDiAtas(e, sorotAktif)) perintah("hiliteColor", "transparent");
    });

  const tempel = (ev: React.ClipboardEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const t = ev.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!t) return;
    const e = ref.current;
    if (!e) return;
    // teks terpilih diganti: hapus dulu supaya posisi sisip (dan apakah masih di dalam daftar/subjudul) jelas
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      perintah("delete");
      // Chromium menyisakan butir kosong bila seluruh daftar terhapus: lepaskan dari daftar agar tempelan masuk sebagai paragraf biasa
      const li = sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as HTMLElement) : sel.anchorNode.parentElement)?.closest("li") : null;
      if (li && e.contains(li) && !(li.textContent ?? "").trim()) perintah(document.queryCommandState("insertOrderedList") ? "insertOrderedList" : "insertUnorderedList");
    }
    if (!t.includes("\n") && !memuatPenanda(t)) {
      perintah("insertText", t);
    } else if (adaDiAtas(e, (x) => butirAktif(x) || judulAktif(x))) {
      // di dalam butir daftar / subjudul hanya muat satu baris: tempelan banyak baris digabung dengan spasi (penanda gaya tetap berlaku)
      const datar = t
        .split("\n")
        .map((l) => l.replace(/^\s*([-•]|\d{1,3}[.)]|##)\s+/, "").trim())
        .filter(Boolean)
        .join(" ");
      perintah("insertHTML", htmlDariMarkup(datar).replace(/^<p>/, "").replace(/<\/p>$/, ""));
    } else {
      perintah("insertHTML", htmlDariMarkup(t));
    }
    sinkron();
  };

  const tekan = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    // pintasan Ctrl+B / Ctrl+I lewat jalur yang sama dengan tombol (aturan satu gaya per teks); garis bawah tidak punya padanan di modal
    if (k === "b") {
      ev.preventDefault();
      tebal();
    } else if (k === "i") {
      ev.preventDefault();
      miring();
    } else if (k === "u") ev.preventDefault();
  };

  const fokus = () => {
    perintah("defaultParagraphSeparator", "div"); // paragraf baru berupa div: daftar tidak berakhir di dalam <p> (tidak sah)
    perintah("styleWithCSS", "true");
  };

  const lebih = panjang > maks;
  const tombol = "inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-[9px] px-2 text-[13px] font-extrabold transition-colors";
  const gaya = (on: boolean) => (on ? "bg-[#1F5FD1] text-white" : "bg-white text-[#0F2A52] hover:bg-[#E6EEFC]");
  const tahan = (ev: React.MouseEvent) => ev.preventDefault(); // jangan lepas fokus/seleksi dari editor saat menekan tombol

  return (
    <div className="mt-1">
      <div role="toolbar" aria-label="Pemformatan isi modal" className="flex flex-wrap items-center gap-1 rounded-t-[12px] border border-b-0 border-[#D9E3F2] bg-[#F5F8FE] p-1.5">
        <button type="button" onMouseDown={tahan} onClick={tebal} aria-pressed={aktif.tebal} title="Tebal (Ctrl+B)" className={`${tombol} ${gaya(aktif.tebal)}`}>
          <b>B</b>
        </button>
        <button type="button" onMouseDown={tahan} onClick={miring} aria-pressed={aktif.miring} title="Miring (Ctrl+I)" aria-label="Miring" className={`${tombol} ${gaya(aktif.miring)}`}>
          <i className="font-serif text-[15px]">I</i>
        </button>
        <button type="button" onMouseDown={tahan} onClick={sorot} aria-pressed={aktif.sorot} title="Sorot kuning" className={`${tombol} ${gaya(aktif.sorot)}`}>
          <span className="rounded px-1" style={{ background: WARNA_SOROT, color: "#1B2B4B" }}>Sorot</span>
        </button>
        <span className="mx-0.5 h-5 w-px bg-[#D9E3F2]" aria-hidden="true" />
        <button type="button" onMouseDown={tahan} onClick={judul} aria-pressed={aktif.judul} title="Subjudul (judul kecil di dalam pesan)" className={`${tombol} ${gaya(aktif.judul)}`}>
          Subjudul
        </button>
        <button type="button" onMouseDown={tahan} onClick={daftar} aria-pressed={aktif.daftar} title="Daftar berpoin" className={`${tombol} ${gaya(aktif.daftar)}`}>
          • Poin
        </button>
        <button type="button" onMouseDown={tahan} onClick={nomor} aria-pressed={aktif.nomor} title="Daftar bernomor" className={`${tombol} ${gaya(aktif.nomor)}`}>
          1. Nomor
        </button>
        <button type="button" onMouseDown={tahan} onClick={tautan} aria-pressed={aktif.tautan} title={aktif.tautan ? "Hapus tautan" : "Jadikan tautan (blok teks dulu)"} className={`${tombol} ${gaya(aktif.tautan)}`}>
          {aktif.tautan ? "Lepas tautan" : "Tautan"}
        </button>
        <span className="mx-0.5 h-5 w-px bg-[#D9E3F2]" aria-hidden="true" />
        <button type="button" onMouseDown={tahan} onClick={() => jalankan(() => void perintah("undo"))} title="Batalkan (Ctrl+Z)" aria-label="Batalkan" className={`${tombol} ${gaya(false)}`}>
          ↶
        </button>
        <button type="button" onMouseDown={tahan} onClick={() => jalankan(() => void perintah("redo"))} title="Ulangi (Ctrl+Y)" aria-label="Ulangi" className={`${tombol} ${gaya(false)}`}>
          ↷
        </button>
        <button type="button" onMouseDown={tahan} onClick={bersihkan} title="Hapus format pada teks terpilih" className={`${tombol} ${gaya(false)} font-bold`}>
          Hapus format
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Isi modal"
        spellCheck
        onInput={sinkron}
        onBlur={sinkron}
        onFocus={fokus}
        onPaste={tempel}
        onKeyDown={tekan}
        onDrop={(e) => e.preventDefault()}
        style={{ minHeight: tinggiMin }}
        className="max-h-[420px] w-full overflow-y-auto rounded-b-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14.5px] leading-relaxed text-[#1B2B4B] outline-none focus:border-[#1F5FD1] [&_a]:font-bold [&_a]:text-[#1F5FD1] [&_a]:underline [&_li]:my-0.5 [&_mark]:rounded [&_mark]:px-0.5 [&_div]:mb-2 [&_div]:min-h-[1.4em] [&_p]:mb-2 [&_p]:min-h-[1.4em] [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:mb-2 [&_h3]:pt-1 [&_h3]:text-[15.5px] [&_h3]:font-extrabold [&_h3]:leading-snug [&_h3]:text-[#0F2A52]"
      />
      <div className="mt-1 flex items-start justify-between gap-2 text-[11px] leading-snug text-[#6B7A90]">
        <span>Enter = paragraf baru, Shift+Enter = baris baru. Tempel selalu sebagai teks polos.</span>
        <span className={`shrink-0 font-bold ${lebih ? "text-[#B42329]" : ""}`}>
          {panjang}/{maks}
        </span>
      </div>
      {lebih && <p role="alert" className="mt-1 text-[12px] font-bold text-[#B42329]">Isi terlalu panjang untuk disimpan ({panjang} dari {maks} karakter). Pendekkan dulu.</p>}
      {pesan && <p role="status" className="mt-1 text-[12px] font-semibold text-[#8A6200]">{pesan}</p>}
    </div>
  );
}
