"use client";

// (4 Okt 2026) Modal yang muncul SEGERA setelah petugas menyatakan bersedia:
// mengingatkan 2 tahapan yang harus diselesaikan (1. buat PIN, 2. gabung grup WA).
// Tombol OK menutup modal dan langsung menggulir layar ke kartu "Buat akun"
// (id = ID_KARTU_BUAT_PIN, dipasang di BuatAkunPanel).

export const ID_KARTU_BUAT_PIN = "kartu-buat-pin";

export default function ModalSelesaikan({ nama, onOk }: { nama: string; onOk: () => void }) {
  function ok() {
    onOk();
    // Beri waktu modal tertutup & layout stabil sebelum menggulir.
    setTimeout(() => {
      document.getElementById(ID_KARTU_BUAT_PIN)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="judul-modal-selesaikan"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="judul-modal-selesaikan" className="text-base font-extrabold text-[#0F3D7A]">
          Jawaban Anda sudah tersimpan
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#13213A]">
          Terima kasih, <strong>{nama}</strong>. Pastikan semua tahapan berikut Anda selesaikan:
        </p>
        <ol className="mt-3 space-y-2 text-sm text-[#13213A]">
          <li className="flex gap-2.5 rounded-lg bg-[#F1F4F8] px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F3D7A] text-xs font-extrabold text-white">1</span>
            <span>
              <strong>Buat PIN</strong> (akun Anda, 4 digit angka) untuk membuka kembali halaman ini.
            </span>
          </li>
          <li className="flex gap-2.5 rounded-lg bg-[#F1F4F8] px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F3D7A] text-xs font-extrabold text-white">2</span>
            <span>
              <strong>Gabung grup WhatsApp petugas.</strong> Tombolnya muncul setelah PIN dibuat.
            </span>
          </li>
        </ol>
        <button
          type="button"
          autoFocus
          onClick={ok}
          className="mt-4 w-full rounded-xl bg-[#0F3D7A] py-3 text-sm font-bold text-white active:bg-[#0B2F5E]"
        >
          OK, buat PIN sekarang
        </button>
      </div>
    </div>
  );
}
