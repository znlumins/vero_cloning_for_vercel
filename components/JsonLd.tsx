// Structured data (JSON-LD) untuk seluruh situs.
//
// Tujuannya satu: memberi tahu mesin pencari bahwa "Vero Learn", "VeroApp", dan
// "VERO Learning" adalah SATU entitas yang sama, dan entitas itu adalah produk
// pendidikan Indonesia — bukan salah satu dari banyak merek bernama "Vero" di
// dunia. Tanpa ini, pencarian nama merek sendiri pun sulit dimenangkan karena
// "vero" dan "learn" dua-duanya kata umum.
//
// Aturan main saat menyunting berkas ini:
// 1. Jangan pernah memasukkan URL ke `sameAs` sebelum halamannya benar-benar
//    ada. Tautan mati justru melemahkan sinyal entitas.
// 2. Jangan mencantumkan fitur yang belum jalan di `featureList`. Patokannya
//    lib/signModes.ts: sebuah kombinasi baru boleh ditulis di sini setelah
//    modelFor() mengembalikan folder model, bukan saat masih direncanakan.
//    (Kata SIBI dulu tidak ditulis di sini karena alasan itu; modelnya masuk
//    17 Agustus 2026.)
// 3. Jangan menambahkan klaim akurasi apa pun. Angka tanpa syarat pengujiannya
//    menyesatkan, dan akan ditanyakan saat penjurian.

const data = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://verolearning.my.id/#organization",
      name: "VERO Learning",
      alternateName: ["Vero Learn", "VeroLearn", "VeroApp", "VERO", "Vero LMS"],
      url: "https://verolearning.my.id",
      logo: {
        "@type": "ImageObject",
        url: "https://verolearning.my.id/vero-logo.svg",
      },
      description:
        "Platform pembelajaran inklusif yang menerjemahkan bahasa isyarat BISINDO dan SIBI menjadi teks secara langsung melalui kamera.",
      founder: {
        "@type": "Organization",
        name: "Tim PKM-KC Universitas Brawijaya",
      },
      parentOrganization: {
        "@type": "CollegeOrUniversity",
        name: "Universitas Brawijaya",
        url: "https://ub.ac.id",
      },
      areaServed: { "@type": "Country", name: "Indonesia" },
      sameAs: [
        "https://www.instagram.com/verolearn.kc/",
        "https://x.com/verolearn_kc",
        "https://www.tiktok.com/@verolearn.kc",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://verolearning.my.id/#website",
      url: "https://verolearning.my.id",
      name: "VERO Learning",
      alternateName: ["Vero Learn", "VeroLearn", "VeroApp"],
      inLanguage: "id-ID",
      publisher: { "@id": "https://verolearning.my.id/#organization" },
    },
    {
      "@type": "WebApplication",
      "@id": "https://verolearning.my.id/#app",
      name: "VERO Learning",
      url: "https://verolearning.my.id",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Peramban web (Chrome, Edge, Firefox)",
      browserRequirements: "Membutuhkan JavaScript dan akses kamera",
      inLanguage: "id-ID",
      offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
      featureList: [
        "Pengenalan abjad BISINDO dari kamera",
        "Pengenalan abjad SIBI dari kamera",
        "Pengenalan kata BISINDO dari kamera",
        "Pengenalan kata SIBI dari kamera",
        "Speech-to-text untuk kelas daring",
        "Papan tulis digital",
        "Ruang pertemuan daring yang ramah Teman Tuli",
      ],
      publisher: { "@id": "https://verolearning.my.id/#organization" },
    },
  ],
};

export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
