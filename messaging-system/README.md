# Production Messaging System

A scalable, real-time messaging system built with Next.js, Node.js, Socket.IO, MongoDB, and Redis.

## 🏗️ Architecture

- **Frontend**: Next.js 14 with TypeScript
- **Backend**: Node.js with Express and Socket.IO
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis for session storage and pub/sub
- **Storage**: AWS S3 for file attachments
- **Queue**: Bull for background job processing

## 🚀 Features

- Real-time messaging with Socket.IO
- Message delivery guarantees and deduplication
- Typing indicators and presence
- Message reactions and threads
- File attachments with virus scanning
- Read receipts and message status
- Optimistic UI updates
- Client reconnection and sync
- Horizontal scaling with Redis adapter
- JWT authentication with refresh tokens

## 📋 Prerequisites

- Node.js 18+
- Docker and Docker Compose
- MongoDB 7.0+
- Redis 7.0+
- AWS S3 bucket (for file storage)

## 🛠️ Local Development

### 1. Clone and Setup

```bash
git clone <repository-url>
cd messaging-system
```

### 2. Environment Variables

Create environment files:

**Backend (.env)**
```env
NODE_ENV=development
PORT=8080
MONGODB_URI=mongodb://admin:password123@localhost:27017/messaging?authSource=admin&replicaSet=rs0
REDIS_URL=redis://:redis123@localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-in-production
CLIENT_URL=http://localhost:3000
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-s3-bucket
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:8080
NEXT_PUBLIC_API_URL=http://localhost:8080/api
```

### 3. Start Services

```bash
# Start all services with Docker Compose
docker-compose up -d

# Or start individual services
docker-compose up mongo-primary redis
npm run dev:backend
npm run dev:frontend
```

### 4. Initialize MongoDB

```bash
# Connect to MongoDB and initialize replica set
docker exec -it mongo-primary mongosh
rs.initiate()
```

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- MongoDB: localhost:27017
- Redis: localhost:6379

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:backend
npm run test:frontend
npm run test:integration
```

## 📦 Production Deployment

### 1. Build Images

```bash
docker build -t messaging-backend ./backend
docker build -t messaging-frontend ./frontend
```

### 2. Deploy with Docker Compose

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Environment Configuration

Update production environment variables:
- Use strong JWT secrets
- Configure MongoDB replica set
- Set up Redis cluster
- Configure AWS S3 bucket
- Set up SSL certificates

## 🔧 Configuration

### MongoDB Indexes

The system automatically creates optimized indexes for:
- Message queries by conversation and sequence
- User lookups by email/username
- Participant queries by conversation
- Read receipt lookups

### Redis Configuration

- Session storage for Socket.IO scaling
- Pub/sub for real-time message broadcasting
- Rate limiting and caching

### Socket.IO Scaling

- Redis adapter for multi-server support
- Stateless authentication
- Client reconnection with sync

## 📊 Monitoring

### Metrics to Track

- Message delivery rate
- Connection count and stability
- Database query performance
- Redis memory usage
- Socket.IO event throughput
- Error rates and types

### Health Checks

- `/health` - Basic health check
- `/health/detailed` - Detailed system status
- `/metrics` - Prometheus metrics

## 🚦 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### Conversations
- `GET /api/conversations` - List user conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id/messages` - Get conversation messages

### Messages
- `POST /api/messages` - Send message
- `PUT /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/reactions` - Add reaction

## 🔒 Security

- JWT authentication with refresh tokens
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS configuration
- Helmet.js security headers
- File upload virus scanning

## 📈 Performance

### Optimizations

- Message pagination with cursors
- Optimistic UI updates
- Connection pooling
- Database query optimization
- Redis caching
- CDN for static assets

### Scaling

- Horizontal scaling with load balancer
- Database read replicas
- Redis cluster
- CDN for file storage

## 🛠️ Development

### Code Style

- ESLint + Prettier for code formatting
- TypeScript strict mode
- Husky for pre-commit hooks
- Conventional commits

### Project Structure

```
messaging-system/
├── backend/           # Node.js backend
│   ├── src/
│   │   ├── models/    # Mongoose schemas
│   │   ├── server/    # Socket.IO server
│   │   ├── routes/    # Express routes
│   │   └── worker/    # Background workers
│   └── tests/         # Backend tests
├── frontend/          # Next.js frontend
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/     # Custom hooks
│   │   └── pages/     # Next.js pages
│   └── tests/         # Frontend tests
└── docker-compose.yml # Local development
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- Documentation: [Link to docs]
- Issues: [GitHub Issues]
- Discussions: [GitHub Discussions]
