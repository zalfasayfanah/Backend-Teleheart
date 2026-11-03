import { ConsultationTimeoutJob } from "../../src/jobs/consultationTimeoutJob.js";
import { env } from "../../src/config/env.js";

/**
 * Netlify Function untuk memproses scheduled job secara otomatis
 * Dapat dipicu secara berkala (cron) atau dipanggil manual dengan header x-jobs-secret
 */
export const handler = async (event: any) => {
  // Verifikasi secret jika dipanggil melalui HTTP eksternal
  const expectedSecret = env.JOBS_SECRET;
  const providedSecret =
    event.headers["x-jobs-secret"] ||
    event.queryStringParameters?.secret ||
    event.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Unauthorized jobs secret" }),
    };
  }

  try {
    const summary = await ConsultationTimeoutJob.runAll();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "success", data: summary }),
    };
  } catch (err: any) {
    console.error("❌ Kesalahan eksekusi jobs-tick:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
