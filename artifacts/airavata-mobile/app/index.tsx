import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { getAuthenticatedTenantUser, loginTenantUser } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { clearAuthToken, getAuthToken, saveAuthToken } from '@/lib/tokenStorage';

type LoginInput = { email: string; password: string };

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    let active = true;
    void getAuthToken()
      .then(async (token) => {
        if (!token) return;
        try {
          const response = await getAuthenticatedTenantUser({ cache: 'no-store' });
          if (active && response.user) router.replace('/chat');
        } catch {
          await clearAuthToken();
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => { active = false; };
  }, [router]);
  const mutation = useMutation({
    mutationFn: (input: LoginInput) => loginTenantUser(input),
    onSuccess: async (session) => {
      await saveAuthToken(session.token);
      router.replace('/chat');
    },
  });
  const errorMessage =
    mutation.error instanceof Error
      ? mutation.error.message.replace(/^HTTP \d+ [^:]+:\s*/, '')
      : null;
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Image
            source={require('../assets/images/atwassup-logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="AtWassup logo"
          />
          <Text style={[styles.eyebrow, { color: colors.primary }]}>WELCOME BACK</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Your workspace, on the go.</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in with your tenant account to open Live Chat.
          </Text>

          {checkingSession ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.foreground }]}>Email address</Text>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                testID="login-email"
                value={email}
              />
              <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={setPassword}
                onSubmitEditing={() => mutation.mutate({ email: email.trim(), password })}
                placeholder="Enter your password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                testID="login-password"
                value={password}
              />
              {errorMessage ? (
                <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
                  {errorMessage}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!email.trim() || !password || mutation.isPending}
                onPress={() => mutation.mutate({ email: email.trim(), password })}
                style={({ pressed }) => [
                  styles.submit,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
                  (!email.trim() || !password || mutation.isPending) && styles.disabled,
                ]}
                testID="login-submit"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Sign in to your workspace</Text>
                )}
              </Pressable>
            </View>
          )}
          <Text style={[styles.footer, { color: colors.mutedForeground }]}>
            Your conversations stay isolated to your tenant workspace.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: Platform.OS === 'web' ? 78 : 28,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    padding: 26,
    borderRadius: 24,
    borderWidth: 1,
  },
  logo: { width: 230, height: 80, alignSelf: 'center', marginBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 9, textAlign: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.7 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 9, marginBottom: 25 },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 5 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  submit: { minHeight: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  submitText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { fontSize: 13, lineHeight: 19 },
  footer: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 24 },
});
