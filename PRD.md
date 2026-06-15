# Product Requirement Document (PRD): Sistem Reservasi Hotel

Dokumen Persyaratan Produk (PRD) ini disusun secara teknis dan objektif untuk pengembangan sistem reservasi hotel satu pintu (Single Hotel) menggunakan stack teknologi modern.

---

## **2. Ringkasan Proyek**

Membangun platform reservasi hotel berbasis web yang efisien, SEO-friendly, dan aman. Sistem ini akan menangani seluruh alur kerja mulai dari pencarian kamar, autentikasi pengguna, transaksi pembayaran otomatis melalui *payment gateway*, hingga manajemen operasional di sisi administrator.

## **3. Arsitektur & Teknologi**

Pemilihan teknologi ini didasarkan pada kebutuhan skalabilitas dan kecepatan pengembangan (*Time-to-Market*).

* **Framework:** Next.js (App Router) dengan TypeScript.
* **Rendering:** Hybrid (SSR untuk data dinamis, SSG untuk halaman statis seperti "Tentang Kami").
* **UI/UX:** Tailwind CSS & Shadcn UI (untuk konsistensi komponen).
* **Backend-as-a-Service (BaaS):** Supabase (PostgreSQL, Auth, Storage).
* **Payment Gateway:** Midtrans (Snap API).
* **Deployment:** Vercel.

---

## **4. Panduan UI/UX & Estetika (Ultra-Luxury)**

Antarmuka pengguna (UI) harus memancarkan kesan sangat mewah, eksklusif, dan modern. Desain ini menggabungkan keanggunan klasik (terinspirasi dari Kempinski) dengan kemegahan minimalis modern (terinspirasi dari Burj Khalifa).

### **A. Konsep Visual Utama**

* **Thema:** *Modern Elegance & High-End Luxury*.
* **Sistem Tema (Light/Dark Mode):** Aplikasi wajib mendukung mode terang dan gelap untuk fleksibilitas pengguna.
  * **Light Mode:** Dominasi warna putih bersih (*Off-White*), krem, dan aksen emas klasik yang elegan (referensi: Kempinski).
  * **Dark Mode:** Dominasi warna hitam pekat (Deep Black/Midnight) dengan aksen emas yang *glowing* untuk nuansa misterius dan megah (referensi: Burj Khalifa).

### **B. Tipografi & Warna**

* **Tipografi:** Menggunakan kombinasi font yang seimbang sesuai sistem operasi atau font populer eksklusif.
  * **Heading:** Font keluarga Serif yang elegan (contoh: Playfair Display, Cinzel, Prata) untuk memberikan sentuhan *heritage* dan mewah.
  * **Body:** Font keluarga Sans-Serif yang geometris, bersih, dan modern (contoh: Inter, Montserrat, Outfit) untuk keterbacaan tingkat tinggi.
* **Palet Warna Inti:**
  * **Aksen Emas:** Digunakan secara terukur pada tombol utama (*Call-to-Action*), ikon, garis halus (*border*), atau interaksi *hover*. Warna emas harus solid namun tidak norak (*Champagne Gold* atau *Metallic Gold*).
  * **Ruang Negatif (Whitespace):** Penggunaan ruang kosong (*padding/margin*) yang sangat luas untuk memberikan kesan lega, mewah, mahal, dan tidak padat informasi.

### **C. Komponen Interaktif (Tailwind + Framer Motion)**

* **Tombol (Buttons):** Dominasi *ghost buttons* (latar belakang transparan dengan *border* tipis emas) untuk tampilan elegan, atau tombol solid *sleek* tanpa *rounded* berlebihan (ujung sedikit tajam atau melengkung sangat tipis).
* **Input & Formulir:** Desain minimalis (misalnya hanya memiliki *border-bottom* atau latar *glassmorphism* tipis) tanpa garis kotak yang tebal.
* **Animasi & Transisi ("Zero Loading Experience"):**
  * Efek *fade-up* halus atau teks *reveal* yang lembut saat pengguna melakukan *scrolling*.
  * Efek *zoom* atau *parallax* yang sangat lambat pada *banner/hero image* kamar.
  * Transisi halaman (*page transitions*) yang mulus.
  * Hindari indikator *loading spinner* standar; gunakan skeleton UI minimalis dengan kilauan emas halus yang mengisyaratkan kecepatan.

---

## **5. Ruang Lingkup Fitur (Feature Scope)**

### **A. Fitur Pengguna (Client-Side)**

1. **Landing Page:** Hero section, keunggulan hotel, dan *call-to-action* (CTA) pemesanan.
2. **Manajemen Katalog Kamar:**

* Daftar tipe kamar dengan filter ketersediaan.
* Detail kamar (fasilitas, deskripsi, galeri foto dari Supabase Storage).

1. **Sistem Reservasi:**

* Pemilihan tanggal (*Date Range Picker*).
* Formulir data tamu.
* Integrasi Midtrans Snap untuk pembayaran (E-wallet, VA, Credit Card).

1. **Autentikasi (Supabase Auth):** Login, Register, dan Reset Password.
2. **Dashboard User:**

* Riwayat reservasi.
* Status pembayaran (Pending, Success, Expired).
* **Cetak Tiket:** Unduh bukti reservasi dalam format PDF setelah pembayaran sukses.

### **B. Fitur Administrator (Dashboard Admin)**

1. **Statistik Ringkas:** Grafik reservasi harian, total pendapatan, dan okupansi kamar.
2. **Manajemen Kamar (CRUD):** Tambah, ubah, atau hapus data kamar dan status ketersediaan.
3. **Manajemen Reservasi:** Memantau seluruh transaksi yang masuk.
4. **Verifikasi Pembayaran:** Sinkronisasi otomatis dengan Midtrans Webhook untuk mengubah status reservasi.
5. **Laporan Penjualan:** Ekspor data reservasi untuk kebutuhan audit.

---

## **5. Ruang Lingkup Teknis (Infrastructure & Bridging)**

### **A. Skema Database (PostgreSQL)**

Beberapa tabel utama yang wajib ada:

* `profiles`: Data pengguna (dikaitkan dengan `auth.users` Supabase).
* `rooms`: ID, tipe, harga, fasilitas, kapasitas, status.
* `bookings`: ID, user_id, room_id, check_in, check_out, total_price, status_pembayaran.
* `transactions`: ID_transaksi_midtrans, booking_id, metode_pembayaran, waktu_transaksi.

### **B. Integrasi API (Bridging)**

1. **Midtrans API:**

* Frontend memanggil API Route Next.js untuk membuat `transaction_token`.
* Backend menerima `notification_url` (Webhook) dari Midtrans untuk memperbarui status di PostgreSQL secara real-time.

1. **Supabase Storage:** Penyimpanan aset gambar kamar dengan optimasi URL.
2. **PDF Generation:** Menggunakan pustaka seperti `@react-pdf/renderer` atau `jspdf` untuk generate tiket reservasi di sisi klien atau server.

---

## **6. Alur Kerja Sistem (Workflow)**

1. **Pemesanan:** User memilih kamar -> Sistem mengecek ketersediaan di DB -> User klik "Bayar".
2. **Pembayaran:** Next.js mengirim data ke Midtrans -> Midtrans memberikan Token Snap -> User menyelesaikan pembayaran di UI Snap.
3. **Konfirmasi:** Midtrans mengirim Webhook ke `/api/webhook/midtrans` -> Server Next.js memvalidasi *signature* -> Update status di PostgreSQL menjadi "PAID" -> Kamar ditandai terisi pada tanggal tersebut.
4. **Output:** User mendapatkan notifikasi sukses dan akses ke tombol "Unduh Tiket".

---

## **7. Persyaratan Non-Fungsional**

* **Keamanan:** Validasi input di sisi server (Zod/Yup), proteksi RLS (Row Level Security) di Supabase.
* **Performa:** LCP (Largest Contentful Paint) di bawah 2.5 detik menggunakan Image Optimization dari Next.js.
* **SEO:** Implementasi Metadata API pada setiap halaman produk/kamar.

---

## **8. Penutup**

PRD ini berfokus pada fungsionalitas inti untuk memastikan sistem berjalan stabil. Penggunaan TypeScript di seluruh lapisan (End-to-End Type Safety) akan meminimalisir *bug* saat proses integrasi antara Midtrans dan Supabase.
