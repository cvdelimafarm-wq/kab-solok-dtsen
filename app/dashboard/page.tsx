import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_COLOR, type UsulanStatus } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: progress } = await supabase
    .from("dashboard_progress")
    .select("*")
    .order("nama_jorong");

  const { data: usulanList } = await supabase
    .from("usulan")
    .select("id, nama_warga, nik, status, created_at, jorong:jorong_id(nama_jorong, nagari:nagari_id(nama_nagari))")
    .order("created_at", { ascending: false })
    .limit(50);

  const totals = (progress ?? []).reduce(
    (acc, row) => {
      acc.total += row.total ?? 0;
      acc.approved += row.approved ?? 0;
      acc.dikirim_ke_bps += row.dikirim_ke_bps ?? 0;
      acc.ditolak += row.ditolak ?? 0;
      return acc;
    },
    { total: 0, approved: 0, dikirim_ke_bps: 0, ditolak: 0 }
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-xl font-semibold text-navy-900">
          Progress usulan
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total usulan" value={totals.total} />
          <SummaryCard label="Di BPS" value={totals.dikirim_ke_bps} />
          <SummaryCard
            label="Disetujui"
            value={totals.approved}
            tone="moss"
          />
          <SummaryCard label="Ditolak" value={totals.ditolak} tone="rust" />
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-xs uppercase text-navy-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">Jorong</th>
                <th className="px-4 py-2.5 font-medium">Nagari</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Diusulkan
                </th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Disetujui
                </th>
              </tr>
            </thead>
            <tbody>
              {(progress ?? []).map((row) => (
                <tr key={row.jorong_id} className="border-t border-line">
                  <td className="px-4 py-2.5">{row.nama_jorong}</td>
                  <td className="px-4 py-2.5 text-ink/60">
                    {row.nama_nagari}
                  </td>
                  <td className="px-4 py-2.5 text-right">{row.total}</td>
                  <td className="px-4 py-2.5 text-right">{row.approved}</td>
                </tr>
              ))}
              {(!progress || progress.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink/50">
                    Belum ada data usulan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-navy-900">
          Usulan terbaru
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          {(usulanList ?? []).map((u: any) => (
            <Link
              key={u.id}
              href={`/dashboard/usulan/${u.id}`}
              className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3 transition hover:border-navy-400"
            >
              <div>
                <p className="font-medium text-ink">{u.nama_warga}</p>
                <p className="text-xs text-ink/50">
                  {u.jorong?.nama_jorong} &middot; {u.jorong?.nagari?.nama_nagari}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  STATUS_COLOR[u.status as UsulanStatus]
                }`}
              >
                {STATUS_LABEL[u.status as UsulanStatus]}
              </span>
            </Link>
          ))}
          {(!usulanList || usulanList.length === 0) && (
            <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-ink/50">
              Belum ada usulan masuk.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "moss" | "rust";
}) {
  const toneClass =
    tone === "moss"
      ? "text-moss-700"
      : tone === "rust"
      ? "text-rust-700"
      : "text-navy-900";
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <p className="text-xs text-ink/50">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
