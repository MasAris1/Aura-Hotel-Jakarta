# Naskah Presentasi Formal
## Topik: Fitur User Login pada Project Aura Hotel Web

### Pembuka
Selamat pagi/siang. Pada kesempatan ini saya akan mempresentasikan fitur **user login** yang ada pada project **Aura Hotel Web**. Fokus pembahasan saya bukan hanya tampilan halaman login, tetapi juga bagaimana sistem autentikasi bekerja dari sisi frontend, backend, session, role, proteksi route, sampai keamanan akses data.

Fitur login pada project ini sangat penting karena menjadi pintu masuk untuk membedakan antara pengguna biasa, receptionist, dan admin. Dengan adanya login, sistem bisa memastikan bahwa setiap user hanya mengakses halaman dan data yang sesuai dengan hak aksesnya.

### Gambaran Umum Fitur Login
Pada project ini, fitur login dibangun menggunakan **Next.js App Router** dan **Supabase Auth**. Supabase dipakai sebagai layanan autentikasi sekaligus terhubung ke database PostgreSQL. Selain itu, project ini juga menggunakan **Row Level Security** atau **RLS** agar akses data tetap aman di level database.

Secara umum, alur login di project ini adalah sebagai berikut:

1. User membuka halaman `/login`.
2. User memilih metode login yang tersedia.
3. Sistem mengirim request autentikasi ke Supabase.
4. Jika autentikasi berhasil, session user dibuat.
5. Sistem membaca role user dari tabel `profiles`.
6. User diarahkan ke halaman yang sesuai dengan role atau tujuan awalnya.

Jadi, login di sini tidak berhenti pada tahap "berhasil masuk", tetapi dilanjutkan dengan proses penentuan hak akses dan tujuan redirect yang tepat.

### Metode Login yang Tersedia
Di project ini terdapat tiga metode login utama.

Metode pertama adalah **Google OAuth**. Dengan metode ini, user dapat login menggunakan akun Google. Keuntungannya adalah proses login menjadi lebih cepat karena user tidak perlu membuat password baru secara manual.

Metode kedua adalah **Magic Link**. Pada metode ini, user hanya memasukkan email. Sistem kemudian mengirim link login ke email tersebut. Setelah user membuka link itu, user akan langsung terautentikasi. Metode ini memudahkan user yang tidak ingin mengingat password.

Metode ketiga adalah **Email dan Password**. Ini adalah metode login yang paling umum. User memasukkan email dan password, lalu sistem memverifikasi data tersebut melalui Supabase Auth.

Dengan menyediakan tiga metode ini, project menjadi lebih fleksibel dan memberi pengalaman login yang lebih nyaman untuk berbagai tipe pengguna.

### Komponen dan File Penting
Dari sisi implementasi, ada beberapa bagian penting yang membentuk fitur login ini.

Halaman login berada pada route `/login`. Di halaman ini user dapat memilih metode login antara magic link dan password, serta tersedia tombol login menggunakan Google.

Logika autentikasi utamanya ada di file action server. Di sana terdapat fungsi untuk:

- login dengan password
- login dengan magic link
- signup
- request reset password
- update password setelah reset

Selain itu, ada route callback `/auth/callback` yang berfungsi menangani hasil autentikasi dari Google OAuth, magic link, dan proses reset password. Setelah Supabase mengembalikan code autentikasi, route callback akan menukar code tersebut menjadi session yang valid.

### Alur Login Secara Detail
Sekarang saya jelaskan alur login secara lebih rinci.

Jika user memilih login dengan **email dan password**, sistem akan memanggil fungsi autentikasi Supabase menggunakan email dan password yang diinput user. Jika berhasil, sistem akan memastikan bahwa user memiliki data profile pada tabel `profiles`. Setelah itu, user akan diarahkan ke halaman tujuan.

Jika user memilih **magic link**, sistem hanya meminta email. Supabase lalu mengirim email berisi tautan login. Ketika tautan dibuka, user akan masuk ke route callback. Route callback ini akan memproses code dari Supabase, membuat session, memastikan profile user ada, lalu mengarahkan user ke halaman yang sesuai.

Jika user memilih **Google OAuth**, alurnya mirip dengan magic link. Bedanya, user terlebih dahulu diarahkan ke halaman otorisasi Google. Setelah berhasil, Google mengembalikan hasil autentikasi ke `/auth/callback`, lalu sistem membuat session dan melanjutkan redirect.

Hal penting di sini adalah semua metode login akhirnya bertemu pada satu alur inti, yaitu:

- autentikasi berhasil
- session dibuat
- profile dipastikan tersedia
- role dibaca
- redirect dilakukan

Dengan pola ini, alur login menjadi konsisten walaupun metode masuknya berbeda.

### Pengelolaan Profile User
Project ini memisahkan data autentikasi dan data profil.

Data autentikasi utama dikelola oleh Supabase pada `auth.users`, sedangkan data aplikasi seperti `first_name`, `last_name`, dan `role` disimpan di tabel `public.profiles`.

Ketika user baru dibuat, sistem memiliki mekanisme untuk memastikan row `profiles` ikut tersedia. Bahkan pada level database, ada trigger `handle_new_user` yang otomatis membuat profile ketika ada user baru di `auth.users`. Selain itu, di kode aplikasi juga ada fungsi `ensureProfileForUser` untuk memastikan profile benar-benar ada saat proses login atau signup.

Ini penting karena logika redirect setelah login bergantung pada nilai `role` yang ada di tabel `profiles`, bukan pada metadata biasa.

### Role dan Redirect Setelah Login
Salah satu bagian paling penting dari fitur login project ini adalah **role-based redirect**.

Role resmi yang digunakan ada tiga, yaitu:

- `guest`
- `receptionist`
- `admin`

Setelah user login, sistem akan memeriksa role user pada tabel `profiles`.

Jika role user adalah `admin`, maka home path utamanya adalah `/admin`.

Jika role user adalah `receptionist`, maka home path utamanya adalah `/dashboard`.

Jika role user adalah `guest`, maka home path utamanya adalah `/vip`.

Selain redirect berdasarkan role, sistem juga mendukung redirect ke halaman tujuan awal. Misalnya, jika user belum login lalu mencoba masuk ke `/booking`, maka user akan diarahkan lebih dulu ke `/login?redirect=/booking`. Setelah login berhasil, sistem akan mengembalikan user ke halaman `/booking`.

Namun, redirect ini tetap disaring. Jika ada user non-admin yang mencoba membuka halaman admin, maka sistem tidak akan mengizinkan redirect ke `/admin`, melainkan mengarahkan ke halaman yang sesuai, yaitu `/dashboard`. Jadi, redirect di project ini tidak hanya nyaman, tetapi juga aman.

### Proteksi Route
Proteksi route pada project ini dilakukan melalui middleware.

Route yang dianggap membutuhkan autentikasi antara lain:

- `/dashboard`
- `/vip`
- `/booking`
- `/checkout`
- `/admin`

Jika user belum memiliki session dan mencoba membuka salah satu route tersebut, middleware akan langsung mengarahkan user ke halaman login dengan parameter `redirect`.

Selain itu, ada validasi khusus untuk route admin. Jika user sudah login tetapi role-nya bukan admin, maka akses ke `/admin` akan ditolak dan user akan diarahkan ke `/dashboard`.

Middleware ini membuat aplikasi lebih aman karena pengecekan akses dilakukan lebih awal, bahkan sebelum halaman sensitif dirender.

### Keamanan Fitur Login
Berikutnya adalah aspek keamanan yang juga penting untuk dipresentasikan.

Pertama, project ini memiliki fungsi untuk **menyaring redirect internal**. Artinya, sistem hanya menerima redirect ke path internal yang aman. Ini mencegah redirect ke URL eksternal yang berpotensi berbahaya.

Kedua, session dikelola melalui mekanisme Supabase SSR dan cookie, sehingga sinkronisasi antara server dan browser tetap terjaga.

Ketiga, project ini menggunakan **Row Level Security** pada database. Dengan RLS, user biasa hanya dapat melihat atau memodifikasi data yang memang menjadi miliknya. Contohnya, guest hanya boleh melihat booking miliknya sendiri, sedangkan staff dapat melihat data yang lebih luas sesuai kebijakan role.

Keempat, ada pemisahan antara `anon key` dan `service role key`. Kunci `service role` hanya dipakai untuk kebutuhan server tertentu, seperti webhook, dan tidak boleh diekspos ke client.

Kelima, pada layer proxy terdapat rate limiter sederhana berbasis IP. Fungsinya untuk membantu membatasi request berlebihan dalam waktu singkat.

Jadi, keamanan login di project ini tidak hanya bergantung pada form login, tetapi dibangun berlapis mulai dari frontend, middleware, session, sampai database.

### Fitur Pendukung Terkait Login
Selain login utama, project ini juga menyediakan fitur pendukung yang membuat sistem autentikasi lebih lengkap.

Fitur tersebut antara lain:

- register atau pendaftaran akun baru
- forgot password
- reset password
- feedback error dan success pada halaman login

Dengan adanya fitur-fitur ini, sistem autentikasi menjadi lebih siap digunakan oleh user secara nyata, bukan hanya untuk demonstrasi login dasar.

### Nilai Tambah untuk Project
Jika dilihat dari sisi kualitas aplikasi, fitur login ini memiliki beberapa nilai tambah.

Pertama, user experience cukup baik karena menyediakan beberapa metode login sekaligus.

Kedua, alur redirect setelah login sudah cerdas karena mempertimbangkan tujuan awal user dan role user.

Ketiga, sistem tidak hanya memeriksa apakah user sudah login, tetapi juga memeriksa apakah user berhak mengakses route tertentu.

Keempat, ada konsistensi antara sisi aplikasi dan sisi database melalui penggunaan `profiles`, trigger, dan RLS.

Dengan demikian, fitur login ini bukan hanya fitur tampilan, tetapi menjadi fondasi utama untuk keamanan dan personalisasi aplikasi.

### Penutup
Sebagai kesimpulan, fitur user login pada project Aura Hotel Web dibangun menggunakan Supabase Auth dan Next.js dengan tiga metode autentikasi, yaitu Google OAuth, magic link, dan email-password. Setelah login berhasil, sistem akan membuat session, memastikan profile user tersedia, membaca role, lalu mengarahkan user ke halaman yang tepat.

Middleware digunakan untuk melindungi route penting, sedangkan keamanan data diperkuat dengan validasi redirect, cookie session, rate limit, dan Row Level Security pada database.

Jadi, fitur login pada project ini tidak hanya berfungsi sebagai pintu masuk aplikasi, tetapi juga sebagai dasar pengaturan hak akses, keamanan data, dan pengalaman pengguna secara keseluruhan.

Sekian presentasi dari saya. Terima kasih.

### Cadangan Jawaban Jika Ditanya Dosen
**Jika ditanya mengapa memakai Supabase Auth**

Saya memilih Supabase Auth karena integrasinya langsung dengan PostgreSQL dan memudahkan pengelolaan session, OAuth, magic link, serta keamanan berbasis RLS dalam satu ekosistem.

**Jika ditanya perbedaan authentication dan authorization**

Authentication adalah proses memastikan siapa user yang login. Authorization adalah proses menentukan user tersebut boleh mengakses fitur apa berdasarkan role.

**Jika ditanya mengapa perlu tabel profiles**

Karena data login utama ada di `auth.users`, sedangkan aplikasi membutuhkan data tambahan seperti nama dan role. Data ini lebih tepat disimpan di tabel `profiles` agar mudah dipakai dalam logika aplikasi.

**Jika ditanya apa risiko jika tanpa middleware**

Tanpa middleware, route privat bisa sempat diakses atau dirender sebelum validasi dilakukan. Middleware membuat proteksi berjalan lebih awal dan lebih konsisten.
