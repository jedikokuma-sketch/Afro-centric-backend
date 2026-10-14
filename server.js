require('dotenv').config();

const mongoose = require('mongoose');
const app = require('./src/app');

async function startServer() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required to start the API server.');
  }

  await mongoose.connect(mongoUri);

  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });

  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('API server failed to start:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
