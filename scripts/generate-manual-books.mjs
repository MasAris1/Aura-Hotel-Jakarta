import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Text wrap helper
function wrapText(text, maxWidth, font, fontSize) {
  const paragraphs = text.split("\n");
  const lines = [];

  for (const para of paragraphs) {
    const cleanPara = para.replace(/\r/g, "").trim();
    if (!cleanPara) {
      lines.push("");
      continue;
    }
    const words = cleanPara.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

class PDFCreator {
  constructor(pdf, regularFont, boldFont, serifRegular, serifBold, theme) {
    this.pdf = pdf;
    this.regularFont = regularFont;
    this.boldFont = boldFont;
    this.serifRegular = serifRegular;
    this.serifBold = serifBold;
    this.theme = theme;
    this.pages = [];
    this.currentPage = null;
    this.currentY = 0;
    this.margin = 54;
    this.width = 595.28;
    this.height = 841.89;
    this.contentWidth = this.width - 2 * this.margin;
  }

  addPage() {
    this.currentPage = this.pdf.addPage([this.width, this.height]);
    this.currentPage.drawRectangle({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      color: this.theme.darkBg,
    });
    this.pages.push(this.currentPage);
    this.currentY = this.height - this.margin;

    if (this.pages.length > 1) {
      this.drawHeader();
    }
  }

  drawHeader() {
    this.currentPage.drawText("AURA HOTEL JAKARTA — BUKU PANDUAN PENGGUNA WEBSITE", {
      x: this.margin,
      y: this.height - 35,
      size: 7.5,
      font: this.boldFont,
      color: this.theme.gold,
    });
    this.currentPage.drawLine({
      start: { x: this.margin, y: this.height - 40 },
      end: { x: this.width - this.margin, y: this.height - 40 },
      thickness: 0.5,
      color: this.theme.border,
    });
    this.currentY = this.height - 60;
  }

  drawFooter(pageNumber, totalPages) {
    const page = this.pages[pageNumber - 1];
    page.drawLine({
      start: { x: this.margin, y: 40 },
      end: { x: this.width - this.margin, y: 40 },
      thickness: 0.5,
      color: this.theme.border,
    });
    page.drawText(`Aura Hotel Jakarta © 2026 — Panduan Operasional & Layanan Reservasi`, {
      x: this.margin,
      y: 26,
      size: 7,
      font: this.regularFont,
      color: this.theme.soft,
    });
    const pageText = `Halaman ${pageNumber} dari ${totalPages}`;
    const textWidth = this.regularFont.widthOfTextAtSize(pageText, 7);
    page.drawText(pageText, {
      x: this.width - this.margin - textWidth,
      y: 26,
      size: 7,
      font: this.regularFont,
      color: this.theme.soft,
    });
  }

  drawCover(title, subtitle, metaText) {
    this.currentPage = this.pdf.addPage([this.width, this.height]);
    this.currentPage.drawRectangle({
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      color: this.theme.darkBg,
    });
    this.pages.push(this.currentPage);

    // Decorative outer border
    this.currentPage.drawRectangle({
      x: 30,
      y: 30,
      width: this.width - 60,
      height: this.height - 60,
      borderColor: this.theme.gold,
      borderWidth: 1.5,
    });

    // Decorative inner border
    this.currentPage.drawRectangle({
      x: 36,
      y: 36,
      width: this.width - 72,
      height: this.height - 72,
      borderColor: this.theme.border,
      borderWidth: 0.5,
    });

    // Title
    const titleLines = wrapText(title.toUpperCase(), this.contentWidth - 40, this.serifBold, 24);
    let titleY = 520;
    for (const line of titleLines) {
      if (!line) continue;
      const w = this.serifBold.widthOfTextAtSize(line, 24);
      this.currentPage.drawText(line, {
        x: (this.width - w) / 2,
        y: titleY,
        size: 24,
        font: this.serifBold,
        color: this.theme.gold,
      });
      titleY -= 32;
    }

    // Subtitle
    const subLines = wrapText(subtitle, this.contentWidth - 60, this.serifRegular, 11);
    let subY = titleY - 20;
    for (const line of subLines) {
      if (!line) {
        subY -= 15;
        continue;
      }
      const w = this.serifRegular.widthOfTextAtSize(line, 11);
      this.currentPage.drawText(line, {
        x: (this.width - w) / 2,
        y: subY,
        size: 11,
        font: this.serifRegular,
        color: this.theme.white,
      });
      subY -= 16;
    }

    // Separator line
    this.currentPage.drawLine({
      start: { x: this.width / 2 - 50, y: subY - 30 },
      end: { x: this.width / 2 + 50, y: subY - 30 },
      thickness: 1,
      color: this.theme.gold,
    });

    // Meta / details at bottom
    const metaLines = metaText.split("\n");
    let mY = 180;
    for (const line of metaLines) {
      const cleanLine = line.replace(/\r/g, "").trim();
      if (!cleanLine) {
        mY -= 15;
        continue;
      }
      const w = this.regularFont.widthOfTextAtSize(cleanLine, 8.5);
      this.currentPage.drawText(cleanLine, {
        x: (this.width - w) / 2,
        y: mY,
        size: 8.5,
        font: this.regularFont,
        color: this.theme.soft,
      });
      mY -= 15;
    }
  }

  drawHeading(text, level = 1) {
    let size = 16;
    let font = this.serifBold;
    let color = this.theme.gold;
    let spacingBefore = 22;
    let spacingAfter = 10;

    if (level === 2) {
      size = 12;
      font = this.serifBold;
      color = this.theme.gold;
      spacingBefore = 16;
      spacingAfter = 8;
    } else if (level === 3) {
      size = 9.5;
      font = this.boldFont;
      color = this.theme.white;
      spacingBefore = 12;
      spacingAfter = 6;
    }

    if (this.currentY - spacingBefore - size - spacingAfter < 60) {
      this.addPage();
    } else {
      this.currentY -= spacingBefore;
    }

    this.currentPage.drawText(text, {
      x: this.margin,
      y: this.currentY - size,
      size,
      font,
      color,
    });
    this.currentY -= (size + spacingAfter);
  }

  drawParagraph(text, isItalic = false) {
    const size = 8.5;
    const font = isItalic ? this.serifRegular : this.regularFont;
    const color = this.theme.white;
    const leading = 12.5;
    const paragraphSpacing = 7;

    const lines = wrapText(text, this.contentWidth, font, size);

    for (const line of lines) {
      if (!line) {
        this.currentY -= paragraphSpacing;
        continue;
      }
      if (this.currentY - leading < 60) {
        this.addPage();
      }
      this.currentPage.drawText(line, {
        x: this.margin,
        y: this.currentY - size,
        size,
        font,
        color,
      });
      this.currentY -= leading;
    }
    this.currentY -= paragraphSpacing;
  }

  drawListItem(text, indent = 15) {
    const size = 8.5;
    const font = this.regularFont;
    const color = this.theme.white;
    const leading = 12.5;
    const paragraphSpacing = 3;

    const bullet = "• ";
    const bulletWidth = font.widthOfTextAtSize(bullet, size);
    
    const actualIndent = this.margin + indent;
    const actualWidth = this.contentWidth - indent;
    const lines = wrapText(text, actualWidth, font, size);

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      if (this.currentY - leading < 60) {
        this.addPage();
      }
      
      if (i === 0) {
        this.currentPage.drawText(bullet, {
          x: actualIndent - bulletWidth,
          y: this.currentY - size,
          size,
          font: this.boldFont,
          color: this.theme.gold,
        });
      }

      this.currentPage.drawText(lines[i], {
        x: actualIndent,
        y: this.currentY - size,
        size,
        font,
        color,
      });
      this.currentY -= leading;
    }
    this.currentY -= paragraphSpacing;
  }

  async drawImage(imagePath, caption, widthScale = 1) {
    if (!fs.existsSync(imagePath)) {
      console.warn("Gambar tidak ditemukan:", imagePath);
      const boxHeight = 120;
      if (this.currentY - boxHeight - 25 < 60) {
        this.addPage();
      }
      this.currentPage.drawRectangle({
        x: this.margin,
        y: this.currentY - boxHeight,
        width: this.contentWidth,
        height: boxHeight,
        color: this.theme.cardBg,
        borderColor: this.theme.border,
        borderWidth: 1,
      });
      const placeholderText = `[Tangkapan Layar: ${caption}]`;
      const wText = this.regularFont.widthOfTextAtSize(placeholderText, 8);
      this.currentPage.drawText(placeholderText, {
        x: this.margin + (this.contentWidth - wText) / 2,
        y: this.currentY - boxHeight / 2 - 4,
        size: 8,
        font: this.regularFont,
        color: this.theme.soft,
      });
      this.currentY -= (boxHeight + 25);
      return;
    }

    try {
      const imageBytes = fs.readFileSync(imagePath);
      let img;
      if (imagePath.toLowerCase().endsWith(".png")) {
        img = await this.pdf.embedPng(imageBytes);
      } else {
        img = await this.pdf.embedJpg(imageBytes);
      }

      const dims = img.scale(1);
      
      const maxWidth = this.contentWidth * widthScale;
      let imgWidth = dims.width;
      let imgHeight = dims.height;

      if (imgWidth > maxWidth) {
        const ratio = maxWidth / imgWidth;
        imgWidth = maxWidth;
        imgHeight = imgHeight * ratio;
      }

      const totalSpace = imgHeight + 22;
      if (this.currentY - totalSpace < 60) {
        this.addPage();
      }

      const x = this.margin + (this.contentWidth - imgWidth) / 2;
      this.currentPage.drawImage(img, {
        x,
        y: this.currentY - imgHeight,
        width: imgWidth,
        height: imgHeight,
      });
      this.currentY -= imgHeight;

      const captionSize = 7;
      const captionFont = this.regularFont;
      const captionColor = this.theme.soft;
      const captionWidth = captionFont.widthOfTextAtSize(caption, captionSize);
      
      this.currentPage.drawText(caption, {
        x: this.margin + (this.contentWidth - captionWidth) / 2,
        y: this.currentY - 10,
        size: captionSize,
        font: captionFont,
        color: captionColor,
      });
      this.currentY -= 20;
    } catch (err) {
      console.error("Gagal menyisipkan gambar:", imagePath, err);
    }
  }

  drawSeparator() {
    if (this.currentY - 10 < 60) {
      this.addPage();
      return;
    }
    this.currentPage.drawLine({
      start: { x: this.margin, y: this.currentY - 5 },
      end: { x: this.width - this.margin, y: this.currentY - 5 },
      thickness: 0.5,
      color: this.theme.border,
    });
    this.currentY -= 15;
  }
}

async function generateManualBook(isVisual, outputPath) {
  console.log(`Membuat manual book: ${path.basename(outputPath)}...`);
  
  const pdf = await PDFDocument.create();
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifRegular = await pdf.embedFont(StandardFonts.TimesRoman);

  const theme = {
    darkBg: rgb(0.035, 0.035, 0.043), // #09090b
    white: rgb(0.95, 0.95, 0.97),
    gold: rgb(0.83, 0.69, 0.28), // #d4af37
    soft: rgb(0.63, 0.63, 0.67), // #a1a1aa
    cardBg: rgb(0.08, 0.08, 0.1),
    border: rgb(0.18, 0.18, 0.22),
  };

  const doc = new PDFCreator(pdf, regularFont, boldFont, serifRegular, serifBold, theme);

  // 1. Cover Page
  const subtitle = isVisual 
    ? "Buku Panduan Pengguna & Operasional Website Resmi\n(Dilengkapi Tangkapan Layar Visual Antarmuka)"
    : "Buku Panduan Pengguna & Operasional Website Resmi\n(Versi Tekstual Langkah-demi-Langkah)";
  
  doc.drawCover(
    "Aura Hotel Jakarta",
    subtitle,
    "SISTEM RESERVASI HOTEL MEWAH SATU PINTU (SINGLE HOTEL)\n\nPeran Pengguna: Tamu (Guest), Staf Resepsionis, Administrator\n\nDiperbarui: Juni 2026\nTim Pengembang Aura Hotel Jakarta"
  );

  // 2. Add Content Page
  doc.addPage();

  doc.drawHeading("Daftar Isi", 1);
  doc.drawListItem("Bab I: Pengenalan Layanan Website Aura Hotel");
  doc.drawListItem("Bab II: Alur Reservasi Kamar & Pembayaran");
  doc.drawListItem("Bab III: Panduan Penggunaan untuk Tamu (Guest)");
  doc.drawListItem("Bab IV: Panduan Operasional untuk Staf Resepsionis");
  doc.drawListItem("Bab V: Panduan Pengelolaan untuk Administrator (Admin)");
  doc.drawSeparator();

  // BAB I
  doc.drawHeading("Bab I: Pengenalan Layanan Website Aura Hotel", 1);
  doc.drawParagraph(
    "Selamat datang di sistem reservasi satu pintu resmi Aura Hotel Jakarta. Website ini dirancang khusus untuk memfasilitasi kebutuhan para tamu dalam memesan kamar mewah secara mandiri dan transparan, sekaligus menyediakan portal manajemen internal untuk staf resepsionis dan administrator hotel."
  );
  doc.drawParagraph(
    "Website ini memiliki tampilan responsif bernuansa elegan (menggabungkan tema modern berwarna hitam pekat dengan sentuhan aksen emas solid) untuk memberikan impresi kemewahan sejak kunjungan pertama. Pengguna dapat dengan mudah menjelajahi tipe-tipe kamar yang tersedia, membaca fasilitas yang ditawarkan, dan memantau status pemesanan mereka secara langsung dari perangkat komputer maupun ponsel pintar."
  );
  
  if (isVisual) {
    await doc.drawImage(
      path.join(projectRoot, "designs/screenshots-desktop/home-laptop-viewport.png"),
      "Gambar 1.1: Tampilan Halaman Utama (Landing Page) Aura Hotel Jakarta",
      0.85
    );
  }

  doc.drawSeparator();

  // BAB II
  doc.drawHeading("Bab II: Alur Reservasi Kamar & Pembayaran", 1);
  doc.drawParagraph(
    "Proses reservasi di website Aura Hotel Jakarta sangat sederhana, aman, dan instan. Berikut adalah alur umum yang dilalui tamu saat memesan kamar:"
  );

  doc.drawHeading("1. Pencarian & Pemilihan Kamar", 3);
  doc.drawParagraph(
    "Tamu mengunjungi website dan meninjau katalog kamar. Setiap kamar dilengkapi dengan detail deskripsi, foto ruangan asli, batas kapasitas orang dewasa, serta harga inap dasar per malam."
  );
  
  if (isVisual) {
    await doc.drawImage(
      path.join(projectRoot, "designs/screenshots-desktop/room-detail.png"),
      "Gambar 2.1: Tampilan Halaman Rincian dan Fasilitas Kamar",
      0.85
    );
  }

  doc.drawHeading("2. Pengisian Data & Checkout", 3);
  doc.drawParagraph(
    "Setelah menentukan tanggal check-in dan check-out, tamu menekan tombol reservasi. Tamu akan dipandu untuk mengisi formulir informasi tamu berupa nama lengkap dan alamat email aktif guna pengiriman e-voucher."
  );

  if (isVisual) {
    await doc.drawImage(
      path.join(projectRoot, "designs/screenshots-desktop/booking.png"),
      "Gambar 2.2: Tampilan Formulir Data Pemesan Reservasi Kamar",
      0.85
    );
  }

  doc.drawHeading("3. Pembayaran Instan & Penerimaan Voucher", 3);
  doc.drawParagraph(
    "Sistem akan menampilkan pop-up pembayaran Midtrans Snap. Tamu dapat memilih metode pembayaran instan seperti transfer bank Virtual Account (VA), kartu kredit, atau dompet digital (Gopay/ShopeePay). Setelah pembayaran selesai dilakukan, sistem mendeteksi transaksi secara otomatis dalam hitungan detik. Halaman web tamu akan langsung berubah sukses, dan e-voucher PDF resmi yang dilengkapi QR Code unik akan langsung dikirimkan ke alamat email tamu serta tersedia untuk diunduh di dashboard profil."
  );

  doc.drawSeparator();

  // BAB III
  doc.drawHeading("Bab III: Panduan Penggunaan untuk Tamu (Guest)", 1);
  
  doc.drawHeading("1. Membuat Akun dan Masuk (Login)", 3);
  doc.drawListItem("Pendaftaran: Klik tombol 'Daftar' di navigasi atas. Masukkan nama depan, nama belakang, email, dan kata sandi Anda, lalu klik submit.");
  doc.drawListItem("Masuk: Klik tombol 'Masuk' di navigasi atas. Masukkan email dan kata sandi terdaftar Anda, atau gunakan opsi login cepat menggunakan akun Google.");

  if (isVisual) {
    await doc.drawImage(
      path.join(projectRoot, "designs/screenshots-desktop/login.png"),
      "Gambar 3.1: Halaman Masuk Akun Pengguna",
      0.85
    );
  }

  doc.drawHeading("2. Mengamankan Akun dengan Otentikasi 2-Faktor (2FA)", 3);
  doc.drawListItem("Setelah masuk, klik ikon profil Anda di navigasi atas dan pilih menu 'Profil'.");
  doc.drawListItem("Pada bagian 'Two-factor authentication', klik tombol 'Enable 2FA' (Aktifkan 2FA).");
  doc.drawListItem("Gunakan ponsel Anda untuk memindai QR Code yang muncul di layar menggunakan aplikasi authenticator (seperti Google Authenticator atau Authy).");
  doc.drawListItem("Masukkan 6 digit kode OTP yang tampil di aplikasi authenticator Anda ke dalam kotak konfirmasi di website, lalu klik verifikasi. Setelah aktif, setiap login berikutnya akan memerlukan kode OTP ini demi mencegah akses ilegal.");

  doc.drawHeading("3. Proses Reservasi Kamar", 3);
  doc.drawListItem("Pilih kamar di halaman utama hotel, lalu tentukan tanggal check-in dan check-out menggunakan kalender pemilih tanggal.");
  doc.drawListItem("Klik 'Pesan Sekarang' dan lengkapi formulir tamu.");
  doc.drawListItem("Selesaikan pembayaran pada jendela Midtrans Snap yang muncul sebelum batas waktu pembayaran kedaluwarsa (1 jam).");

  doc.drawHeading("4. Dashboard Tamu & Unduh Tiket E-Voucher", 3);
  doc.drawListItem("Akses riwayat reservasi Anda dengan masuk ke halaman Profil.");
  doc.drawListItem("Jika transaksi sukses, status pesanan akan tertulis 'PAID' (Terbayar).");
  doc.drawListItem("Klik tombol 'Unduh Tiket' di sebelah detail reservasi Anda. Berkas voucher PDF resmi akan diunduh secara otomatis. Bawa dan tunjukkan voucher ini (baik versi cetak maupun di layar ponsel) kepada resepsionis saat check-in.");

  if (isVisual) {
    await doc.drawImage(
      path.join(projectRoot, "designs/screenshots-desktop/dashboard-full.png"),
      "Gambar 3.2: Tampilan Riwayat Pemesanan Kamar Tamu",
      0.85
    );
  }

  doc.drawSeparator();

  // BAB IV
  doc.drawHeading("Bab IV: Panduan Operasional untuk Staf Resepsionis", 1);
  doc.drawParagraph(
    "Portal staf resepsionis dapat diakses di rute /receptionist (hanya terbuka untuk pengguna dengan peran staff atau admin). Halaman ini digunakan untuk memantau status operasional harian kamar hotel."
  );

  doc.drawHeading("1. Memantau Papan Unit Kamar", 3);
  doc.drawListItem("Papan Unit Kamar menampilkan visualisasi baris kamar hotel fisik yang dikelompokkan berdasarkan nomor kamar dan lantai.");
  doc.drawListItem("Setiap kotak unit menampilkan tipe kamar, nama tamu yang sedang/akan menginap, tanggal check-in/out, catatan khusus, dan warna status kamar.");

  doc.drawHeading("2. Memproses Tamu Datang (Check-In)", 3);
  doc.drawListItem("Saat tamu tiba membawa e-voucher reservasi, resepsionis mencari nomor kamar atau nama tamu pada papan unit.");
  doc.drawListItem("Klik menu pilihan status pada kamar terkait, lalu ubah status dari 'AVAILABLE' (Kosong) atau 'RESERVED' (Dipesan) menjadi 'OCCUPIED' (Terisi).");
  doc.drawListItem("Tuliskan catatan penting jika diperlukan, seperti 'Tamu meminta kunci ekstra' atau 'Alergi makanan dicatat'.");

  doc.drawHeading("3. Memproses Tamu Keluar (Check-Out) & Pembersihan", 3);
  doc.drawListItem("Saat tamu check-out, ubah status kamar dari 'OCCUPIED' menjadi 'CLEANING' (Dibersihkan). Ini memberi tahu staf kebersihan untuk segera merapikan kamar.");
  doc.drawListItem("Setelah kamar bersih dan rapi, ubah kembali status kamar menjadi 'AVAILABLE' agar siap dihuni tamu berikutnya.");
  doc.drawListItem("Jika ada fasilitas kamar yang rusak dan membutuhkan perbaikan, ubah status menjadi 'MAINTENANCE' (Perbaikan) untuk sementara waktu agar kamar tersebut tidak dapat dipesan oleh tamu baru di sistem.");

  doc.drawSeparator();

  // BAB V
  doc.drawHeading("Bab V: Panduan Pengelolaan untuk Administrator (Admin)", 1);
  doc.drawParagraph(
    "Portal administrasi utama terletak di rute /admin. Administrator memiliki akses penuh untuk mengonfigurasi website dan melihat laporan keuangan secara real-time."
  );

  if (isVisual) {
    await doc.drawImage(
      path.join(projectRoot, "designs/screenshots-desktop/admin-full.png"),
      "Gambar 5.1: Dashboard Utama Administrator",
      0.85
    );
  }

  doc.drawHeading("1. Statistik Dashboard", 3);
  doc.drawListItem("Melihat total pemesanan kamar harian.");
  doc.drawListItem("Melihat total pendapatan kotor (Gross Booking Value) dan pendapatan riil yang sudah dibayar (Realized Revenue).");
  doc.drawListItem("Melihat grafik distribusi status pesanan untuk memantau aktivitas transaksi.");

  doc.drawHeading("2. Pengelolaan Katalog Kamar (Room Management)", 3);
  doc.drawListItem("Menambah Kamar Baru: Klik tombol tambah, isi nama kamar, kapasitas maksimum, deskripsi, harga dasar per malam, dan unggah foto ruangan.");
  doc.drawListItem("Mengubah Kamar: Klik 'Edit' pada tipe kamar terkait untuk mengubah harga, deskripsi, atau foto kamar.");
  doc.drawListItem("Menghapus Kamar: Klik 'Archive' (Arsipkan) untuk menyembunyikan tipe kamar dari katalog halaman depan tamu.");

  doc.drawHeading("3. Tarif Kamar Dinamis (Room Rate Management)", 3);
  doc.drawListItem("Admin dapat menetapkan aturan harga khusus untuk periode tertentu.");
  doc.drawListItem("Misalnya, meningkatkan harga kamar sebesar 20% pada hari libur akhir pekan, atau memberikan potongan harga pada musim sepi pengunjung (low season). Sistem akan menghitung harga secara otomatis berdasarkan tanggal yang dipilih tamu.");

  doc.drawHeading("4. Pengelolaan Fasilitas Hotel (Facility Management)", 3);
  doc.drawListItem("Mengelola daftar fasilitas pelengkap hotel yang tampil di halaman depan website (seperti area kolam renang, pusat kebugaran, restoran rooftop).");
  doc.drawListItem("Admin dapat menambah fasilitas baru dengan mengisi nama, deskripsi singkat, dan menautkan URL gambar ilustrasi.");

  doc.drawHeading("5. Manajemen Peran Pengguna (User Role Management)", 3);
  doc.drawListItem("Melihat daftar pengguna website terdaftar.");
  doc.drawListItem("Mengubah peran (role) pengguna umum menjadi 'receptionist' atau 'admin' untuk memberikan izin akses ke portal staf.");

  doc.drawHeading("6. Riwayat Log Audit & Ekspor Laporan", 3);
  doc.drawListItem("Log Audit: Memantau log aktivitas sistem secara transparan (mencatat siapa staf yang memproses check-in/out, kapan data kamar diubah, dll.) demi keamanan data hotel.");
  doc.drawListItem("Ekspor Laporan: Masuk ke bagian ekspor transaksi, tentukan rentang tanggal laporan, lalu klik 'Export' untuk mengunduh daftar transaksi dalam format CSV (Microsoft Excel) atau laporan visual PDF.");

  // Draw Page Numbers and Save
  const totalPages = doc.pages.length;
  for (let i = 1; i <= totalPages; i++) {
    doc.drawFooter(i, totalPages);
  }

  const pdfBytes = await pdf.save();
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Manual book berhasil disimpan di: ${outputPath}`);
}

async function main() {
  const stepByStepPath = path.join(projectRoot, "manual-book.pdf");
  const visualPath = path.join(projectRoot, "manual-book-visual.pdf");

  try {
    await generateManualBook(false, stepByStepPath);
    await generateManualBook(true, visualPath);
    console.log("Semua manual book berhasil di-generate!");
  } catch (err) {
    console.error("Terjadi kesalahan saat membuat manual book:", err);
    process.exit(1);
  }
}

main();
