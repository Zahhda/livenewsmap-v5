import React, { useEffect, useRef } from 'react';
import { Message } from '../types/messaging';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  onMarkAsRead: (messageId: string) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  onReplyTo: (message: Message) => void;
  typingUsers: string[];
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  onMarkAsRead,
  onAddReaction,
  onRemoveReaction,
  onReplyTo,
  typingUsers
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read when they come into view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute('data-message-id');
            if (messageId) {
              onMarkAsRead(messageId);
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    const messageElements = messagesContainerRef.current?.querySelectorAll('[data-message-id]');
    messageElements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [messages, onMarkAsRead]);

  return (
    <div 
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50 dark:bg-gray-900"
    >
      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showAvatar = !prevMessage || prevMessage.senderId !== message.senderId;
        const showTimestamp = !prevMessage || 
          new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 300000; // 5 minutes

        return (
          <div key={message.id} data-message-id={message.id}>
            {showTimestamp && (
              <div className="flex justify-center my-4">
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
              </div>
            )}
            
            <MessageBubble
              message={message}
              isOwn={message.senderId === currentUserId}
              showAvatar={showAvatar}
              onAddReaction={onAddReaction}
              onRemoveReaction={onRemoveReaction}
              onReplyTo={onReplyTo}
            />
          </div>
        );
      })}
      
      {typingUsers.length > 0 && (
        <TypingIndicator users={typingUsers} />
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};
