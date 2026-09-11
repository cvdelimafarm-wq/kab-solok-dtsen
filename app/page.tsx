import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-navy-400">
        Badan Pusat Statistik Kabupaten Solok
      </p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight text-navy-900 sm:text-4xl">
        Usulan Update Data DTSEN
      </h1>
      <p className="mt-4 max-w-lg text-ink/80">
        Alur pengusulan data kemiskinan warga: Wali Jorong mengisi lembar
        identifikasi, Operator Wali Nagari menerbitkan surat keterangan, dan
        BPS memeriksa serta memberi status akhir.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-md bg-navy-700 px-5 py-3 text-center font-medium text-white transition hover:bg-navy-600"
        >
          Masuk sebagai Operator Nagari / BPS
        </Link>
      </div>

      <p className="mt-6 text-sm text-ink/60">
        Wali Jorong mengakses lembar isian melalui tautan unik yang diberikan
        oleh BPS Kabupaten Solok, tanpa perlu login.
      </p>
    </main>
  );
}
