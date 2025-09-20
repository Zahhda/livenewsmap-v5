import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { MessagingSocketServer } from '../server/socketServer';
import jwt from 'jsonwebtoken';

describe('Socket.IO Messaging Server', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let server: MessagingSocketServer;

  beforeAll((done) => {
    httpServer = createServer();
    server = new MessagingSocketServer(httpServer);
    io = server.getIO();
    
    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`, {
        auth: {
          token: jwt.sign({ userId: 'test-user-id' }, 'test-secret')
        }
      });
      
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  describe('Connection', () => {
    test('should connect with valid token', (done) => {
      clientSocket.on('connected', (data) => {
        expect(data.userId).toBe('test-user-id');
        expect(data.features).toContain('typing');
        done();
      });
    });

    test('should reject connection with invalid token', (done) => {
      const invalidClient = Client('http://localhost:3000', {
        auth: { token: 'invalid-token' }
      });

      invalidClient.on('connect_error', (error) => {
        expect(error.message).toBe('AUTH_REQUIRED');
        invalidClient.close();
        done();
      });
    });
  });

  describe('Message Handling', () => {
    test('should send message and receive acknowledgment', (done) => {
      const messageData = {
        conversationId: 'test-conversation',
        content: 'Hello, world!',
        type: 'text',
        clientMessageId: 'client-123'
      };

      clientSocket.emit('send_message', messageData);

      clientSocket.on('message_ack', (data) => {
        expect(data.clientMessageId).toBe('client-123');
        expect(data.status).toBe('delivered');
        done();
      });
    });

    test('should broadcast message to other clients', (done) => {
      const secondClient = Client('http://localhost:3000', {
        auth: {
          token: jwt.sign({ userId: 'test-user-2' }, 'test-secret')
        }
      });

      secondClient.on('message_received', (data) => {
        expect(data.message.content).toBe('Hello, world!');
        secondClient.close();
        done();
      });

      // Join same conversation
      clientSocket.emit('join_conversation', { conversationId: 'test-conversation' });
      secondClient.emit('join_conversation', { conversationId: 'test-conversation' });

      // Send message
      clientSocket.emit('send_message', {
        conversationId: 'test-conversation',
        content: 'Hello, world!',
        type: 'text',
        clientMessageId: 'client-456'
      });
    });
  });

  describe('Typing Indicators', () => {
    test('should broadcast typing start', (done) => {
      const secondClient = Client('http://localhost:3000', {
        auth: {
          token: jwt.sign({ userId: 'test-user-2' }, 'test-secret')
        }
      });

      secondClient.on('typing_start', (data) => {
        expect(data.userId).toBe('test-user-id');
        expect(data.conversationId).toBe('test-conversation');
        secondClient.close();
        done();
      });

      secondClient.emit('join_conversation', { conversationId: 'test-conversation' });
      clientSocket.emit('typing_start', { conversationId: 'test-conversation' });
    });
  });
});
