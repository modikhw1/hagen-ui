import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const geminiKey = process.env['REPLIT_AI_INTEGRATIONS_API_KEY']
    ? 'REPLIT_AI_INTEGRATIONS_API_KEY'
    : process.env['GEMINI_API_KEY']
    ? 'GEMINI_API_KEY'
    : null;
  if (geminiKey) {
    logger.info({ key: geminiKey, model: 'gemini-2.5-flash' }, 'Gemini integration active');
  } else {
    logger.warn('No Gemini API key found — game-plan/generate will use fallback');
  }
});
