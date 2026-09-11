"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { UsulanStatus } from "@/lib/types";

export default function UsulanActions({
  usulanId,
  status,
  role,
  hasSuratKeterangan,
}: {
  usulanId: string;
  status: UsulanStatus;
  role: "operator_nagari" | "bps" | "admin";
  hasSuratKeterangan: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catatanTolak, setCatatanTolak] = useState("");
  const [showTolakForm, setShowTolakForm] = useState(false);

  async function updateStatus(
    newStatus: UsulanStatus,
    catatan?: string
  ) {
    setLoading(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();

    const { error: updateError } = await supabase
      .from("usulan")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", usulanId);

    if (updateError) {
      setError("Gagal memperbarui status: " + updateError.message);
      setLoading(false);
      return;
    }

    await supabase.from("status_log").insert({
      usulan_id: usulanId,
      status_lama: status,
      status_baru: newStatus,
      changed_by_role: role,
      changed_by_id: userData.user?.id,
      catatan: catatan ?? null,
    });

    setLoading(false);
    router.refresh();
  }

  async function buatSuratKeterangan() {
    setLoading(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const nomorSurat = `SK-${usulanId.slice(0, 8).toUpperCase()}`;

    const { error: skError } = await supabase.from("surat_keterangan").insert({
      usulan_id: usulanId,
      nomor_surat: nomorSurat,
      dibuat_oleh: userData.user?.id,
    });

    if (skError) {
      setError("Gagal membuat surat keterangan: " + skError.message);
      setLoading(false);
      return;
    }

    await updateStatus("sk_dibuat");
  }

  async function verifikasiSurat() {
    setLoading(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();

    const { error: skError } = await supabase
      .from("surat_keterangan")
      .update({
        dicetak: true,
        dikonfirmasi: true,
        dikonfirmasi_oleh: userData.user?.id,
        dikonfirmasi_at: new Date().toISOString(),
      })
      .eq("usulan_id", usulanId);

    if (skError) {
      setError("Gagal verifikasi: " + skError.message);
      setLoading(false);
      return;
    }

    await updateStatus("sk_dikonfirmasi");
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
          {error}
        </p>
      )}

      {role === "operator_nagari" && status === "dikirim_ke_nagari" && (
        <ActionButton
          label="Tandai sudah dibaca"
          onClick={() => updateStatus("dibaca_operator")}
          loading={loading}
        />
      )}

      {role === "operator_nagari" && status === "dibaca_operator" && (
        <ActionButton
          label="Buat surat keterangan"
          onClick={buatSuratKeterangan}
          loading={loading}
        />
      )}

      {role === "operator_nagari" && status === "sk_dibuat" && (
        <div className="flex flex-col gap-2">
          <Link
            href={`/dashboard/usulan/${usulanId}/surat`}
            target="_blank"
            className="rounded-md border border-navy-400 px-4 py-2.5 text-center font-medium text-navy-700 hover:bg-navy-50"
          >
            Buka & cetak surat keterangan
          </Link>
          <ActionButton
            label="Verifikasi (sudah dicetak &amp; ditandatangani)"
            onClick={verifikasiSurat}
            loading={loading}
          />
        </div>
      )}

      {role === "operator_nagari" && status === "sk_dikonfirmasi" && (
        <ActionButton
          label="Kirim ke BPS"
          onClick={() => updateStatus("dikirim_ke_bps")}
          loading={loading}
        />
      )}

      {role === "bps" && status === "dikirim_ke_bps" && !showTolakForm && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <ActionButton
            label="Diterima lengkap"
            onClick={() => updateStatus("diterima_lengkap")}
            loading={loading}
          />
          <ActionButton
            label="Tolak, perlu perbaikan"
            onClick={() => setShowTolakForm(true)}
            loading={loading}
            variant="danger"
          />
        </div>
      )}

      {role === "bps" && showTolakForm && (
        <div className="flex flex-col gap-2">
          <textarea
            value={catatanTolak}
            onChange={(e) => setCatatanTolak(e.target.value)}
            placeholder="Jelaskan perbaikan yang diperlukan"
            rows={3}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <div className="flex gap-2">
            <ActionButton
              label="Kirim penolakan"
              onClick={() => updateStatus("ditolak", catatanTolak)}
              loading={loading}
              variant="danger"
            />
            <button
              onClick={() => setShowTolakForm(false)}
              className="rounded-md px-4 py-2.5 text-sm font-medium text-ink/60 hover:text-ink"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {role === "bps" && status === "diterima_lengkap" && (
        <ActionButton
          label="Setujui usulan"
          onClick={() => updateStatus("approved")}
          loading={loading}
        />
      )}

      {status === "approved" && (
        <p className="rounded-md bg-moss-100 px-3 py-2 text-sm text-moss-700">
          Usulan ini sudah disetujui.
        </p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  loading,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
  variant?: "primary" | "danger";
}) {
  const base =
    "rounded-md px-4 py-2.5 font-medium text-white transition disabled:opacity-60";
  const color =
    variant === "danger"
      ? "bg-rust-500 hover:bg-rust-700"
      : "bg-navy-700 hover:bg-navy-600";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${base} ${color}`}
    >
      {loading ? "Memproses..." : label}
    </button>
  );
}
