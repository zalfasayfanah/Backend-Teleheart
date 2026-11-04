import crypto from "crypto";
import { supabaseAdmin } from "../../lib/supabase.js";
import { AppError } from "../../middleware/errorHandler.js";
import { StorageService } from "../../lib/storage.js";
import { FcmService } from "../../lib/fcm.js";
import { GetMessagesQueryInput } from "./schema.js";

const ATTACHMENT_BUCKET = "chat-attachments";

export class ChatService {
  /**
   * Validasi otorisasi peserta konsultasi (Hanya pasien & dokter terkait)
   */
  static async validateAccess(consultationId: string, userId: string, requireActive = false) {
    const { data: consultation, error } = await supabaseAdmin
      .from("consultations")
      .select("id, patient_id, doctor_id, status")
      .eq("id", consultationId)
      .maybeSingle();

    if (error || !consultation) {
      throw new AppError(404, "NOT_FOUND", "Konsultasi tidak ditemukan");
    }

    // Hanya pasien dan dokter penanggung jawab yang boleh mengakses chat (Admin dilarang PRD)
    const isParticipant =
      consultation.patient_id === userId || consultation.doctor_id === userId;

    if (!isParticipant) {
      throw new AppError(403, "FORBIDDEN", "Anda tidak memiliki akses ke ruang konsultasi ini");
    }

    if (requireActive && consultation.status !== "active") {
      throw new AppError(
        400,
        "SESSION_NOT_ACTIVE",
        `Pesan hanya dapat dikirim saat sesi konsultasi aktif (status saat ini: '${consultation.status}')`
      );
    }

    return consultation;
  }

  /**
   * Mengirim Pesan Teks (POST /consultations/:id/messages)
   */
  static async sendTextMessage(consultationId: string, senderId: string, body: string) {
    const consultation = await this.validateAccess(consultationId, senderId, true);

    const { data: message, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        consultation_id: consultationId,
        sender_id: senderId,
        message_type: "text",
        body: body,
      })
      .select()
      .single();

    if (error || !message) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menyimpan pesan chat");
    }

    // Kirim notifikasi in-app ke lawan bicara
    const recipientId =
      consultation.patient_id === senderId ? consultation.doctor_id : consultation.patient_id;

    if (recipientId) {
      const previewText = body.length > 50 ? body.substring(0, 47) + "..." : body;
      await FcmService.sendInAppAndPushNotification({
        userId: recipientId,
        type: "new_chat_message",
        title: "Pesan Baru",
        body: previewText,
        data: { consultation_id: consultationId, message_id: message.id },
      });
    }

    return message;
  }

  /**
   * Mengunggah Gambar Medis (POST /consultations/:id/attachments)
   */
  static async uploadAttachment(
    consultationId: string,
    senderId: string,
    file?: Express.Multer.File
  ) {
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "Berkas gambar (field: file) wajib disertakan");
    }

    const consultation = await this.validateAccess(consultationId, senderId, true);

    // Validasi tipe berkas (hanya JPG, PNG, WEBP)
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedMimes.includes(file.mimetype.toLowerCase())) {
      throw new AppError(
        400,
        "UNSUPPORTED_FILE_TYPE",
        "Format berkas tidak didukung. Harap unggah gambar JPG atau PNG"
      );
    }

    // Validasi ukuran berkas (Maksimal 5 MB)
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new AppError(400, "FILE_TOO_LARGE", "Ukuran berkas melebihi batas maksimal 5 MB");
    }

    // Ekstensi berkas
    const ext = file.mimetype.includes("png")
      ? "png"
      : file.mimetype.includes("webp")
      ? "webp"
      : "jpg";

    const fileName = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const filePath = `${consultationId}/${fileName}`;

    // Unggah ke Supabase Storage
    await StorageService.uploadFile(ATTACHMENT_BUCKET, filePath, file.buffer, file.mimetype);

    // Simpan ke tabel chat_messages
    const { data: message, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        consultation_id: consultationId,
        sender_id: senderId,
        message_type: "image",
        body: null,
        attachment_path: filePath,
        attachment_mime: file.mimetype,
      })
      .select()
      .single();

    if (error || !message) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal menyimpan lampiran gambar chat");
    }

    // Buat Signed URL (berlaku 300 detik)
    const signedUrl = await StorageService.createSignedUrl(ATTACHMENT_BUCKET, filePath, 300);

    // Kirim notifikasi in-app ke lawan bicara
    const recipientId =
      consultation.patient_id === senderId ? consultation.doctor_id : consultation.patient_id;

    if (recipientId) {
      await FcmService.sendInAppAndPushNotification({
        userId: recipientId,
        type: "new_chat_message",
        title: "Pesan Gambar Baru",
        body: "Mengirimkan lampiran gambar medis",
        data: { consultation_id: consultationId, message_id: message.id },
      });
    }

    return {
      ...message,
      attachment_url: signedUrl,
      attachment_url_expires_in: 300,
    };
  }

  /**
   * Mengambil Riwayat Pesan Chat (GET /consultations/:id/messages)
   */
  static async getMessages(consultationId: string, userId: string, query: GetMessagesQueryInput) {
    await this.validateAccess(consultationId, userId, false);

    const limit = query.limit || 50;

    let dbQuery = supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("consultation_id", consultationId);

    if (query.before) {
      const { data: beforeMsg } = await supabaseAdmin
        .from("chat_messages")
        .select("created_at")
        .eq("id", query.before)
        .maybeSingle();

      if (beforeMsg) {
        dbQuery = dbQuery.lt("created_at", beforeMsg.created_at);
      }
    }

    // Ambil pesan terbaru terlebih dahulu untuk pagination, lalu urutkan kronologis (ASC)
    const { data: messages, error } = await dbQuery
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal mengambil riwayat pesan chat");
    }

    const hasMore = (messages?.length || 0) > limit;
    const items = (messages || []).slice(0, limit).reverse(); // Urutan lama -> baru

    // Tambahkan signed URL untuk pesan bergambar
    const formatted = await Promise.all(
      items.map(async (msg) => {
        let attachmentUrl = null;
        if (msg.message_type === "image" && msg.attachment_path) {
          attachmentUrl = await StorageService.createSignedUrl(
            ATTACHMENT_BUCKET,
            msg.attachment_path,
            300
          );
        }

        return {
          id: msg.id,
          consultation_id: msg.consultation_id,
          sender_id: msg.sender_id,
          message_type: msg.message_type,
          body: msg.body,
          attachment_url: attachmentUrl,
          attachment_url_expires_in: attachmentUrl ? 300 : null,
          created_at: msg.created_at,
          read_at: msg.read_at,
        };
      })
    );

    return {
      data: formatted,
      meta: {
        has_more: hasMore,
      },
    };
  }

  /**
   * Menandai Pesan Terbaca (PATCH /consultations/:id/messages/read)
   */
  static async markMessagesRead(
    consultationId: string,
    userId: string,
    upToMessageId?: string
  ) {
    await this.validateAccess(consultationId, userId, false);

    let query = supabaseAdmin
      .from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("consultation_id", consultationId)
      .neq("sender_id", userId) // Hanya tandai pesan lawan bicara
      .is("read_at", null);

    if (upToMessageId) {
      const { data: upToMsg } = await supabaseAdmin
        .from("chat_messages")
        .select("created_at")
        .eq("id", upToMessageId)
        .maybeSingle();

      if (upToMsg) {
        query = query.lte("created_at", upToMsg.created_at);
      }
    }

    const { data: updated, error } = await query.select("id");

    if (error) {
      throw new AppError(500, "DATABASE_ERROR", "Gagal memperbarui status terbaca pesan");
    }

    return {
      marked_count: updated?.length || 0,
    };
  }
}

