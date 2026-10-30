require('dotenv').config();
const http = require('http');

const app = require('./app');
const initDb = require('./config/initDb');
const realtime = require('./realtime');

initDb();

// Servidor HTTP compartido por la API y los WebSockets (tiempo real)
const server = http.createServer(app);
realtime.init(server);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
