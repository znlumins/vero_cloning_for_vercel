// Token sesi yang tersimpan di localStorage, dibaca dari satu tempat.
//
// Sebagian besar permintaan ke server lewat lib/db.ts, yang menyisipkan token
// ini sendiri. Tapi ada beberapa jalur yang SENGAJA tidak lewat sana — /api/group,
// /api/profile/update, /api/presence, /api/admin — karena masing-masing punya
// pagar kewenangannya sendiri yang tidak boleh dilewati CRUD generik. Jalur-jalur
// itulah yang butuh token ini secara langsung.

export function ambilTokenSesi(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem("db_mock_session");
    return s ? JSON.parse(s)?.access_token || null : null;
  } catch {
    return null;
  }
}

/** Header Authorization siap pakai; kosong kalau belum ada sesi. */
export function headerAuth(): Record<string, string> {
  const t = ambilTokenSesi();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
