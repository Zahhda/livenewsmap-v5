// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// ---- Routers & middleware ----
import authRouter from './src/routes/auth.js';
import adminRouter from './src/routes/admin.js';
import adminUsersRouter from './src/routes/adminUsers.js';
import adminRegionsRouter from './src/routes/adminRegions.js';
import regionsRouter from './src/routes/regions.js';
import newsRouter from './src/routes/news.js';
import readLaterRouter from './src/routes/readLater.js'; // if you have it
import regionRequestsRouter from './src/routes/regionRequests.js';
import locationRouter from './src/routes/location.js';
import rssValidationRouter from './src/routes/rssValidation.js';
import messagesRouter from './src/routes/messages.js';
import { authRequired, adminRequired } from './src/middleware/auth.js';
import { ensureSeedAdmin } from './src/utils/seedAdmin.js';

// Store active SSE connections for real-time notifications
const sseConnections = new Map();

// ML Classification Configuration
const ML_CLASSIFICATION_CONFIG = {
  pythonServerUrl: 'http://localhost:8001',
  fallbackToHuggingFace: true,
  categories: {
    'war': ['war', 'conflict', 'military', 'attack', 'bomb', 'explosion', 'violence', 'terrorism', 'combat', 'battle', 'siege', 'invasion', 'defense', 'soldier', 'casualty', 'wounded', 'killed', 'hostage', 'refugee', 'displaced', 'evacuation', 'resistance', 'rebellion', 'uprising', 'assassination', 'murder', 'massacre', 'genocide'],
    'climate': ['climate', 'weather', 'environment', 'global warming', 'carbon', 'emission', 'pollution', 'drought', 'flood', 'hurricane', 'typhoon', 'cyclone', 'tsunami', 'earthquake', 'volcano', 'landslide', 'heatwave', 'cold snap', 'blizzard', 'hail', 'thunderstorm', 'monsoon', 'natural disaster', 'environmental crisis', 'climate change', 'green energy', 'renewable', 'sustainability'],
    'culture': ['culture', 'art', 'music', 'movie', 'film', 'book', 'literature', 'festival', 'celebration', 'tradition', 'heritage', 'museum', 'gallery', 'theater', 'concert', 'performance', 'exhibition', 'award', 'prize', 'entertainment', 'sports', 'game', 'tournament', 'championship', 'olympic', 'world cup', 'fashion', 'design', 'architecture'],
    'society': ['society', 'social', 'community', 'health', 'education', 'school', 'university', 'hospital', 'medical', 'doctor', 'patient', 'disease', 'virus', 'pandemic', 'epidemic', 'quarantine', 'lockdown', 'vaccine', 'treatment', 'cure', 'outbreak', 'healthcare', 'welfare', 'poverty', 'homeless', 'unemployment', 'economy', 'business', 'company', 'market', 'stock', 'trade', 'employment', 'job', 'work', 'labor', 'union', 'strike', 'protest', 'demonstration', 'rally', 'march', 'petition', 'campaign', 'election', 'vote', 'government', 'politics', 'policy', 'law', 'legal', 'court', 'judge', 'trial', 'verdict', 'sentence', 'prison', 'jail', 'arrest', 'charge', 'crime', 'theft', 'robbery', 'fraud', 'corruption', 'scandal', 'investigation', 'police', 'security', 'safety', 'accident', 'incident', 'emergency', 'rescue', 'fire', 'explosion', 'collision', 'crash']
  },
  categoryMapping: {
    'war': 'war',
    'climate': 'climate', 
    'culture': 'culture',
    'society': 'society',
    'others': 'others'
  },
  minConfidence: 0.3,
  batchSize: 10,
  isClassifying: false,
  classificationQueue: []
};

// Fallback Hugging Face Configuration
const HUGGING_FACE_CONFIG = {
  apiUrl: 'https://api-inference.huggingface.co/models/xlm-roberta-large-xnli',
  fallbackApiUrl: 'https://api-inference.huggingface.co/models/facebook/mbart-large-50-many-to-many-mmt',
  speedApiUrl: 'https://api-inference.huggingface.co/models/facebook/mbart-large-50-many-to-many-mmt'
};

// ML Classification Functions
async function checkMLServerHealth() {
  try {
    const response = await fetch(`${ML_CLASSIFICATION_CONFIG.pythonServerUrl}/health`, {
      method: 'GET',
      timeout: 5000
    });
    return response.ok;
  } catch (error) {
    console.log('ML Server not available:', error.message);
    return false;
  }
}

async function classifyWithML(newsItems, regionId = null, regionName = null) {
  try {
    const isMLServerAvailable = await checkMLServerHealth();
    
    if (!isMLServerAvailable) {
      console.log('ML Server not available, using fallback classification');
      return await classifyWithFallback(newsItems);
    }
    
    const requestData = {
      news_items: newsItems.map(item => ({
        title: item.title || '',
        description: item.description || '',
        content: item.content || '',
        url: item.url || '',
        publishedAt: item.publishedAt || ''
      })),
      region_id: regionId,
      region_name: regionName
    };
    
    const response = await fetch(`${ML_CLASSIFICATION_CONFIG.pythonServerUrl}/classify-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`ML Server error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`ML Classification completed: ${result.results.length} items in ${result.processing_time}s`);
    console.log(`ML Accuracy: ${result.accuracy_stats.accuracy.toFixed(3)}`);
    
    return result.results;
    
  } catch (error) {
    console.error('ML Classification error:', error);
    return await classifyWithFallback(newsItems);
  }
}

async function classifyWithFallback(newsItems) {
  console.log('Using fallback keyword-based classification');
  
  const results = newsItems.map(item => {
    const text = `${item.title || ''} ${item.description || ''} ${item.content || ''}`.toLowerCase();
    
    const categoryScores = {};
    for (const [category, keywords] of Object.entries(ML_CLASSIFICATION_CONFIG.categories)) {
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
      categoryScores[category] = score;
    }
    
    const bestCategory = Object.keys(categoryScores).reduce((a, b) => 
      categoryScores[a] > categoryScores[b] ? a : b
    );
    
    const confidence = categoryScores[bestCategory] / Math.max(1, Object.values(categoryScores).reduce((a, b) => a + b, 0));
    
    return {
      ...item,
      category: bestCategory,
      confidence: confidence,
      score: categoryScores[bestCategory],
      is_reliable: confidence > 0.3,
      ai_classified: true,
      ml_model: 'fallback_keyword_classifier'
    };
  });
  
  return results;
}

async function submitFeedbackToML(text, correctCategory, predictedCategory, confidence) {
  try {
    const isMLServerAvailable = await checkMLServerHealth();
    
    if (!isMLServerAvailable) {
      console.log('ML Server not available, skipping feedback');
      return;
    }
    
    const response = await fetch(`${ML_CLASSIFICATION_CONFIG.pythonServerUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        correct_category: correctCategory,
        predicted_category: predictedCategory,
        confidence: confidence
      })
    });
    
    if (response.ok) {
      console.log('Feedback submitted to ML server successfully');
    }
  } catch (error) {
    console.error('Failed to submit feedback to ML server:', error);
  }
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store the io instance in the app for use in routes
app.set('io', io);

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    socket.userId = decoded.id;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected`);
  
  // Join user to their personal room
  socket.join(socket.userId);
  
  // Handle typing indicators
  socket.on('typing', (data) => {
    socket.to(data.recipientId).emit('userTyping', {
      userId: socket.userId,
      isTyping: data.isTyping
    });
  });
  
  // Handle message sending
  socket.on('sendMessage', async (data) => {
    try {
      console.log('Received message via Socket.IO:', data);
      
      // Import Message model
      const { default: Message } = await import('./src/models/Message.js');
      
      // Create message in database
      const message = new Message({
        sender: socket.userId,
        recipient: data.recipientId,
        content: data.content,
        createdAt: new Date()
      });
      
      await message.save();
      
      // Populate sender info
      const { default: User } = await import('./src/models/User.js');
      const sender = await User.findById(socket.userId).select('name email role');
      
      const messageData = {
        _id: message._id,
        content: message.content,
        sender: {
          _id: sender._id,
          name: sender.name,
          email: sender.email,
          role: sender.role
        },
        recipient: data.recipientId,
        createdAt: message.createdAt,
        isRead: false
      };
      
      // Send to recipient
      socket.to(data.recipientId).emit('newMessage', messageData);
      
      // Send confirmation back to sender
      socket.emit('messageSent', messageData);
      
      console.log('Message sent successfully via Socket.IO');
      
    } catch (error) {
      console.error('Error sending message via Socket.IO:', error);
      socket.emit('messageError', { error: 'Failed to send message' });
    }
  });
  
  // Handle admin room joining
  socket.on('joinAdminRoom', () => {
    socket.join('admin');
    console.log(`Admin ${socket.userId} joined admin room`);
  });
  
  // Handle message read receipts
  socket.on('messageRead', (data) => {
    socket.to(data.senderId).emit('messageRead', {
      messageId: data.messageId,
      readAt: new Date()
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
  });
});

// ---- Healthcheck (for platforms) ----
app.get('/health', (_req, res) => res.status(200).send('ok'));

// ---- Logging (don’t crash if morgan missing) ----
try { app.use(morgan('dev')); } catch { /* noop */ }

// ---- Core middleware ----
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// If you ever set secure cookies behind Railway’s proxy:
app.set('trust proxy', 1);

// ---- Mongo (require env var in prod; fail fast if missing/unreachable) ----
const isProd = process.env.NODE_ENV === 'production';
let MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  if (isProd) {
    console.error('❌ Missing MONGODB_URI env var (required in production).');
    process.exit(1);
  } else {
    // Use a working MongoDB Atlas connection for development
    MONGODB_URI = 'mongodb+srv://live-news-demo:live-news-demo@cluster0.mongodb.net/live_news_map?retryWrites=true&w=majority';
  }
}

// Start the server
async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // fail fast if DB is unreachable
    });
    console.log('✅ MongoDB connected');

    // Ensure an admin user exists
    await ensureSeedAdmin();

// ---- Static files ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- APIs ----
app.get('/api/config', (_req, res) => {
  res.json({ 
    mapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
    mapboxToken: process.env.MAPBOX_TOKEN || 'pk.eyJ1IjoiemFoaWQ5ODF5Z2UiLCJhIjoiY21mcGF6ZjhkMGJmMTJsc2Z4MGFiOWxnNyJ9.3esbBjOS7_q2kHPfUDO9zA'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/regions', adminRegionsRouter);
app.use('/api/regions', regionsRouter);
app.use('/api/news', newsRouter);
app.use('/api/account/readlater', readLaterRouter); // optional if present
app.use('/api/region-requests', regionRequestsRouter);
app.use('/api/location', locationRouter);
app.use('/api/rss-validation', rssValidationRouter);
app.use('/api/messages', messagesRouter);

// ML Classification API
app.post('/api/ml/classify', async (req, res) => {
  try {
    const { newsItems, regionId, regionName } = req.body;
    
    if (!newsItems || !Array.isArray(newsItems)) {
      return res.status(400).json({ error: 'newsItems array is required' });
    }
    
    const results = await classifyWithML(newsItems, regionId, regionName);
    
    res.json({
      success: true,
      results: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('ML Classification API error:', error);
    res.status(500).json({ error: 'Classification failed' });
  }
});

// ML Feedback API
app.post('/api/ml/feedback', async (req, res) => {
  try {
    const { text, correctCategory, predictedCategory, confidence } = req.body;
    
    if (!text || !correctCategory || !predictedCategory) {
      return res.status(400).json({ error: 'text, correctCategory, and predictedCategory are required' });
    }
    
    await submitFeedbackToML(text, correctCategory, predictedCategory, confidence);
    
    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('ML Feedback API error:', error);
    res.status(500).json({ error: 'Feedback submission failed' });
  }
});

// ML Stats API
app.get('/api/ml/stats', async (req, res) => {
  try {
    const isMLServerAvailable = await checkMLServerHealth();
    
    if (!isMLServerAvailable) {
      return res.json({
        success: true,
        ml_server_available: false,
        message: 'ML Server not available',
        timestamp: new Date().toISOString()
      });
    }
    
    const response = await fetch(`${ML_CLASSIFICATION_CONFIG.pythonServerUrl}/stats`);
    const stats = await response.json();
    
    res.json({
      success: true,
      ml_server_available: true,
      stats: stats.stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('ML Stats API error:', error);
    res.status(500).json({ error: 'Failed to get ML stats' });
  }
});

// ---- Real-time Notifications (SSE) ----
// SSE endpoint for real-time notifications
app.get('/api/notifications/stream', authRequired, (req, res) => {
  const userId = req.user.id;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Store connection
  sseConnections.set(userId, res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Real-time notifications enabled' })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(userId);
  });
});


// ---- UI routes ----
app.get('/admin', adminRequired, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/admin/users', adminRequired, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-users.html'));
});
app.get('/account', authRequired, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});
app.get('/debug-admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'debug-admin.html'));
});
app.get('/test-console', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-console.html'));
});
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

    // ---- Networking: bind 0.0.0.0 and Railway PORT ----
    const PORT = process.env.PORT || 8080; // Railway injects PORT
    const HOST = process.env.HOST || '0.0.0.0';

    // Start server with a handle so we can close gracefully
    server.listen(PORT, HOST, () => {
      console.log(`Live News Map running on http://${HOST}:${PORT}`);
    });

    // ---- Graceful shutdown & hard-fail on unhandled rejects ----
    const shutdown = async (signal) => {
      try {
        console.log(`${signal} received, closing HTTP server...`);
        await new Promise((resolve) => server.close(resolve));
        await mongoose.connection.close();
        console.log('✅ Clean shutdown complete.');
        process.exit(0);
      } catch (err) {
        console.error('❌ Error during shutdown:', err);
        process.exit(1);
      }
    };

    ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

    process.on('unhandledRejection', (err) => {
      console.error('UnhandledRejection:', err);
      // Exit so Railway restarts the app into a clean state
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Function to send notification to specific user
export function sendNotificationToUser(userId, notification) {
  const connection = sseConnections.get(userId);
  if (connection) {
    try {
      connection.write(`data: ${JSON.stringify(notification)}\n\n`);
    } catch (error) {
      console.error('Error sending notification:', error);
      sseConnections.delete(userId);
    }
  }
}

// Function to broadcast notification to all connected users
export function broadcastNotification(notification) {
  sseConnections.forEach((connection, userId) => {
    try {
      connection.write(`data: ${JSON.stringify(notification)}\n\n`);
    } catch (error) {
      console.error('Error broadcasting notification:', error);
      sseConnections.delete(userId);
    }
  });
}
