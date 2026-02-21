require('dotenv').config();
const app = require('./app');
const { initDatabase } = require('./db');
const { startKeepAlive } = require('./services/ai');

const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    startKeepAlive();
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

