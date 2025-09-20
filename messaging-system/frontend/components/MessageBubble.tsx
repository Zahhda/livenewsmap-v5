import React, { useState } from 'react';
import { Message } from '../types/messaging';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  onReplyTo: (message: Message) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar,
  onAddReaction,
  onRemoveReaction,
  onReplyTo
}) => {
  const [showReactions, setShowReactions] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleReactionClick = (emoji: string) => {
    const existingReaction = message.reactions?.find(
      r => r.userId === 'current_user' && r.emoji === emoji
    );

    if (existingReaction) {
      onRemoveReaction(message.id, emoji);
    } else {
      onAddReaction(message.id, emoji);
    }
  };

  const getReactionCount = (emoji: string) => {
    return message.reactions?.filter(r => r.emoji === emoji).length || 0;
  };

  const getUniqueReactions = () => {
    const emojiCounts = new Map<string, number>();
    message.reactions?.forEach(r => {
      emojiCounts.set(r.emoji, (emojiCounts.get(r.emoji) || 0) + 1);
    });
    return Array.from(emojiCounts.entries());
  };

  return (
    <div 
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`flex ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end space-x-2 max-w-xs lg:max-w-md`}>
        {/* Avatar */}
        {showAvatar && !isOwn && (
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
            {message.senderId.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Message content */}
        <div className={`relative ${isOwn ? 'ml-12' : 'mr-12'}`}>
          {/* Reply indicator */}
          {message.replyTo && (
            <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg border-l-4 border-blue-500">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Replying to message
              </div>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={`
              px-4 py-2 rounded-2xl shadow-sm
              ${isOwn 
                ? 'bg-blue-500 text-white rounded-br-md' 
                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md border border-gray-200 dark:border-gray-700'
              }
            `}
          >
            <div className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </div>

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-2">
                {message.attachments.map((attachment, index) => (
                  <div key={index} className="rounded-lg overflow-hidden">
                    {attachment.type === 'image' ? (
                      <img
                        src={attachment.url}
                        alt={attachment.originalName}
                        className="max-w-full h-auto rounded-lg"
                      />
                    ) : (
                      <div className="flex items-center space-x-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <div className="text-2xl">📎</div>
                        <div>
                          <div className="text-sm font-medium">{attachment.originalName}</div>
                          <div className="text-xs text-gray-500">
                            {(attachment.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <div className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
              {new Date(message.createdAt).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
              {message.isEdited && (
                <span className="ml-1 italic">(edited)</span>
              )}
            </div>
          </div>

          {/* Reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {getUniqueReactions().map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => handleReactionClick(emoji)}
                  className={`
                    px-2 py-1 rounded-full text-xs border transition-colors
                    ${message.reactions?.some(r => r.userId === 'current_user' && r.emoji === emoji)
                      ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
                      : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {emoji} {count}
                </button>
              ))}
            </div>
          )}

          {/* Action buttons (appear on hover) */}
          {hovered && (
            <div className="absolute -top-8 left-0 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="p-1 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                title="Add reaction"
              >
                😊
              </button>
              <button
                onClick={() => onReplyTo(message)}
                className="p-1 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                title="Reply"
              >
                ↩️
              </button>
            </div>
          )}

          {/* Reaction picker */}
          {showReactions && (
            <div className="absolute -top-12 left-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 flex space-x-1">
              {['👍', '❤️', '😂', '😮', '😢', '😡'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    handleReactionClick(emoji);
                    setShowReactions(false);
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
