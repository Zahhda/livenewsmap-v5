# WebSocket Protocol Specification

## Connection Events

### Client → Server Events

#### `connect`
```typescript
{
  token: string; // JWT authentication token
  clientId: string; // Unique client identifier
  version: string; // Client version for compatibility
}
```

#### `join_conversation`
```typescript
{
  conversationId: string;
  cursor?: string; // Last message cursor for sync
}
```

#### `leave_conversation`
```typescript
{
  conversationId: string;
}
```

#### `send_message`
```typescript
{
  conversationId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'reply' | 'thread';
  clientMessageId: string; // For deduplication
  replyTo?: string;
  threadId?: string;
  attachments?: {
    type: 'image' | 'file' | 'video' | 'audio';
    filename: string;
    url: string;
    size: number;
    mimeType: string;
  }[];
}
```

#### `typing_start`
```typescript
{
  conversationId: string;
}
```

#### `typing_stop`
```typescript
{
  conversationId: string;
}
```

#### `mark_read`
```typescript
{
  conversationId: string;
  messageId: string;
  readAt: string; // ISO date string
}
```

#### `add_reaction`
```typescript
{
  messageId: string;
  emoji: string;
}
```

#### `remove_reaction`
```typescript
{
  messageId: string;
  emoji: string;
}
```

#### `edit_message`
```typescript
{
  messageId: string;
  content: string;
  clientMessageId: string;
}
```

#### `delete_message`
```typescript
{
  messageId: string;
  clientMessageId: string;
}
```

#### `sync_messages`
```typescript
{
  conversationId: string;
  cursor?: string;
  limit?: number; // Default: 50, Max: 100
}
```

### Server → Client Events

#### `connected`
```typescript
{
  userId: string;
  serverTime: string; // ISO date string
  features: string[]; // Available features
}
```

#### `message_received`
```typescript
{
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    type: string;
    sequenceNumber: number;
    replyTo?: string;
    threadId?: string;
    attachments: any[];
    reactions: any[];
    isEdited: boolean;
    editedAt?: string;
    createdAt: string;
  };
  participants: string[]; // User IDs in conversation
}
```

#### `message_ack`
```typescript
{
  clientMessageId: string;
  serverMessageId: string;
  sequenceNumber: number;
  status: 'delivered' | 'failed';
  error?: string;
}
```

#### `typing_start`
```typescript
{
  conversationId: string;
  userId: string;
  username: string;
  timestamp: string;
}
```

#### `typing_stop`
```typescript
{
  conversationId: string;
  userId: string;
  timestamp: string;
}
```

#### `read_receipt`
```typescript
{
  messageId: string;
  userId: string;
  readAt: string;
}
```

#### `reaction_added`
```typescript
{
  messageId: string;
  userId: string;
  emoji: string;
  timestamp: string;
}
```

#### `reaction_removed`
```typescript
{
  messageId: string;
  userId: string;
  emoji: string;
  timestamp: string;
}
```

#### `message_edited`
```typescript
{
  messageId: string;
  content: string;
  editedAt: string;
  editedBy: string;
}
```

#### `message_deleted`
```typescript
{
  messageId: string;
  deletedAt: string;
  deletedBy: string;
}
```

#### `sync_response`
```typescript
{
  conversationId: string;
  messages: any[]; // Array of message objects
  hasMore: boolean;
  nextCursor?: string;
  participants: any[]; // Array of participant objects
}
```

#### `error`
```typescript
{
  code: string;
  message: string;
  details?: any;
}
```

## Error Codes

- `AUTH_REQUIRED`: Authentication token missing or invalid
- `CONVERSATION_NOT_FOUND`: Conversation doesn't exist or user not authorized
- `MESSAGE_NOT_FOUND`: Message doesn't exist or user not authorized
- `PERMISSION_DENIED`: User doesn't have required permissions
- `RATE_LIMITED`: Too many requests, try again later
- `INVALID_PAYLOAD`: Request payload is malformed
- `SERVER_ERROR`: Internal server error
