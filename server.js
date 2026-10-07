import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import whatsappRoutes from './routes/whatsapp.js';
import { logger } from './utils/logger.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    body: req.method !== 'GET' ? req.body : undefined,
    query: req.query
  });
  next();
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Bot WhatsApp Libros - Formación Para Todos',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook',
      health: '/health',
      test: '/test'
    }
  });
});

app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development',
    whatsapp: {
      configured: !!process.env.WHATSAPP_API_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configured' : 'missing'
    },
    groq: {
      configured: !!process.env.GROQ_API_KEY
    }
  };
  res.json(health);
});

// ============================================
// ROUTES
// ============================================
app.use('/webhook', whatsappRoutes);

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('\n🚀 ============================================');
  console.log(`   Bot WhatsApp Libros — Formación Para Todos`);
  console.log('   ============================================');
  console.log(`   🌐 Server running on: http://localhost:${PORT}`);
  console.log(`   📱 WhatsApp webhook: http://localhost:${PORT}/webhook`);
  console.log(`   🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`   📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('   ============================================\n');
  
  // Verificar configuración crítica
  if (!process.env.WHATSAPP_API_TOKEN) {
    console.warn('⚠️  WARNING: WHATSAPP_API_TOKEN not configured!');
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  WARNING: GROQ_API_KEY not configured!');
  }
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    logger.info('HTTP server closed');
  });
});

export default app;
