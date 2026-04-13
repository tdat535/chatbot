require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const { initSchema } = require('./db');
const webhookRoutes = require('./routes/webhooks');
const conversationRoutes = require('./routes/conversations');
const customerRoutes = require('./routes/customers');
const templateRoutes = require('./routes/templates');
const statsRoutes = require('./routes/stats');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const broadcastRoutes = require('./routes/broadcast');
const { handleIncomingMessage } = require('./services/autoReply');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, thử lại sau.' },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120, // Facebook/Zalo có thể gửi batch nhiều event
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần đăng nhập, thử lại sau 15 phút.' },
});

app.set('io', io);
app.use(cors());
app.use('/webhook/facebook', bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'CRM Mini API Docs',
  customCss: '.swagger-ui .topbar { background: #0f172a; } .swagger-ui .topbar-wrapper img { display: none; } .swagger-ui .topbar-wrapper::before { content: "CRM Mini API"; color: white; font-size: 18px; font-weight: 700; }',
}));

app.use('/webhook', webhookLimiter, webhookRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/conversations', apiLimiter, conversationRoutes);
app.use('/api/customers', apiLimiter, customerRoutes);
app.use('/api/templates', apiLimiter, templateRoutes);
app.use('/api/stats', apiLimiter, statsRoutes);
app.use('/api/broadcast', apiLimiter, broadcastRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok', db: 'mysql' }));

// Socket.io - Website chat
const websiteSessions = new Map();

io.on('connection', (socket) => {
  socket.on('website_join', ({ sessionId }) => {
    socket.sessionId = sessionId;
    websiteSessions.set(sessionId, socket.id);
  });

  socket.on('website_message', async ({ sessionId, senderName, message }) => {
    if (!message || !sessionId) return;
    const result = await handleIncomingMessage(
      { channel: 'website', channelUserId: sessionId, senderName, message },
      io
    );
    if (result.replyMsg) {
      const targetSocketId = websiteSessions.get(sessionId);
      if (targetSocketId) {
        const msg = result.replyMsg;
        let text = msg.content;
        if (msg.type === 'flow') {
          try { text = JSON.parse(msg.content).text || text; } catch {}
        }
        io.to(targetSocketId).emit('website_reply', { sessionId, message: text });
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.sessionId) websiteSessions.delete(socket.sessionId);
  });
});

const PORT = process.env.PORT || 3001;

// Khởi động: init DB schema trước rồi mới listen
initSchema().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 CRM Mini Backend: http://localhost:${PORT}`);
    console.log(`🗄️  MySQL: ${process.env.DB_HOST}:${process.env.DB_PORT} / ${process.env.DB_NAME}`);
    console.log(`💬 Chatbot: ${process.env.CHATBOT_URL}`);
    console.log(`🤖 Auto-reply: ${process.env.AUTO_REPLY_ENABLED !== 'false' ? 'BẬT' : 'TẮT'}\n`);
  });
}).catch(err => {
  console.error('❌ Lỗi kết nối MySQL:', err.message);
  console.error('👉 Kiểm tra lại DB_HOST, DB_USER, DB_PASSWORD, DB_NAME trong file .env');
  process.exit(1);
});
