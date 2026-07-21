/**
 * Module 7: Live Chat — wired to real conversation & message data.
 * Polls for new messages every 5 seconds so incoming WhatsApp replies appear live.
 * Supports emoji picker and media attachments (image, document, video, audio).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, MessageSquare, MoreVertical,
  Send, Paperclip, Smile, CheckCheck, Loader2, RefreshCw,
  FileText, Image, Film, Music, X, FileImage, Mic,
} from 'lucide-react';
import { toast } from 'sonner';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  status: string;
  windowOpen: boolean;
}

interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaId?: string | null;
  mediaFilename?: string;
  status: string;
  createdAt: string;
}

interface AttachmentFile {
  file: File;
  previewUrl: string | null; // only for images
}

// ── Media renderer ────────────────────────────────────────────────────────────

function MediaBubble({ mediaType, mediaId, filename }: {
  mediaType: string;
  mediaId?: string | null;
  filename?: string;
}) {
  // Build the proxy URL when we have a mediaId; fall back to icon-only when we don't.
  const proxyUrl = mediaId
    ? `${import.meta.env.BASE_URL}api/media/proxy?mediaId=${encodeURIComponent(mediaId)}`
    : null;

  if (mediaType === 'image') {
    return proxyUrl ? (
      <img
        src={proxyUrl}
        alt={filename ?? 'image'}
        className="max-w-[260px] max-h-[260px] rounded-lg object-contain cursor-pointer"
        onClick={() => window.open(proxyUrl, '_blank')}
      />
    ) : (
      <div className="flex items-center gap-2 px-1 py-0.5 text-gray-500">
        <Image className="w-5 h-5 shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename ?? 'image'}</span>
      </div>
    );
  }

  if (mediaType === 'video') {
    return proxyUrl ? (
      <video
        src={proxyUrl}
        controls
        className="max-w-[280px] max-h-[200px] rounded-lg"
      />
    ) : (
      <div className="flex items-center gap-2 px-1 py-0.5 text-gray-500">
        <Film className="w-5 h-5 shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename ?? 'video'}</span>
      </div>
    );
  }

  if (mediaType === 'audio') {
    return proxyUrl ? (
      <audio src={proxyUrl} controls className="max-w-[260px]" />
    ) : (
      <div className="flex items-center gap-2 px-1 py-0.5 text-gray-500">
        <Music className="w-5 h-5 shrink-0" />
        <span className="text-xs truncate max-w-[180px]">{filename ?? 'audio'}</span>
      </div>
    );
  }

  // document / fallback — show a download link when possible
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <FileText className="w-5 h-5 shrink-0 text-gray-500" />
      {proxyUrl ? (
        <a
          href={proxyUrl}
          download={filename ?? 'document'}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline text-blue-600 truncate max-w-[180px]"
        >
          {filename ?? 'document'}
        </a>
      ) : (
        <span className="text-xs text-gray-500 truncate max-w-[180px]">{filename ?? mediaType}</span>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LiveChat() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('All');
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentFile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close pickers when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Conversations list (poll every 10s) ──────────────────────────────────

  const { data: convsData, isLoading: convsLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations'),
    refetchInterval: 10_000,
  });

  const conversations = convsData?.conversations ?? [];
  const activeConv = conversations.find(c => c.id === activeConvId) ?? null;

  // Auto-select first conversation
  useEffect(() => {
    if (!activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0]!.id);
    }
  }, [conversations, activeConvId]);

  // ── Messages for active conversation (poll every 5s) ─────────────────────

  const { data: msgsData, isLoading: msgsLoading } = useQuery<{ messages: Message[] }>({
    queryKey: ['messages', activeConvId],
    queryFn: () => api.get(`/conversations/${activeConvId}/messages`),
    enabled: !!activeConvId,
    refetchInterval: 5_000,
  });

  const messages = msgsData?.messages ?? [];

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Send text message mutation ────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.post(`/conversations/${activeConvId}/messages`, { body }),
    onSuccess: () => {
      setMessageInput('');
      qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Send media mutation ───────────────────────────────────────────────────

  const sendMediaMutation = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);

      const res = await fetch(`${import.meta.env.BASE_URL}api/conversations/${activeConvId}/media`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: 'Upload failed' }))) as { error?: string };
        throw new Error(err.error ?? 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setMessageInput('');
      setAttachment(prev => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isPending = sendMutation.isPending || sendMediaMutation.isPending;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    if (isPending || !activeConvId) return;
    if (attachment) {
      sendMediaMutation.mutate({ file: attachment.file, caption: messageInput.trim() });
    } else if (messageInput.trim()) {
      sendMutation.mutate(messageInput.trim());
    }
  }, [attachment, messageInput, activeConvId, isPending, sendMutation, sendMediaMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessageInput(prev => prev + emoji.native);
      return;
    }
    const start = ta.selectionStart ?? messageInput.length;
    const end = ta.selectionEnd ?? messageInput.length;
    const next = messageInput.slice(0, start) + emoji.native + messageInput.slice(end);
    setMessageInput(next);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.native.length;
      ta.setSelectionRange(pos, pos);
    });
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    setAttachment({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
    });
    e.target.value = '';
  };

  const openFilePicker = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
    setShowAttachMenu(false);
  };

  const clearAttachment = () => {
    setAttachment(prev => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  // ── Filter conversations ──────────────────────────────────────────────────

  const filtered = conversations.filter(c => {
    const matchTab = activeTab === 'All' || c.status === activeTab;
    const matchSearch =
      !search ||
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPhone.includes(search);
    return matchTab && matchSearch;
  });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-3.5rem)] flex bg-white overflow-hidden">
      {/* Left Panel: Conversation List */}
      <div className="w-80 border-r flex flex-col bg-gray-50/30 shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 border-transparent rounded-lg focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {['All', 'Open', 'Resolved'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  activeTab === tab ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
              <MessageSquare className="w-8 h-8" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs text-center px-4">Messages will appear here when customers contact you via WhatsApp.</p>
            </div>
          ) : (
            filtered.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left p-4 border-b transition-colors hover:bg-gray-50 flex gap-3 ${
                  activeConvId === conv.id
                    ? 'bg-primary/5 border-l-2 border-l-primary'
                    : 'border-l-2 border-l-transparent'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                    {conv.contactName.charAt(0)}
                  </div>
                  {conv.unread > 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border border-white">
                      {conv.unread}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm truncate">{conv.contactName}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-1">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{conv.lastMessage || '—'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Middle Panel: Active Chat */}
      {activeConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="h-16 px-6 border-b flex items-center justify-between shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                {activeConv.contactName.charAt(0)}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">{activeConv.contactName}</h2>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{activeConv.contactPhone}</span>
                  <span>•</span>
                  {activeConv.windowOpen ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      24h Window Open
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      24h Window Closed
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
                  qc.invalidateQueries({ queryKey: ['conversations'] });
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                className={`p-2 rounded-lg transition-colors ${rightPanelOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#efeae2]">
            {msgsLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center items-center h-full text-gray-400 text-sm">
                No messages yet
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.direction === 'OUTBOUND' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 shadow-sm ${
                        msg.direction === 'OUTBOUND'
                          ? 'bg-[#dcf8c6] rounded-tr-none text-gray-900'
                          : 'bg-white rounded-tl-none text-gray-900'
                      }`}
                    >
                      {msg.mediaType && (
                        <MediaBubble mediaType={msg.mediaType} mediaId={msg.mediaId} filename={msg.mediaFilename} />
                      )}
                      {msg.body && (
                        <p className={`text-sm whitespace-pre-wrap ${msg.mediaType ? 'mt-1 text-gray-500 italic' : ''}`}>
                          {msg.body}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                        {msg.direction === 'OUTBOUND' && (
                          <CheckCheck
                            className={`w-3 h-3 ${
                              msg.status === 'READ' ? 'text-blue-500' : 'text-gray-400'
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="p-4 bg-gray-50 border-t shrink-0">
            {activeConv.windowOpen ? (
              <div className="max-w-3xl mx-auto space-y-2">
                {/* Attachment preview strip */}
                {attachment && (
                  <div className="flex items-center gap-3 bg-white border rounded-lg px-3 py-2 shadow-sm">
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt="preview"
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                        <FileText className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{attachment.file.name}</p>
                      <p className="text-xs text-gray-400">
                        {(attachment.file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={clearAttachment}
                      className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Input row */}
                <div className="relative flex items-end gap-2 bg-white border rounded-xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                  <div className="flex gap-1 pb-1">
                    {/* Emoji button */}
                    <div className="relative" ref={emojiPickerRef}>
                      <button
                        onClick={() => setShowEmojiPicker(p => !p)}
                        className={`p-2 rounded-lg transition-colors ${showEmojiPicker ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        title="Emoji"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-10 left-0 z-50 shadow-xl rounded-xl overflow-hidden">
                          <Picker
                            data={data}
                            onEmojiSelect={handleEmojiSelect}
                            theme="light"
                            previewPosition="none"
                            skinTonePosition="none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Attachment button + popup menu */}
                    <div className="relative" ref={attachMenuRef}>
                      <button
                        onClick={() => setShowAttachMenu(p => !p)}
                        className={`p-2 rounded-lg transition-colors ${attachment ? 'bg-primary/10 text-primary' : showAttachMenu ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                        title="Attach"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>

                      {showAttachMenu && (
                        <div className="absolute bottom-12 left-0 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 w-52 overflow-hidden">
                          {[
                            { label: 'Document', icon: FileText, color: 'bg-indigo-500', accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip' },
                            { label: 'Photos & videos', icon: FileImage, color: 'bg-violet-500', accept: 'image/*,video/*' },
                            { label: 'Audio', icon: Mic, color: 'bg-orange-400', accept: 'audio/*' },
                          ].map(({ label, icon: Icon, color, accept }) => (
                            <button
                              key={label}
                              onClick={() => openFilePicker(accept)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                            >
                              <span className={`w-9 h-9 rounded-full flex items-center justify-center ${color} shrink-0`}>
                                <Icon className="w-4 h-4 text-white" />
                              </span>
                              <span className="text-sm font-medium text-gray-700">{label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={attachment ? 'Add a caption (optional)...' : 'Type a message...'}
                    className="flex-1 max-h-32 min-h-[40px] resize-none border-none outline-none py-2 px-2 text-sm bg-transparent"
                    rows={1}
                  />

                  <div className="pb-1">
                    <button
                      onClick={handleSend}
                      disabled={(!messageInput.trim() && !attachment) || isPending}
                      className="p-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    >
                      {isPending
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Send className="w-5 h-5 ml-0.5" />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto text-center p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">
                  The 24-hour customer service window has closed. You can only send approved Template Messages until the customer replies.
                </p>
                <button className="mt-2 px-4 py-1.5 bg-white text-orange-700 text-sm font-medium border border-orange-200 rounded hover:bg-orange-100">
                  Send Template
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Select a conversation</p>
            <p className="text-sm mt-1">Choose a contact from the left to start chatting</p>
          </div>
        </div>
      )}
    </div>
  );
}
