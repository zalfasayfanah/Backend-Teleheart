import app from "./app.js";
import { env } from "./config/env.js";

const PORT = env.PORT || 8888;

app.listen(PORT, () => {
  console.log(`🚀 TeleHeart Backend berjalan di http://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/v1/health`);
});

