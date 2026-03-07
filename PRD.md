
# 🏨 Master PRD: The Zenith Royale (Digital Ecosystem)

**Project Vision:** Menghadirkan pengalaman digital "Ultra-Luxury" tanpa hambatan (*Zero Loading*) yang mencerminkan eksklusivitas fisik hotel paling ikonik di dunia.

---

## 1. Arsitektur & Tech Stack

Sistem ini dibangun di atas pondasi **Modern Fullstack** yang mengutamakan kecepatan eksekusi dan skalabilitas.

| Layer | Teknologi | Peran Strategis |
| --- | --- | --- |
| **Frontend** | **Next.js 15 (App Router)** | *Server-side rendering* (SSR), *Streaming*, dan *Partial Prerendering* (PPR) untuk pengalaman tanpa loading. |
| **Styling** | **Shadcn UI + Tailwind CSS + Framer Motion** | Animasi halus yang memberikan kesan premium dan mahal. |
| **Backend/DB** | **Supabase (Postgres)** | *Database* relasional kelas industri dengan fitur *Realtime* untuk update ketersediaan kamar. |
| **Auth** | **Supabase Auth (MFA)** | Keamanan tingkat tinggi untuk data tamu VIP (Magic Links & Biometrik). |
| **Infrastructure** | **Docker** | Kontainerisasi untuk konsistensi lingkungan dari *development* hingga *production*. |

---

## 2. Strategi "Zero Loading" (Performance Standard)

Kita tidak hanya mengejar "cepat", tapi "instan". Target skor **Lighthouse Performance: 100/100**.

1. **Partial Prerendering (PPR):** Struktur halaman (shell) dikirim secara statis dari *Edge*, sementara data dinamis (harga/status booking) di-*stream* masuk menggunakan React Suspense.
2. **Optimistic UI:** Setiap interaksi user (klik tombol booking) akan langsung mengubah state UI secara lokal sebelum menunggu respon server.
3. **Adaptive Asset Delivery:** Video 8K dikompresi menggunakan *Adaptive Bitrate Streaming* (HLS/DASH) sehingga tidak ada *buffering* meski di koneksi seluler.

---

## 3. Fitur Utama (The Experience)

### A. AI-Concierge "The Royal Butler"

Sistem AI berbasis LLM yang terintegrasi dengan data hotel.

* **Fungsi:** Memesan layanan kamar, mengatur jadwal jemputan helikopter, dan menjawab pertanyaan seputar fasilitas melalui bahasa alami.
* **Integrasi:** Mengambil data *real-time* dari Supabase Edge Functions.

### B. Smart Booking Engine 2.0

Sistem pemesanan yang menggunakan logika harga dinamis.

$$P_{final} = P_{base} \times (1 + \text{DemandFactor}) - \text{LoyaltyDiscount}$$

* **Real-time Availability:** Menggunakan *Supabase Realtime* agar tamu tidak memesan kamar yang baru saja terjual di tab lain.

### C. VIP Private Portal

Dashboard khusus untuk tamu dengan level keanggotaan tertentu.

* **Customization:** Pengaturan preferensi suhu ruangan, wangi aromaterapi, dan jenis bantal (Pillow Menu) sebelum kedatangan.

---

## 4. DevOps & Kontainerisasi (Docker)

Penggunaan Docker memastikan aplikasi berjalan identik di komputer *developer* maupun di server *cloud* (seperti AWS atau Vercel).

**Struktur Dockerisasi:**

* **Multi-stage Build:** Mengecilkan ukuran *image* produksi dengan hanya menyertakan *file* yang sudah di-*build* (Next.js `.next` folder).
* **Docker Compose:** Mengelola layanan pendamping (seperti database lokal untuk testing atau Redis untuk caching) dalam satu perintah.

```dockerfile
# Contoh konsep Multi-stage build untuk efisiensi maksimal
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
# ... (hanya file produksi)
CMD ["npm", "start"]

```

---

## 5. Skema Data & Keamanan (Foundation)

Sistem menggunakan **PostgreSQL (Supabase)** dengan kebijakan **Row Level Security (RLS)** yang ketat.

* **Tabel Utama:** `Hotels`, `Suites`, `Bookings`, `VIP_Profiles`, `Service_Requests`.
* **Security:** Enkripsi AES-256 untuk data sensitif tamu dan proteksi terhadap injeksi SQL melalui penggunaan *Supabase Client* yang ter-abstraksi.

---

## 6. Kesimpulan Analitis

Proyek ini bukan sekadar membangun website, melainkan sebuah **High-Performance Engineering**. Dengan Next.js dan Supabase, kita meminimalkan latensi data. Dengan Docker, kita menjamin reliabilitas sistem. Hasil akhirnya adalah platform digital yang setangguh dan semegah Burj Khalifa.

---
