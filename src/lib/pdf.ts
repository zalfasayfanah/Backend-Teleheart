import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { env } from "../config/env.js";

export interface PrescriptionPdfData {
  verificationCode: string;
  consultationId: string;
  issuedAt: Date;
  doctor: {
    fullName: string;
    sipNumber?: string | null;
    specialization?: string | null;
  };
  patient: {
    fullName: string;
    gender?: string | null;
    birthDate?: string | null;
  };
  notes?: string | null;
  items: Array<{
    medicineName: string;
    dosage?: string | null;
    instructions?: string | null;
    quantity?: string | null;
    notes?: string | null;
  }>;
}

export class PrescriptionPdfGenerator {
  /**
   * Menghasilkan buffer dokumen PDF resep digital TeleHeart berstandar medis
   */
  static async generatePrescriptionPdf(data: PrescriptionPdfData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    // Ukuran A4 standar (595.28 x 841.89 pt)
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Warna tema TeleHeart (Medical Maroon & Dark Navy)
    const primaryColor = rgb(0.78, 0.1, 0.15); // #c61a26
    const darkColor = rgb(0.12, 0.16, 0.22);
    const mutedColor = rgb(0.45, 0.5, 0.58);
    const lightBgColor = rgb(0.96, 0.97, 0.98);
    const borderColor = rgb(0.85, 0.88, 0.92);

    let currentY = height - 50;

    // --- KOP RESMI SURAT RESEP DOKTER ---
    page.drawText("TELEHEART MEDICAL CENTER", {
      x: 50,
      y: currentY,
      size: 16,
      font: fontBold,
      color: primaryColor,
    });
    currentY -= 15;

    page.drawText("Layanan Telehealth Kardiovaskular & Spesialis Jantung Terpadu", {
      x: 50,
      y: currentY,
      size: 9,
      font: fontRegular,
      color: darkColor,
    });
    currentY -= 12;

    page.drawText("Izin Operasional Fasilitas Pelayanan Kesehatan No. 445/098/SIP-KLINIK/2026", {
      x: 50,
      y: currentY,
      size: 8,
      font: fontRegular,
      color: mutedColor,
    });
    currentY -= 15;

    // Garis Pemisah Kop (Garis ganda)
    page.drawLine({
      start: { x: 50, y: currentY },
      end: { x: width - 50, y: currentY },
      thickness: 1.5,
      color: primaryColor,
    });
    page.drawLine({
      start: { x: 50, y: currentY - 2 },
      end: { x: width - 50, y: currentY - 2 },
      thickness: 0.5,
      color: darkColor,
    });
    currentY -= 25;

    // Judul Dokumen
    page.drawText("SURAT RESEP ELEKTRONIK (E-PRESCRIPTION)", {
      x: 50,
      y: currentY,
      size: 12,
      font: fontBold,
      color: darkColor,
    });
    currentY -= 20;

    // Kotak Info Resep (2 Kolom: Dokter & Pasien)
    const boxHeight = 75;
    page.drawRectangle({
      x: 50,
      y: currentY - boxHeight,
      width: width - 100,
      height: boxHeight,
      color: lightBgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });

    // Kolom Kiri: Data Dokter
    const col1X = 65;
    let boxY = currentY - 18;
    page.drawText("DOKTER PENANGGUNG JAWAB:", {
      x: col1X,
      y: boxY,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });
    boxY -= 12;
    page.drawText(data.doctor.fullName, {
      x: col1X,
      y: boxY,
      size: 9,
      font: fontBold,
      color: darkColor,
    });
    boxY -= 12;
    page.drawText(`SIP: ${data.doctor.sipNumber || "-"}`, {
      x: col1X,
      y: boxY,
      size: 8,
      font: fontRegular,
      color: darkColor,
    });
    boxY -= 11;
    page.drawText(`Spesialis: ${data.doctor.specialization || "Kardiologi"}`, {
      x: col1X,
      y: boxY,
      size: 8,
      font: fontRegular,
      color: mutedColor,
    });

    // Kolom Kanan: Data Pasien & Resep
    const col2X = 320;
    boxY = currentY - 18;
    page.drawText("DATA PASIEN & RESEP:", {
      x: col2X,
      y: boxY,
      size: 8,
      font: fontBold,
      color: primaryColor,
    });
    boxY -= 12;
    page.drawText(`Pasien: ${data.patient.fullName}`, {
      x: col2X,
      y: boxY,
      size: 9,
      font: fontBold,
      color: darkColor,
    });
    boxY -= 12;
    const dateStr = data.issuedAt.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    page.drawText(`No. Resep: ${data.verificationCode}`, {
      x: col2X,
      y: boxY,
      size: 8,
      font: fontRegular,
      color: darkColor,
    });
    boxY -= 11;
    page.drawText(`Tgl Terbit: ${dateStr}`, {
      x: col2X,
      y: boxY,
      size: 8,
      font: fontRegular,
      color: mutedColor,
    });

    currentY -= boxHeight + 25;

    // --- DAFTAR OBAT (R/) ---
    page.drawText("R / (Resep Obat)", {
      x: 50,
      y: currentY,
      size: 11,
      font: fontBold,
      color: primaryColor,
    });
    currentY -= 15;

    // Header Tabel
    const tableHeaderY = currentY;
    page.drawRectangle({
      x: 50,
      y: tableHeaderY - 18,
      width: width - 100,
      height: 18,
      color: rgb(0.9, 0.93, 0.96),
    });

    page.drawText("No.", { x: 55, y: tableHeaderY - 13, size: 8, font: fontBold, color: darkColor });
    page.drawText("Nama Obat & Bentuk Sediaan", { x: 80, y: tableHeaderY - 13, size: 8, font: fontBold, color: darkColor });
    page.drawText("Dosis", { x: 250, y: tableHeaderY - 13, size: 8, font: fontBold, color: darkColor });
    page.drawText("Aturan Pakai (Signa)", { x: 330, y: tableHeaderY - 13, size: 8, font: fontBold, color: darkColor });
    page.drawText("Jumlah", { x: 490, y: tableHeaderY - 13, size: 8, font: fontBold, color: darkColor });

    currentY = tableHeaderY - 25;

    // Baris Obat
    data.items.forEach((item, index) => {
      const itemRowY = currentY;
      const numStr = `${index + 1}.`;

      page.drawText(numStr, { x: 55, y: itemRowY, size: 8, font: fontRegular, color: darkColor });
      page.drawText(item.medicineName, { x: 80, y: itemRowY, size: 9, font: fontBold, color: darkColor });
      page.drawText(item.dosage || "-", { x: 250, y: itemRowY, size: 8, font: fontRegular, color: darkColor });
      page.drawText(item.instructions || "-", { x: 330, y: itemRowY, size: 8, font: fontRegular, color: darkColor });
      page.drawText(item.quantity || "1", { x: 490, y: itemRowY, size: 8, font: fontBold, color: darkColor });

      currentY -= 14;

      if (item.notes) {
        page.drawText(`Catatan: ${item.notes}`, {
          x: 80,
          y: currentY,
          size: 7.5,
          font: fontItalic,
          color: mutedColor,
        });
        currentY -= 12;
      }

      // Garis pemisah baris obat tipis
      page.drawLine({
        start: { x: 50, y: currentY + 4 },
        end: { x: width - 50, y: currentY + 4 },
        thickness: 0.5,
        color: borderColor,
      });
      currentY -= 8;
    });

    currentY -= 10;

    // Catatan Tambahan Dokter (Jika ada)
    if (data.notes) {
      page.drawText("Petunjuk / Catatan Dokter Khusus:", {
        x: 50,
        y: currentY,
        size: 9,
        font: fontBold,
        color: darkColor,
      });
      currentY -= 13;
      page.drawText(data.notes, {
        x: 50,
        y: currentY,
        size: 8.5,
        font: fontItalic,
        color: darkColor,
        maxWidth: width - 100,
      });
      currentY -= 25;
    }

    // --- BAGIAN TANDA TANGAN ELEKTRONIK & QR CODE VALIDASI ---
    const footerY = 160;

    // Buat QR Code URL Verifikasi Publik
    const verifyBaseUrl = env.APP_BASE_URL.replace(/\/+$/, "");
    const verificationUrl = `${verifyBaseUrl}/verify-prescription?code=${encodeURIComponent(data.verificationCode)}`;

    const qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
      type: "png",
      width: 180,
      margin: 1,
      color: {
        dark: "#1e293b",
        light: "#ffffff",
      },
    });

    const qrImage = await pdfDoc.embedPng(qrPngBuffer);
    const qrSize = 75;

    // Render Kotak Verifikasi
    page.drawRectangle({
      x: 50,
      y: footerY - 50,
      width: width - 100,
      height: 90,
      color: lightBgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });

    // Gambar QR Code di sisi kiri kotak
    page.drawImage(qrImage, {
      x: 60,
      y: footerY - 42,
      width: qrSize,
      height: qrSize,
    });

    // Keterangan Keaslian & Verifikasi di sebelah QR
    const textDescX = 148;
    page.drawText("VERIFIKASI DIGITAL & KEASLIAN RESEP", {
      x: textDescX,
      y: footerY + 22,
      size: 9,
      font: fontBold,
      color: primaryColor,
    });

    page.drawText("Dokumen ini diterbitkan resmi melalui sistem TeleHeart dan dilindungi secara elektronik.", {
      x: textDescX,
      y: footerY + 9,
      size: 7.5,
      font: fontRegular,
      color: darkColor,
    });

    page.drawText("Pindai QR Code di samping atau kunjungi tautan verifikasi publik untuk memastikan", {
      x: textDescX,
      y: footerY - 2,
      size: 7.5,
      font: fontRegular,
      color: darkColor,
    });

    page.drawText(`Kode Verifikasi: ${data.verificationCode}`, {
      x: textDescX,
      y: footerY - 14,
      size: 8,
      font: fontBold,
      color: darkColor,
    });

    page.drawText(`Dokter: ${data.doctor.fullName} (SIP: ${data.doctor.sipNumber || "-"})`, {
      x: textDescX,
      y: footerY - 26,
      size: 7.5,
      font: fontRegular,
      color: mutedColor,
    });

    page.drawText("Resep ini sah dan dapat ditebus di seluruh apotek mitra resmi yang terdaftar.", {
      x: textDescX,
      y: footerY - 37,
      size: 7,
      font: fontItalic,
      color: mutedColor,
    });

    // Watermark / Footer paling bawah
    page.drawText(`Generated automatically by TeleHeart Platform • Consultation ID: ${data.consultationId}`, {
      x: 50,
      y: 25,
      size: 7,
      font: fontRegular,
      color: mutedColor,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
