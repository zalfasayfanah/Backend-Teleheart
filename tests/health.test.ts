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
});

