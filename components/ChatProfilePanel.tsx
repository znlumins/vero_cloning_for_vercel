"use client";
// Panel profil yang meluncur dari kanan area obrolan.
//
// Satu komponen untuk dua isi yang berbeda — orang dan grup — karena keduanya
// menjawab pertanyaan yang sama ("aku sedang bicara dengan siapa?") dan muncul
// dari gerakan yang sama (mengetuk kepala percakapan). Memisahkannya jadi dua
// komponen hanya akan menyalin kerangka, animasi, dan tombol tutup yang persis
// sama dua kali.
//
// Untuk grup, panel ini sekaligus jadi tempat mengelolanya: ganti nama, ganti
// foto, bubarkan, atau keluar. Aksi-aksi itu memang milik "info grup" — mencari
// tempat lain untuknya hanya akan membuat orang berburu menu.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, Pencil, Camera, Check, Loader2, Trash2, LogOut, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";
import { LABEL_HEARING, LABEL_ROLE, type HearingStatus, type Role } from "@/lib/access";
import { sedangDaring, labelKehadiran } from "@/lib/presence";
import { headerAuth } from "@/lib/sessionToken";

interface AnggotaRingkas {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
  last_seen?: string | null;
}

/** Baris tabel profiles apa adanya — snake_case, seperti yang dikembalikan /api/db. */
interface ProfilRingkas extends AnggotaRingkas {
  role?: string | null;
  university?: string | null;
  study_program?: string | null;
  bio?: string | null;
  hearing_status?: string | null;
}

export interface InfoGrup {
  id: string;
  nama: string;
  avatarUrl?: string | null;
  anggota: AnggotaRingkas[];
  /** Pembuat grup — hanya dia yang melihat tombol ubah nama/foto/bubarkan. */
  bisaKelola: boolean;
  /** Daftar anggota gagal dimuat; ditampilkan sebagai pesan, bukan daftar kosong. */
  galatAnggota?: boolean;
}

interface Props {
  terbuka: boolean;
  onTutup: () => void;
  /** Profil lawan bicara — untuk percakapan personal. */
  profil?: ProfilRingkas | null;
  /** Nama grup & anggotanya — untuk grup / saluran umum. */
  grup?: InfoGrup | null;
  /** Dipanggil setelah nama/foto grup berubah, supaya halaman menyegarkan daftarnya. */
  onGrupBerubah?: (patch: { name?: string; avatar_url?: string | null }) => void;
  /** Dipanggil setelah grup dibubarkan atau ditinggalkan. */
  onGrupHilang?: () => void;
}

const MAKS_NAMA = 60;
const TIPE_FOTO = ["image/jpeg", "image/png", "image/webp"];
const MAKS_FOTO = 2 * 1024 * 1024; // 2 MB

/** Role dibaca dari tabel profiles (bukan sesi), jadi nilainya bisa apa saja. */
function labelRole(r: unknown): string {
  return r === "ADMIN" || r === "DOSEN" || r === "MAHASISWA" ? LABEL_ROLE[r as Role] : LABEL_ROLE.MAHASISWA;
}

function Baris({ label, nilai }: { label: string; nilai?: string | null }) {
  if (!nilai) return null;
  return (
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
      <p className="text-sm font-bold text-slate-800 mt-1.5 leading-relaxed break-words">{nilai}</p>
    </div>
  );
}

/** Satu pintu untuk seluruh aksi kelola grup. */
async function panggilApiGrup(muatan: Record<string, unknown>) {
  const res = await fetch("/api/group", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headerAuth() },
    body: JSON.stringify(muatan),
  });
  const hasil = await res.json().catch(() => null);
  if (!res.ok || hasil?.error) {
    throw new Error(hasil?.error?.message || "Permintaan gagal.");
  }
  return hasil?.data;
}

export default function ChatProfilePanel({
  terbuka,
  onTutup,
  profil,
  grup,
  onGrupBerubah,
  onGrupHilang,
}: Props) {
  const daring = sedangDaring(profil?.last_seen);
  const anggota = grup?.anggota ?? [];
  const jumlahDaring = anggota.filter((a) => sedangDaring(a.last_seen)).length;

  // --- Ubah nama grup ---
  const [sedangUbahNama, setSedangUbahNama] = useState(false);
  const [namaDraf, setNamaDraf] = useState("");
  const [menyimpanNama, setMenyimpanNama] = useState(false);

  // --- Ubah foto grup ---
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [fotoPilihan, setFotoPilihan] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [mengunggah, setMengunggah] = useState(false);

  // --- Bubarkan / keluar ---
  const [modalBubar, setModalBubar] = useState(false);
  const [ketikNama, setKetikNama] = useState("");
  const [membubarkan, setMembubarkan] = useState(false);
  const [modalKeluar, setModalKeluar] = useState(false);
  const [keluar, setKeluar] = useState(false);

  // Semua keadaan sementara direset saat panel ditutup atau grupnya berganti.
  // Tanpa ini, draf nama grup lama muncul di grup berikutnya yang dibuka.
  useEffect(() => {
    setSedangUbahNama(false);
    setNamaDraf(grup?.nama || "");
    setFotoPilihan(null);
    setPratinjau(null);
    setModalBubar(false);
    setKetikNama("");
    setModalKeluar(false);
  }, [grup?.id, grup?.nama, terbuka]);

  // URL pratinjau dari createObjectURL memegang memori sampai dicabut.
  useEffect(() => {
    if (!fotoPilihan) { setPratinjau(null); return; }
    const url = URL.createObjectURL(fotoPilihan);
    setPratinjau(url);
    return () => URL.revokeObjectURL(url);
  }, [fotoPilihan]);

  const simpanNama = async () => {
    const nama = namaDraf.trim();
    if (!nama) { toast.error("Nama grup tidak boleh kosong."); return; }
    if (!grup) return;
    setMenyimpanNama(true);
    try {
      const data = await panggilApiGrup({ action: "rename", groupId: grup.id, name: nama });
      onGrupBerubah?.({ name: data?.name ?? nama });
      setSedangUbahNama(false);
      toast.success("Nama grup diperbarui.");
    } catch (e) {
      console.error("Gagal mengubah nama grup:", e);
      toast.error(e instanceof Error ? e.message : "Nama grup gagal diubah.");
    } finally {
      setMenyimpanNama(false);
    }
  };

  const pilihFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Input direset supaya memilih berkas yang SAMA dua kali tetap memicu
    // onChange — tanpa ini, membatalkan lalu memilih ulang foto yang sama
    // terlihat seperti tidak terjadi apa-apa.
    e.target.value = "";
    if (!f) return;
    if (!TIPE_FOTO.includes(f.type)) {
      toast.error("Format foto harus JPG, PNG, atau WEBP.");
      return;
    }
    if (f.size > MAKS_FOTO) {
      toast.error(`Ukuran foto maksimal ${MAKS_FOTO / 1024 / 1024} MB.`);
      return;
    }
    setFotoPilihan(f);
  };

  const simpanFoto = async () => {
    if (!fotoPilihan || !grup) return;
    setMengunggah(true);
    try {
      const form = new FormData();
      form.append("file", fotoPilihan);
      const resUnggah = await fetch("/api/upload", { method: "POST", headers: headerAuth(), body: form });
      const hasilUnggah = await resUnggah.json().catch(() => null);
      if (!resUnggah.ok || !hasilUnggah?.url) {
        throw new Error(hasilUnggah?.error || "Foto gagal diunggah.");
      }

      const data = await panggilApiGrup({ action: "setAvatar", groupId: grup.id, avatarUrl: hasilUnggah.url });
      onGrupBerubah?.({ avatar_url: data?.avatar_url ?? hasilUnggah.url });
      setFotoPilihan(null);
      toast.success("Foto grup diperbarui.");
    } catch (e) {
      console.error("Gagal mengganti foto grup:", e);
      toast.error(e instanceof Error ? e.message : "Foto grup gagal disimpan.");
    } finally {
      setMengunggah(false);
    }
  };

  const bubarkan = async () => {
    if (!grup) return;
    setMembubarkan(true);
    try {
      await panggilApiGrup({ action: "disband", groupId: grup.id, confirmName: ketikNama });
      setModalBubar(false);
      toast.success(`Grup ${grup.nama} dibubarkan.`);
      onGrupHilang?.();
    } catch (e) {
      console.error("Gagal membubarkan grup:", e);
      toast.error(e instanceof Error ? e.message : "Grup gagal dibubarkan.");
    } finally {
      setMembubarkan(false);
    }
  };

  const keluarGrup = async () => {
    if (!grup) return;
    setKeluar(true);
    try {
      await panggilApiGrup({ action: "leave", groupId: grup.id });
      setModalKeluar(false);
      toast.success(`Kamu keluar dari grup ${grup.nama}.`);
      onGrupHilang?.();
    } catch (e) {
      console.error("Gagal keluar grup:", e);
      toast.error(e instanceof Error ? e.message : "Gagal keluar dari grup.");
    } finally {
      setKeluar(false);
    }
  };

  const namaCocok = !!grup && ketikNama.trim().toLowerCase() === grup.nama.trim().toLowerCase();

  return (
    <>
      <AnimatePresence>
        {terbuka && (
          <>
            {/* Lapisan penangkap klik-di-luar. Juga meredupkan isi di belakangnya
                supaya jelas panel inilah yang sedang diajak bicara. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onTutup}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40"
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
              className="absolute top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col"
            >
              <div className="h-20 px-6 flex items-center justify-between border-b border-slate-100 shrink-0">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
                  {grup ? "Info Grup" : "Profil"}
                </h3>
                <button
                  onClick={onTutup}
                  aria-label="Tutup panel profil"
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-7 custom-scrollbar">
                {grup ? (
                  <>
                    <div className="flex flex-col items-center text-center gap-4">
                      {/* FOTO GRUP.
                          Bisa diganti hanya oleh pembuatnya; bagi anggota lain ia
                          cuma gambar biasa — tanpa kursor pointer, tanpa overlay,
                          supaya tidak menjanjikan aksi yang akan ditolak server. */}
                      <div className="relative">
                        <div className="w-28 h-28 rounded-3xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center overflow-hidden">
                          {pratinjau ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={pratinjau} alt="Pratinjau foto grup" className="w-full h-full object-cover" />
                          ) : grup.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={grup.avatarUrl} alt={`Foto grup ${grup.nama}`} className="w-full h-full object-cover" />
                          ) : (
                            <Users size={44} />
                          )}
                        </div>

                        {grup.bisaKelola && !pratinjau && (
                          <button
                            type="button"
                            onClick={() => inputFotoRef.current?.click()}
                            aria-label="Ganti foto grup"
                            className="absolute inset-0 rounded-3xl bg-slate-900/60 text-white opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <Camera size={26} />
                          </button>
                        )}
                        <input
                          ref={inputFotoRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          onChange={pilihFoto}
                        />
                      </div>

                      {/* Pratinjau selalu diikuti keputusan sadar: simpan atau
                          batal. Mengunggah begitu berkas dipilih membuat kekeliruan
                          memilih berkas jadi tidak bisa ditarik kembali. */}
                      {pratinjau && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={simpanFoto}
                            disabled={mengunggah}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            {mengunggah ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            {mengunggah ? "Mengunggah…" : "Simpan Foto"}
                          </button>
                          <button
                            onClick={() => setFotoPilihan(null)}
                            disabled={mengunggah}
                            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            Batal
                          </button>
                        </div>
                      )}

                      {/* NAMA GRUP */}
                      <div className="w-full">
                        {sedangUbahNama ? (
                          <div className="space-y-2">
                            <input
                              autoFocus
                              value={namaDraf}
                              maxLength={MAKS_NAMA}
                              onChange={(e) => setNamaDraf(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") simpanNama();
                                if (e.key === "Escape") { setSedangUbahNama(false); setNamaDraf(grup.nama); }
                              }}
                              className="w-full text-center p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-indigo-600 font-black uppercase tracking-tight text-slate-900"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-slate-400">
                                {namaDraf.trim().length}/{MAKS_NAMA}
                              </span>
                              <span className="flex gap-2">
                                <button
                                  onClick={() => { setSedangUbahNama(false); setNamaDraf(grup.nama); }}
                                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700"
                                >
                                  Batal
                                </button>
                                <button
                                  onClick={simpanNama}
                                  disabled={menyimpanNama || !namaDraf.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-[10px] font-black uppercase tracking-widest"
                                >
                                  {menyimpanNama ? "Menyimpan…" : "Simpan"}
                                </button>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <h4 className="text-xl font-black uppercase tracking-tight text-slate-900 break-words min-w-0">{grup.nama}</h4>
                            {grup.bisaKelola && (
                              <button
                                onClick={() => { setNamaDraf(grup.nama); setSedangUbahNama(true); }}
                                aria-label="Ubah nama grup"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-[11px] font-bold text-slate-400 mt-1.5">
                          {anggota.length} anggota · <span className="text-emerald-600">{jumlahDaring} sedang aktif</span>
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Anggota</p>
                      <div className="space-y-1">
                        {anggota.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50">
                            <div className="relative shrink-0">
                              <UserAvatar
                                name={a.name}
                                avatarUrl={a.avatar_url}
                                iconSize={14}
                                className="w-9 h-9 rounded-full bg-slate-200 text-slate-500 text-xs"
                              />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${sedangDaring(a.last_seen) ? "bg-emerald-500" : "bg-slate-300"}`}
                              />
                            </div>
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-slate-800 uppercase truncate">{a.name}</span>
                              <span className="block text-[10px] font-bold text-slate-400 truncate">{labelKehadiran(a.last_seen)}</span>
                            </span>
                          </div>
                        ))}
                        {anggota.length === 0 && (
                          <p className="text-xs font-bold text-slate-400 py-6 text-center leading-relaxed">
                            {grup.galatAnggota
                              ? "Gagal memuat daftar anggota. Coba buka ulang panel ini."
                              : "Daftar anggota belum tersedia."}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ZONA AKSI BERISIKO.
                        Dipisah divider dan ditaruh paling bawah — bukan estetika:
                        tombol yang menghapus percakapan seluruh grup tidak boleh
                        bersebelahan dengan tombol yang cuma mengganti nama. */}
                    <div className="border-t border-slate-100 pt-6">
                      {grup.bisaKelola ? (
                        <button
                          onClick={() => { setKetikNama(""); setModalBubar(true); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border-2 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                          <Trash2 size={14} /> Bubarkan Grup
                        </button>
                      ) : (
                        <button
                          onClick={() => setModalKeluar(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border-2 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-black uppercase tracking-widest transition-all"
                        >
                          <LogOut size={14} /> Keluar dari Grup
                        </button>
                      )}
                      <p className="text-[10px] font-medium text-slate-400 text-center mt-3 leading-relaxed">
                        {grup.bisaKelola
                          ? "Grup dan seluruh riwayat pesannya akan dihapus untuk semua anggota."
                          : "Kamu tidak akan lagi menerima pesan dari grup ini."}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col items-center text-center gap-4">
                      <div className="relative">
                        <UserAvatar
                          name={profil?.name}
                          avatarUrl={profil?.avatar_url}
                          iconSize={48}
                          className="w-32 h-32 rounded-full bg-slate-200 text-slate-500 text-4xl border-4 border-white shadow-xl"
                        />
                        <span
                          className={`absolute bottom-2 right-2 w-5 h-5 rounded-full border-4 border-white ${daring ? "bg-emerald-500" : "bg-slate-300"}`}
                        />
                      </div>
                      <div>
                        <h4 className="text-xl font-black uppercase tracking-tight text-slate-900 break-words">{profil?.name || "Tanpa Nama"}</h4>
                        <p className={`text-[11px] font-bold mt-1.5 ${daring ? "text-emerald-600" : "text-slate-400"}`}>
                          {labelKehadiran(profil?.last_seen)}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        <span className="px-3.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                          {labelRole(profil?.role)}
                        </span>
                        {profil?.hearing_status && LABEL_HEARING[profil.hearing_status as HearingStatus] && (
                          <span className="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
                            {LABEL_HEARING[profil.hearing_status as HearingStatus]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-5 border-t border-slate-100 pt-6">
                      <Baris label="Asal Kampus" nilai={profil?.university} />
                      <Baris label="Program Studi" nilai={profil?.study_program} />
                      <Baris label="Bio" nilai={profil?.bio} />
                      {!profil?.university && !profil?.study_program && !profil?.bio && (
                        <p className="text-xs font-bold text-slate-400 leading-relaxed">
                          Orang ini belum melengkapi asal kampus, program studi, maupun bio.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* MODAL BUBARKAN GRUP.
          Tidak memakai ConfirmModal bersama karena yang ini menuntut pengguna
          MENGETIK ULANG nama grupnya — pengaman yang sengaja lambat, sepadan
          dengan tindakan yang tidak bisa dibatalkan. */}
      <AnimatePresence>
        {modalBubar && grup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4"
            onClick={() => !membubarkan && setModalBubar(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-3 tracking-tight text-center">Bubarkan grup ini?</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed text-center mb-6">
                Grup <b className="text-slate-800">{grup.nama}</b> beserta <b className="text-slate-800">seluruh riwayat pesannya</b> akan
                dihapus untuk semua {anggota.length} anggota. Tindakan ini tidak bisa dibatalkan.
              </p>

              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Ketik ulang nama grup untuk melanjutkan
              </label>
              <input
                autoFocus
                value={ketikNama}
                onChange={(e) => setKetikNama(e.target.value)}
                placeholder={grup.nama}
                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-rose-500 font-bold text-slate-800"
              />

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setModalBubar(false)}
                  disabled={membubarkan}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={bubarkan}
                  disabled={!namaCocok || membubarkan}
                  className="flex-1 py-3 font-bold rounded-xl transition-all shadow-lg bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:shadow-none text-white flex items-center justify-center gap-2"
                >
                  {membubarkan ? <><Loader2 size={14} className="animate-spin" /> Membubarkan…</> : "Bubarkan"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL KELUAR GRUP — jauh lebih ringan, karena akibatnya juga jauh lebih
          ringan: yang hilang hanya akses orang ini, bukan grupnya. */}
      <AnimatePresence>
        {modalKeluar && grup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[120] p-4"
            onClick={() => !keluar && setModalKeluar(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-5">
                <LogOut size={30} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">Keluar dari {grup.nama}?</h3>
              <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed">
                Kamu tidak akan lagi menerima pesan dari grup ini. Anggota lain masih bisa mengundangmu kembali.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setModalKeluar(false)}
                  disabled={keluar}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={keluarGrup}
                  disabled={keluar}
                  className="flex-1 py-3 font-bold rounded-xl transition-all shadow-lg bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white flex items-center justify-center gap-2"
                >
                  {keluar ? <><Loader2 size={14} className="animate-spin" /> Keluar…</> : "Keluar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
