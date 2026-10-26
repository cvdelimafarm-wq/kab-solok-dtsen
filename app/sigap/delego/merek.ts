// app/sigap/delego/merek.ts
//
// (26 Okt 2026) Merek Delego: hijau profesional. Modul ini tetap satu aplikasi dengan SIGAP (data dan akun sama), tetapi begitu pengguna masuk
// menu Delego seluruh tampilan (web dan HP) berganti hijau dengan merek Delego. Semua warna ada di sini supaya mudah diubah di satu tempat.

export const WARNA = {
  tua: "#0B3B38", // sidebar, header HP
  tuaRedup: "#CFE4E1", // teks sekunder di atas hijau tua
  utama: "#0F6B63", // tombol utama, tautan aktif
  utamaGelap: "#0B524C",
  tint: "#E3F0EE",
  tintMuda: "#F1F7F6",
  latar: "#F3F5F7",
  garis: "#D5DCE2",
  tinta: "#14212B",
  redup: "#3B4A57",
  amber: "#8A4605",
  amberLatar: "#FCEFDD",
  amberGaris: "#E5B77E",
  merah: "#9B2C2C",
  merahLatar: "#FBE9E9",
  biru: "#1D3F6B",
  biruLatar: "#E3EEF9",
} as const;

export type Nada = "hijau" | "abu" | "biru" | "amber" | "merah";

/** Kelas Tailwind per nada lencana. */
export const KELAS_NADA: Record<Nada, string> = {
  hijau: "bg-[#E3F0EE] text-[#0B524C] border-[#9CC5BF]",
  abu: "bg-[#ECEFF2] text-[#33404B] border-[#B5C0C9]",
  biru: "bg-[#E3EEF9] text-[#1D3F6B] border-[#9DB8D9]",
  amber: "bg-[#FCEFDD] text-[#6B3A04] border-[#E5B77E]",
  merah: "bg-[#FBE9E9] text-[#9B2C2C] border-[#E3A9A9]",
};

export const KELAS = {
  tombolUtama:
    "inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[#0F6B63] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[#0B524C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F6B63] disabled:cursor-not-allowed disabled:opacity-50",
  tombolSekunder:
    "inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-[#BCC6CE] bg-white px-4 text-[14.5px] font-semibold text-[#14212B] transition-colors hover:bg-[#F1F7F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F6B63] disabled:cursor-not-allowed disabled:opacity-50",
  tombolKecil:
    "inline-flex min-h-[34px] items-center justify-center rounded-lg border border-[#BCC6CE] bg-white px-3 text-[13px] font-semibold text-[#14212B] transition-colors hover:bg-[#F1F7F6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6B63] disabled:cursor-not-allowed disabled:opacity-50",
  tombolKecilUtama:
    "inline-flex min-h-[34px] items-center justify-center rounded-lg bg-[#0F6B63] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#0B524C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F6B63] disabled:cursor-not-allowed disabled:opacity-50",
  isian:
    "w-full rounded-lg border border-[#BCC6CE] bg-white px-3 py-2 text-[14.5px] text-[#14212B] placeholder:text-[#7A8793] focus:border-[#0F6B63] focus:outline focus:outline-2 focus:outline-[#9CC5BF]",
  kartu: "rounded-xl border border-[#D5DCE2] bg-white p-4",
  labelKecil: "text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#3B4A57]",
} as const;
