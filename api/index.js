// Vercel serverless entrypoint. No listen(), dotenv load, or migrations here.
module.exports = require("../backend/app");
