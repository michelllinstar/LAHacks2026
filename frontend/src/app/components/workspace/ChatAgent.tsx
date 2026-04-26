'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, Minimize2, Maximize2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { findRelevantContext } from '../../../lib/api';
import { useCartographerStore } from '../../../lib/store';
import type { ContextBundle } from '../../../lib/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatAgentProps {
  projectName: string;
  onClose?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export function ChatAgent({ projectName, onClose, isMinimized, onToggleMinimize }: ChatAgentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hi! I'm your AI code assistant for **${projectName}**. I can help you understand the codebase structure, explain class relationships, and guide you through the architecture. What would you like to know?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRepoHash = useCartographerStore((s) => s.activeRepoHash);
  const pushActivity = useCartographerStore((s) => s.pushActivity);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abort any in-flight request when the component unmounts
      abortControllerRef.current?.abort();
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      // Fallback: show a toast indicating the failure
      toast.error('Copy failed — please copy manually');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const query = input;
    setInput('');

    if (!activeRepoHash) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Open a project first to ask Cartographer about it.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      return;
    }

    setIsTyping(true);

    // Abort any previous in-flight request before starting a new one
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const bundle = await findRelevantContext({ task: query, repo_hash: activeRepoHash });

      // Do not update state if the component has unmounted or the request was aborted
      if (!mountedRef.current || controller.signal.aborted) return;

      const content = formatBundle(bundle);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      pushActivity({
        id: crypto.randomUUID(),
        query_type: 'find_relevant_context',
        task: query,
        cluster_id: bundle.region.cluster_id,
        symbol_ids: bundle.relevant_symbols.map((s) => s.qualified_name),
        ts: Date.now(),
      });
    } catch (err) {
      // Ignore abort errors — they are intentional (unmount or new request)
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!mountedRef.current) return;

      toast.error('Cartographer query failed');
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, the query failed.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      if (mountedRef.current) {
        setIsTyping(false);
      }
    }
  };

  const formatBundle = (bundle: ContextBundle): string => {
    const role = bundle.region?.role || 'unknown region';
    const intro = `This task lives in a region whose role is **${role}**.`;

    const topSymbols = bundle.relevant_symbols.slice(0, 5);
    const symbolsBlock = topSymbols.length
      ? '\n\n**Top relevant symbols:**\n' +
        topSymbols
          .map((s) => `- \`${s.qualified_name}\` — ${s.file_path}:${s.line_start}`)
          .join('\n')
      : '\n\n_No relevant symbols were ranked for this query._';

    const notesBlock = bundle.notes && bundle.notes.length
      ? '\n\n' + bundle.notes.map((n) => `_${n}_`).join('\n')
      : '';

    return `${intro}${symbolsBlock}${notesBlock}`;
  };

  return isMinimized ? (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={onToggleMinimize}
        className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all"
      >
        <Bot className="h-5 w-5" />
        <span className="font-medium">AI Assistant</span>
        {messages.length > 1 && (
          <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
            {messages.length - 1}
          </span>
        )}
      </button>
    </div>
  ) : (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--adobe-bg-base)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--adobe-border-default)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: 'var(--adobe-text-primary)' }}>
                AI Code Assistant
              </h3>
              <p className="text-xs" style={{ color: 'var(--adobe-text-tertiary)' }}>
                Powered by AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onToggleMinimize && (
              <button
                onClick={onToggleMinimize}
                className="p-2 hover:bg-[var(--adobe-bg-hover)] rounded-lg transition-colors"
              >
                <Minimize2 className="h-4 w-4" style={{ color: 'var(--adobe-text-tertiary)' }} />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-[var(--adobe-bg-hover)] rounded-lg transition-colors"
              >
                <X className="h-4 w-4" style={{ color: 'var(--adobe-text-tertiary)' }} />
              </button>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          {['Explain architecture', 'Show relationships', 'Suggest improvements'].map(action => (
            <button
              key={action}
              onClick={() => setInput(action)}
              className="px-3 py-1 text-xs rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--adobe-bg-layer-1)',
                color: 'var(--adobe-text-tertiary)',
                border: '1px solid var(--adobe-border-default)',
              }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                  : ''
              }`}
              style={message.role === 'assistant' ? {
                backgroundColor: 'var(--adobe-bg-layer-1)',
                border: '1px solid var(--adobe-border-default)',
              } : {}}
            >
              <div
                className="text-sm whitespace-pre-wrap"
                style={message.role === 'assistant' ? { color: 'var(--adobe-text-secondary)' } : {}}
              >
                {message.content}
              </div>
              <div
                className="text-xs mt-1 opacity-60"
                style={message.role === 'assistant' ? { color: 'var(--adobe-text-quaternary)' } : {}}
              >
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--adobe-bg-layer-2)' }}>
                  <User className="h-4 w-4" style={{ color: 'var(--adobe-text-tertiary)' }} />
                </div>
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: 'var(--adobe-bg-layer-1)',
                border: '1px solid var(--adobe-border-default)',
              }}
            >
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--adobe-border-default)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about the codebase..."
            className="flex-1 px-4 py-2 rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--adobe-bg-input)',
              border: '1px solid var(--adobe-border-default)',
              color: 'var(--adobe-text-primary)',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs mt-2" style={{ color: 'var(--adobe-text-quaternary)' }}>
          <Sparkles className="h-3 w-3 inline mr-1" />
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
