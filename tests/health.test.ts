import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Health Check API", () => {
  it("GET /api/v1/health harus mengembalikan status 200 dan data health check", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.service).toBe("teleheart-backend");
    expect(res.body.data).toHaveProperty("timestamp");
  });

  it("GET route acak harus mengembalikan 404 dengan format error standar", async () => {
    const res = await request(app).get("/api/v1/random-route-yang-tidak-ada");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toContain("tidak ditemukan");
  });

  describe("CORS Configuration Tests", () => {
    it("Mengizinkan preflight OPTIONS dari Flutter dev server (http://localhost:65378)", async () => {
      const res = await request(app)
        .options("/api/v1/auth/login")
        .set("Origin", "http://localhost:65378")
        .set("Access-Control-Request-Method", "POST")
        .set(
          "Access-Control-Request-Headers",
          "Content-Type, Authorization, X-Client-Platform"
        );

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:65378");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
      expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
      expect(res.headers["access-control-allow-headers"]).toContain("X-Client-Platform");
    });

    it("Mengizinkan preflight OPTIONS dari domain staging Netlify", async () => {
      const res = await request(app)
        .options("/api/v1/auth/login")
        .set("Origin", "https://teleheart-frontend.netlify.app")
        .set("Access-Control-Request-Method", "POST")
        .set(
          "Access-Control-Request-Headers",
          "Content-Type, Authorization, X-Client-Platform"
        );

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(
        "https://teleheart-frontend.netlify.app"
      );
    });

    it("Menyematkan header CORS pada request aktual", async () => {
      const res = await request(app)
        .get("/api/v1/health")
        .set("Origin", "http://localhost:65378");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:65378");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });
  });
});

