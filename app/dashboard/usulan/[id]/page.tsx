import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_COLOR, VARIABEL_LABEL, type UsulanStatus } from "@/lib/types";
import UsulanActions from "./actions";

export default async function UsulanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: usulan } = await supabase
    .from("usulan")
    .select(
      "*, jorong:jorong_id(nama_jorong, nagari:nagari_id(nama_nagari, kecamatan))"
    )
    .eq("id", id)
    .maybeSingle<any>();

  if (!usulan) notFound();

  const { data: suratKeterangan } = await supabase
    .from("surat_keterangan")
    .select("*")
    .eq("usulan_id", id)
    .maybeSingle();

  const { data: statusLog } = await supabase
    .from("status_log")
    .select("*")
    .eq("usulan_id", id)
    .order("changed_at", { ascending: true });

  const status = usulan.status as UsulanStatus;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-navy-400">
          {usulan.jorong?.nagari?.kecamatan} &middot;{" "}
          {usulan.jorong?.nagari?.nama_nagari} &middot;{" "}
          {usulan.jorong?.nama_jorong}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy-900">
            {usulan.nama_warga}
          </h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink/60">
          NIK {usulan.nik}
          {usulan.no_kk ? ` \u00b7 KK ${usulan.no_kk}` : ""}
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-[2fr,1fr]">
        <div className="flex flex-col gap-8">
          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="font-medium text-navy-900">Data warga</h2>
            <dl className="mt-3 grid grid-cols-[120px,1fr] gap-y-2 text-sm">
              <dt className="text-ink/50">Alamat</dt>
              <dd>{usulan.alamat || "-"}</dd>
              <dt className="text-ink/50">Catatan Wali Jorong</dt>
              <dd>{usulan.catatan_wali_jorong || "-"}</dd>
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="font-medium text-navy-900">
              Variabel penciri kemiskinan
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {VARIABEL_LABEL.map((v, i) => (
                <li key={v.key} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      usulan[v.key]
                        ? "bg-moss-100 text-moss-700"
                        : "bg-line text-ink/40"
                    }`}
                  >
                    {usulan[v.key] ? "\u2713" : String(i + 1)}
                  </span>
                  <span
                    className={usulan[v.key] ? "text-ink" : "text-ink/40"}
                  >
                    {v.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {statusLog && statusLog.length > 0 && (
            <section className="rounded-lg border border-line bg-white p-5">
              <h2 className="font-medium text-navy-900">Riwayat status</h2>
              <ol className="mt-3 flex flex-col gap-3 text-sm">
                {statusLog.map((log) => (
                  <li key={log.id} className="border-l-2 border-line pl-3">
                    <p className="font-medium text-ink">
                      {STATUS_LABEL[log.status_baru as UsulanStatus]}
                    </p>
                    <p className="text-xs text-ink/50">
                      {new Date(log.changed_at).toLocaleString("id-ID")} oleh{" "}
                      {log.changed_by_role}
                    </p>
                    {log.catatan && (
                      <p className="mt-1 text-ink/70">{log.catatan}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-navy-900">Tindakan</h2>
          {profile?.role && (
            <UsulanActions
              usulanId={usulan.id}
              status={status}
              role={profile.role}
              hasSuratKeterangan={!!suratKeterangan}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
