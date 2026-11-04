import { supabaseAdmin } from "./supabase.js";

export class StorageService {
  private static initializedBuckets = new Set<string>();

  /**
   * Memastikan bucket Supabase Storage tersedia (dibuat privat jika belum ada)
   */
  static async ensureBucket(bucketName: string, isPublic = false) {
    if (this.initializedBuckets.has(bucketName)) {
      return;
    }

    try {
      const { data: bucket } = await supabaseAdmin.storage.getBucket(bucketName);
      if (!bucket) {
        await supabaseAdmin.storage.createBucket(bucketName, {
          public: isPublic,
          fileSizeLimit: 10 * 1024 * 1024, // 10MB limit
        });
      }
      this.initializedBuckets.add(bucketName);
    } catch (err: any) {
      // Abaikan jika bucket sudah ada
      if (!err.message?.includes("already exists")) {
        console.warn(`⚠️ Warning saat inisialisasi bucket '${bucketName}':`, err.message);
      }
      this.initializedBuckets.add(bucketName);
    }
  }

  /**
   * Mengunggah berkas ke Supabase Storage
   */
  static async uploadFile(
    bucketName: string,
    filePath: string,
    fileBuffer: Buffer,
    contentType: string
  ) {
    await this.ensureBucket(bucketName);

    const { error } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw error;
    }

    return filePath;
  }

  /**
   * Membuat Signed URL sementara (default: 300 detik / 5 menit)
   */
  static async createSignedUrl(
    bucketName: string,
    filePath: string,
    expiresInSeconds = 300
  ): Promise<string | null> {
    await this.ensureBucket(bucketName);

    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUrl(filePath, expiresInSeconds);

    if (error || !data) {
      console.error(`❌ Gagal membuat signed URL untuk '${filePath}':`, error);
      return null;
    }

    return data.signedUrl;
  }
}

