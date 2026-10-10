import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  getTenantNotificationSummary,
  listTenantConversationMessages,
  listTenantConversations,
  sendTenantConversationMessage,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { clearAuthToken, getAuthToken } from '@/lib/tokenStorage';

type StatusTab = 'Sent' | 'Open' | 'Closed';
type Conversation = Awaited<ReturnType<typeof listTenantConversations>>['conversations'][number];
type Message = Awaited<ReturnType<typeof listTenantConversationMessages>>['messages'][number];
const STATUS_TABS: StatusTab[] = ['Sent', 'Open', 'Closed'];

export default function LiveChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StatusTab>('Open');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');

  const conversationsQuery = useQuery({
    queryKey: ['mobile-live-chat-conversations'],
    queryFn: () => listTenantConversations({ cache: 'no-store' }),
    refetchInterval: 15000,
  });
  const conversations = conversationsQuery.data?.conversations ?? [];
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.status === tab),
    [conversations, tab],
  );
  const messagesQuery = useQuery({
    queryKey: ['mobile-live-chat-messages', selected?.contactId],
    queryFn: () => listTenantConversationMessages(selected!.contactId, { cache: 'no-store' }),
    enabled: Boolean(selected),
    refetchInterval: 10000,
  });
  const notificationQuery = useQuery({
    queryKey: ['mobile-unread-notification-count'],
    queryFn: () => getTenantNotificationSummary({ cache: 'no-store' }),
    refetchInterval: 30000,
  });
  const messages = messagesQuery.data?.messages ?? [];
  const sendMutation = useMutation({
    mutationFn: (input: { contactId: string; body: string }) =>
      sendTenantConversationMessage(input.contactId, { body: input.body }),
    onSuccess: async () => {
      setDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-live-chat-conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-live-chat-messages', selected?.contactId] }),
      ]);
    },
  });
  const signOut = async () => {
    await clearAuthToken();
    router.replace('/');
  };
  const send = () => {
    const body = draft.trim();
    if (!selected || !body || sendMutation.isPending || !selected.windowOpen) return;
    sendMutation.mutate({ contactId: selected.contactId, body });
  };
  const webInsets = Platform.OS === 'web' ? { paddingTop: 67, paddingBottom: 34 } : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }, webInsets]}>
      {selected ? (
        <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={0}>
          <View style={[styles.threadHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <Pressable accessibilityLabel="Back to conversations" onPress={() => setSelected(null)} style={styles.iconButton}>
              <Feather name="arrow-left" size={21} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerContact}>
              <Text numberOfLines={1} style={[styles.headerName, { color: colors.foreground }]}>{selected.contactName}</Text>
              <Text numberOfLines={1} style={[styles.smallText, { color: selected.windowOpen ? colors.primary : colors.mutedForeground }]}>
                {selected.contactPhone} · {selected.windowOpen ? '24h window open' : '24h window closed'}
              </Text>
            </View>
            <NotificationCount count={notificationQuery.data?.unreadCount ?? 0} colors={colors} />
          </View>
          {messagesQuery.isError ? (
            <ErrorPanel message="Could not load this conversation." onRetry={() => void messagesQuery.refetch()} colors={colors} />
          ) : messagesQuery.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : messages.length === 0 ? (
            <View style={styles.center}><Text style={[styles.mutedText, { color: colors.mutedForeground }]}>No messages yet.</Text></View>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              inverted
              keyExtractor={(message) => message.id}
              contentContainerStyle={styles.messageList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => <MessageBubble message={item} colors={colors} />}
            />
          )}
          <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
            {!selected.windowOpen ? (
              <Text style={[styles.closedNotice, { color: colors.mutedForeground }]}>The 24-hour reply window is closed. Use an approved template in the web app.</Text>
            ) : null}
            <View style={styles.composerRow}>
              <TextInput
                accessibilityLabel="Type a message"
                editable={selected.windowOpen && !sendMutation.isPending}
                onChangeText={setDraft}
                onSubmitEditing={send}
                placeholder="Type a message..."
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="send"
                style={[styles.messageInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={draft}
              />
              <Pressable
                accessibilityLabel="Send message"
                disabled={!draft.trim() || !selected.windowOpen || sendMutation.isPending}
                onPress={send}
                style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !draft.trim() || !selected.windowOpen ? 0.45 : 1 }]}
              >
                {sendMutation.isPending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="send" size={17} color={colors.primaryForeground} />}
              </Pressable>
            </View>
            {sendMutation.isError ? <Text style={[styles.sendError, { color: colors.destructive }]}>{sendMutation.error.message}</Text> : null}
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.fill}>
          <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.pageTitle, { color: colors.foreground }]}>Live Chat</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>WhatsApp conversations</Text>
            </View>
            <View style={styles.headerActions}>
              <NotificationCount count={notificationQuery.data?.unreadCount ?? 0} colors={colors} />
              <Pressable accessibilityLabel="Sign out" onPress={() => void signOut()} style={styles.iconButton}>
                <Feather name="log-out" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
          <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {STATUS_TABS.map((status) => {
              const count = conversations.filter((conversation) => conversation.status === status).length;
              const active = tab === status;
              return (
                <Pressable key={status} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(status)} style={[styles.tab, active && { borderBottomColor: colors.primary }]}>
                  <Text style={[styles.tabText, { color: active ? colors.primary : colors.mutedForeground }]}>{status} ({count})</Text>
                </Pressable>
              );
            })}
          </View>
          {conversationsQuery.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : conversationsQuery.isError ? (
            <ErrorPanel message="Could not load conversations." onRetry={() => void conversationsQuery.refetch()} colors={colors} />
          ) : visibleConversations.length === 0 ? (
            <View style={styles.center}>
              <Feather name="message-circle" size={30} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {tab.toLowerCase()} conversations</Text>
              <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>Conversations will appear here when they match this tab.</Text>
            </View>
          ) : (
            <FlatList
              data={visibleConversations}
              keyExtractor={(conversation) => conversation.contactId}
              refreshControl={<RefreshControl refreshing={conversationsQuery.isRefetching} onRefresh={() => void conversationsQuery.refetch()} tintColor={colors.primary} />}
              renderItem={({ item }) => (
                <Pressable onPress={() => setSelected(item)} style={({ pressed }) => [styles.conversationRow, { backgroundColor: colors.background, borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{item.contactName.trim().charAt(0).toUpperCase() || '?'}</Text></View>
                  <View style={styles.conversationDetails}>
                    <View style={styles.conversationTitleRow}>
                      <Text numberOfLines={1} style={[styles.contactName, { color: colors.foreground }]}>{item.contactName}</Text>
                      <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{formatTime(item.lastMessageAt)}</Text>
                    </View>
                    <View style={styles.conversationTitleRow}>
                      <Text numberOfLines={1} style={[styles.lastMessage, { color: colors.mutedForeground }]}>{item.lastMessage || item.contactPhone}</Text>
                      {item.unread > 0 ? <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><Text style={[styles.unreadText, { color: colors.primaryForeground }]}>{item.unread}</Text></View> : null}
                    </View>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function MessageBubble({ message, colors }: { message: Message; colors: ReturnType<typeof useColors> }) {
  const outgoing = message.direction === 'OUTBOUND';
  const mediaPlaceholder = Boolean(message.mediaType) && /^\[(image|video|document|audio)\]$/i.test(message.body.trim());
  return (
    <View style={[styles.messageRow, outgoing ? styles.outgoingRow : styles.incomingRow]}>
      <View style={[styles.bubble, { backgroundColor: outgoing ? colors.whatsappOutgoing : colors.whatsappIncoming, borderColor: colors.border }]}>
        {message.mediaType ? <MessageMedia message={message} colors={colors} /> : null}
        {message.body && !mediaPlaceholder ? <Text style={[styles.messageText, { color: colors.foreground }]}>{message.body}</Text> : null}
        <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{formatTime(message.createdAt)}</Text>
      </View>
    </View>
  );
}

function MessageMedia({ message, colors }: { message: Message; colors: ReturnType<typeof useColors> }) {
  const insets = useSafeAreaInsets();
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [imageOpen, setImageOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const uri = getMessageMediaUrl(message);
  const type = message.mediaType?.toLowerCase() ?? 'document';
  const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
  const requiresAuth = Boolean(uri && isTenantApiUrl(uri, apiDomain));

  useEffect(() => {
    if (!requiresAuth) {
      setAuthReady(true);
      return;
    }
    let mounted = true;
    void getAuthToken().then((token) => {
      if (!mounted) return;
      if (token) setHeaders({ Authorization: `Bearer ${token}` });
      setAuthReady(true);
    }).catch(() => {
      if (mounted) setAuthReady(true);
    });
    return () => { mounted = false; };
  }, [requiresAuth]);

  const downloadAndShare = async () => {
    if (!uri || (requiresAuth && !headers.Authorization)) {
      Alert.alert('Attachment unavailable', 'This file could not be loaded for this tenant.');
      return;
    }
    if (!FileSystem.cacheDirectory) {
      Alert.alert('Download unavailable', 'Local file storage is not available on this device.');
      return;
    }
    setDownloading(true);
    try {
      const safeName = (message.mediaFilename || `${type}-attachment`).replace(/[^\w.-]/g, '_');
      const target = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;
      const result = await FileSystem.downloadAsync(uri, target, { headers });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot open the downloaded attachment.');
        return;
      }
      await Sharing.shareAsync(result.uri, { dialogTitle: message.mediaFilename || 'Open attachment' });
    } catch {
      Alert.alert('Could not open attachment', 'Please try again when your connection is available.');
    } finally {
      setDownloading(false);
    }
  };

  if (!authReady) {
    return <View style={styles.mediaLoading}><ActivityIndicator size="small" color={colors.primary} /></View>;
  }

  if (type === 'image') {
    return uri ? (
      <>
        <Pressable accessibilityLabel={`Open image ${message.mediaFilename ?? ''}`} onPress={() => setImageOpen(true)}>
          <Image source={{ uri, headers }} resizeMode="contain" style={styles.mediaImage} />
        </Pressable>
        <Modal visible={imageOpen} transparent animationType="fade" onRequestClose={() => setImageOpen(false)}>
          <View style={[styles.imageModal, { backgroundColor: colors.foreground }]}>
            <Pressable accessibilityLabel="Close image preview" onPress={() => setImageOpen(false)} style={[styles.modalClose, { top: insets.top + 8, right: insets.right + 12 }]}>
              <Feather name="x" size={25} color={colors.primaryForeground} />
            </Pressable>
            <Image source={{ uri, headers }} resizeMode="contain" style={styles.fullImage} />
            {message.mediaFilename ? <Text numberOfLines={1} style={[styles.modalFilename, { color: colors.primaryForeground }]}>{message.mediaFilename}</Text> : null}
          </View>
        </Modal>
      </>
    ) : <UnavailableAttachment label={message.mediaFilename || 'Image'} colors={colors} />;
  }

  if (type === 'video' && uri) {
    return <VideoAttachment uri={uri} headers={headers} colors={colors} />;
  }
  if (type === 'audio' && uri) {
    return <AudioAttachment uri={uri} headers={headers} filename={message.mediaFilename} colors={colors} />;
  }

  const title = message.mediaFilename || `${type} attachment`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={() => void downloadAndShare()} style={[styles.fileCard, { borderColor: colors.border }]}>
      <Feather name={type === 'video' ? 'video' : type === 'audio' ? 'volume-2' : 'file-text'} size={20} color={colors.primary} />
      <View style={styles.fileDetails}>
        <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{downloading ? 'Preparing file…' : uri ? 'Tap to open or share' : 'File unavailable'}</Text>
      </View>
      {downloading ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={18} color={colors.primary} />}
    </Pressable>
  );
}

function VideoAttachment({ uri, headers, colors }: { uri: string; headers: Record<string, string>; colors: ReturnType<typeof useColors> }) {
  const player = useVideoPlayer({ uri, headers }, (instance) => { instance.loop = false; });
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />;
}

function AudioAttachment({ uri, headers, filename, colors }: {
  uri: string;
  headers: Record<string, string>;
  filename?: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  const player = useAudioPlayer({ uri, headers }, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  return (
    <View style={[styles.fileCard, { borderColor: colors.border }]}>
      <Pressable
        accessibilityLabel={status.playing ? 'Pause audio attachment' : 'Play audio attachment'}
        onPress={() => status.playing ? player.pause() : player.play()}
        style={styles.audioPlayButton}
      >
        <Feather name={status.playing ? 'pause' : 'play'} size={19} color={colors.primary} />
      </Pressable>
      <View style={styles.fileDetails}>
        <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{filename || 'Audio message'}</Text>
        <Text style={[styles.smallText, { color: colors.mutedForeground }]}>
          {status.isLoaded ? `${formatDuration(status.currentTime)} / ${formatDuration(status.duration)}` : 'Loading audio…'}
        </Text>
      </View>
    </View>
  );
}

function UnavailableAttachment({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.fileCard, { borderColor: colors.border }]}>
      <Feather name="image" size={20} color={colors.mutedForeground} />
      <Text numberOfLines={1} style={[styles.fileName, { color: colors.mutedForeground }]}>{label} unavailable</Text>
    </View>
  );
}

function getMessageMediaUrl(message: Message): string | null {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (message.mediaId && domain) {
    return `https://${domain}/api/media/proxy?mediaId=${encodeURIComponent(message.mediaId)}`;
  }
  return message.mediaUrl && /^https?:\/\//i.test(message.mediaUrl) ? message.mediaUrl : null;
}

function isTenantApiUrl(uri: string, domain: string | undefined): boolean {
  if (!domain) return false;
  try {
    return new URL(uri).host === domain;
  } catch {
    return false;
  }
}

function ErrorPanel({ message, onRetry, colors }: { message: string; onRetry: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.mutedText, { color: colors.destructive }]}>{message}</Text>
      <Pressable onPress={onRetry} style={[styles.retryButton, { borderColor: colors.border }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>Retry</Text></Pressable>
    </View>
  );
}

function NotificationCount({ count, colors }: { count: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View accessibilityLabel={`${count} unread notifications`} accessibilityRole="image" style={styles.notificationIcon}>
      <Feather name="bell" size={20} color={colors.foreground} />
      {count > 0 ? (
        <View style={[styles.notificationBadge, { backgroundColor: colors.destructive }]}>
          <Text style={[styles.notificationBadgeText, { color: colors.primaryForeground }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  topHeader: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notificationIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationBadge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notificationBadgeText: { fontSize: 10, fontWeight: '700' },
  pageTitle: { fontSize: 22, fontWeight: '700' },
  smallText: { fontSize: 12, marginTop: 3 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },
  center: { flex: 1, padding: 28, gap: 10, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  mutedText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  conversationRow: { minHeight: 76, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  conversationDetails: { flex: 1, gap: 5 },
  conversationTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  contactName: { flex: 1, fontSize: 15, fontWeight: '700' },
  lastMessage: { flex: 1, fontSize: 13 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { fontSize: 11, fontWeight: '700' },
  threadHeader: { minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  headerContact: { flex: 1, marginLeft: 4 },
  headerName: { fontSize: 16, fontWeight: '700' },
  messageList: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 14, paddingVertical: 16, gap: 9 },
  messageRow: { width: '100%', flexDirection: 'row' },
  outgoingRow: { justifyContent: 'flex-end' },
  incomingRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '84%', borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9 },
  mediaImage: { width: 240, height: 220, borderRadius: 10 },
  video: { width: 250, height: 190, borderRadius: 10 },
  imageModal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalClose: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  fullImage: { width: '100%', height: '82%' },
  modalFilename: { maxWidth: '90%', marginTop: 8, fontSize: 13 },
  fileCard: { minWidth: 190, maxWidth: 260, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  fileDetails: { flex: 1 },
  fileName: { flex: 1, fontSize: 13, fontWeight: '600' },
  audioPlayButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  mediaLoading: { width: 220, height: 70, alignItems: 'center', justifyContent: 'center' },
  messageText: { fontSize: 14, lineHeight: 20 },
  timeText: { textAlign: 'right', fontSize: 10, marginTop: 4 },
  composer: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageInput: { flex: 1, minHeight: 44, maxHeight: 96, borderWidth: 1, borderRadius: 22, paddingHorizontal: 15, fontSize: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  closedNotice: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 8 },
  sendError: { fontSize: 12, marginTop: 6 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1, borderRadius: 18, marginTop: 4 },
});
