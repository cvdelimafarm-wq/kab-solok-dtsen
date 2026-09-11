"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "belum_didata" | "selesai_didata" | "selesai_dibersihkan";

const STATUS_LABEL: Record<Status, string> = {
  belum_didata: "Belum Didata",
  selesai_didata: "Selesai Didata",
  selesai_dibersihkan: "Selesai Dibersihkan",
};

interface JorongOption {
  jorong_id: string;
  nama_jorong: string;
  nama_ppl: string;
}

interface Sampel {
  id: string;
  nomor_urut: number;
  status: Status;
  potensi_non_respon: boolean | null;
}

export default function SerutiPage() {
  const supabase = createClient();

  const [options, setOptions] = useState<JorongOption[]>([]);
  const [jorongId, setJorongId] = useState("");
  const [sampelList, setSampelList] = useState<Sampel[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSampel, setLoadingSampel] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const { data } = await supabase
        .from("seruti_ppl")
        .select("jorong_id, nama, jorong:jorong_id(nama_jorong)")
        .order("nama");
      const mapped: JorongOption[] = (data ?? []).map((row: any) => ({
        jorong_id: row.jorong_id,
        nama_jorong: row.jorong?.nama_jorong ?? "-",
        nama_ppl: row.nama,
      }));
      setOptions(mapped);
      setLoadingOptions(false);
    }
    loadOptions();
  }, [supabase]);

  async function loadSampel(id: string) {
    setJorongId(id);
    setLoadingSampel(true);
    const { data } = await supabase
      .from("seruti_sampel")
      .select("id, nomor_urut, status, potensi_non_respon")
      .eq("jorong_id", id)
      .order("nomor_urut");
    setSampelList(data ?? []);
    setLoadingSampel(false);
  }

  async function updateSampel(
    sampel: Sampel,
    patch: Partial<Pick<Sampel, "status" | "potensi_non_respon">>
  ) {
    setSavingId(sampel.id);
    const updated = { ...sampel, ...patch };

    const ppl = options.find((o) => o.jorong_id === jorongId);
    const { data: pplRow } = await supabase
      .from("seruti_ppl")
      .select("id")
      .eq("jorong_id", jorongId)
      .maybeSingle();

    await supabase
      .from("seruti_sampel")
      .update({
        status: updated.status,
        potensi_non_respon:
          updated.status === "belum_didata" ? updated.potensi_non_respon : null,
        updated_by_ppl_id: pplRow?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sampel.id);

    setSampelList((prev) =>
      prev.map((s) => (s.id === sampel.id ? { ...s, ...updated } : s))
    );
    setSavingId(null);
    void ppl;
  }

  const selected = options.find((o) => o.jorong_id === jorongId);
  const selesai = sampelList.filter((s) => s.status !== "belum_didata").length;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <p className="text-sm font-medium text-navy-400">
        Susenas September &middot; Seruti Triwulan II
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-navy-900">
        Progress Pendataan Sampel
      </h1>
      <p className="mt-2 text-sm text-ink/70">
        Pilih Jorong untuk melihat dan memperbarui status 10 sampel Ruta.
      </p>

      <div className="mt-6">
        <label className="text-sm font-medium text-ink">Pilih Jorong</label>
        <select
          value={jorongId}
          onChange={(e) => loadSampel(e.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
        >
          <option value="">
            {loadingOptions ? "Memuat..." : "Pilih Jorong"}
          </option>
          {options.map((o) => (
            <option key={o.jorong_id} value={o.jorong_id}>
              {o.nama_jorong}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <p className="mt-3 text-sm text-ink/70">
          Petugas (PPL): <span className="font-medium text-ink">{selected.nama_ppl}</span>
        </p>
      )}

      {jorongId && (
        <div className="mt-6">
          {loadingSampel ? (
            <p className="text-sm text-ink/50">Memuat sampel...</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink/60">
                {selesai} dari {sampelList.length} sampel sudah diproses.
              </p>
              <ol className="flex flex-col gap-3">
                {sampelList.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-line bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy-900">
                        Ruta No. {s.nomor_urut}
                      </span>
                      {savingId === s.id && (
                        <span className="text-xs text-ink/40">Menyimpan...</span>
                      )}
                    </div>

                    <select
                      value={s.status}
                      onChange={(e) =>
                        updateSampel(s, {
                          status: e.target.value as Status,
                          potensi_non_respon:
                            e.target.value === "belum_didata"
                              ? s.potensi_non_respon
                              : null,
                        })
                      }
                      className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
                    >
                      {(Object.keys(STATUS_LABEL) as Status[]).map((key) => (
                        <option key={key} value={key}>
                          {STATUS_LABEL[key]}
                        </option>
                      ))}
                    </select>

                    {s.status === "belum_didata" && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-ink/60">
                          Potensi non respon?
                        </p>
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateSampel(s, { potensi_non_respon: true })
                            }
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                              s.potensi_non_respon === true
                                ? "bg-rust-500 text-white"
                                : "bg-line text-ink/60"
                            }`}
                          >
                            Ya
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSampel(s, { potensi_non_respon: false })
                            }
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                              s.potensi_non_respon === false
                                ? "bg-moss-500 text-white"
                                : "bg-line text-ink/60"
                            }`}
                          >
                            Tidak
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </main>
  );
}
