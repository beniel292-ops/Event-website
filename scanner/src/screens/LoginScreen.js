import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null); // null | 'password' | 'google'
  const [error, setError] = useState('');

  const signIn = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy('password');
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(null);
    if (authError) setError(authError.message === 'Invalid login credentials' ? 'Wrong email or password.' : authError.message);
  };

  const signInWithGoogle = async () => {
    setBusy('google');
    setError('');
    try {
      // exp://…/--/auth-callback in Expo Go, com.zbcvitc.entryscanner://auth-callback in the APK.
      // Both must be listed in Supabase → Authentication → URL Configuration → Redirect URLs.
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (oauthError) throw oauthError;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return; // user closed the browser

      const { queryParams } = Linking.parse(result.url);
      if (queryParams?.error_description) throw new Error(String(queryParams.error_description));
      if (!queryParams?.code) throw new Error('Google sign-in did not return a code. Check the redirect URLs in Supabase.');

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(String(queryParams.code));
      if (exchangeError) throw exchangeError;
    } catch (err) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Volunteer Sign In</Text>
        <Text style={styles.sub}>Only club volunteers approved by an admin can use this app.</Text>

        <TouchableOpacity
          style={[styles.googleButton, busy && styles.buttonDisabled]}
          onPress={signInWithGoogle}
          disabled={!!busy}
          accessibilityLabel="Sign in with Google"
        >
          {busy === 'google' ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <>
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or use email</Text>
          <View style={styles.dividerLine} />
        </View>

        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          editable={!busy}
        />

        <Text style={styles.label}>PASSWORD</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          placeholderTextColor="#9ca3af"
          editable={!busy}
          onSubmitEditing={signIn}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={signIn} disabled={!!busy}>
          {busy === 'password' ? <ActivityIndicator color="#000000" /> : <Text style={styles.buttonText}>SIGN IN</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#0a0a0a', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderRadius: 12, padding: 22 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginBottom: 6 },
  sub: { color: '#9ca3af', fontSize: 13, marginBottom: 20 },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 14,
  },
  googleG: { color: '#4285F4', fontSize: 18, fontWeight: '900' },
  googleText: { color: '#111827', fontSize: 15, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText: { color: '#9ca3af', fontSize: 12 },
  label: { color: '#9ca3af', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  input: {
    backgroundColor: '#171717',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: 10,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  button: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});
