import serverless from "serverless-http";
import app from "../../src/app.js";

// Bungkus Express app untuk Netlify Functions
export const handler = serverless(app);

