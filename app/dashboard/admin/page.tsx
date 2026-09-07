import { redirect } from "next/navigation";
import { BERANDA_ADMIN } from "@/lib/adminMode";

// /dashboard/admin sendiri tidak menampilkan apa pun — ia mengarahkan ke bagian
// pertama. Dengan begitu tautan lama yang masih menunjuk ke sini (mis. bookmark
// admin, atau menu "Panel Admin" versi sebelumnya) tetap sampai ke tempat yang
// benar alih-alih menabrak 404.
export default function AdminIndexPage() {
  redirect(BERANDA_ADMIN);
}
