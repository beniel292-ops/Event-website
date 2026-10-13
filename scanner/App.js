import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar, Image, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import ScanScreen from './src/screens/ScanScreen';
import LiveListScreen from './src/screens/LiveListScreen';
import AdminScreen from './src/screens/AdminScreen';
import LoginScreen from './src/screens/LoginScreen';

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null); // 'volunteer' | 'admin' | 'none'
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState('scan');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      setActiveTab('scan');
      return;
    }
    let cancelled = false;
    // my_role() checks the staff list by account and by approved email (see supabase/schema.sql).
    supabase.rpc('my_role').then(({ data, error }) => {
      if (!cancelled) setRole(!error && data ? data : 'none');
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const isAdmin = role === 'admin';
  const signOut = () => supabase.auth.signOut();

  let body;
  if (booting || (session && role === null)) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  } else if (!session) {
    body = <LoginScreen />;
  } else if (role === 'none') {
    body = (
      <View style={styles.center}>
        <Text style={styles.deniedTitle}>No Access</Text>
        <Text style={styles.deniedText}>
          {session.user.email} is not on the volunteer list. Ask a club admin to add you.
        </Text>
        <TouchableOpacity style={styles.outlineButton} onPress={signOut}>
          <Text style={styles.outlineButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    const tabs = [
      { key: 'scan', label: 'QR SCANNER' },
      { key: 'list', label: 'LIVE LIST' },
      ...(isAdmin ? [{ key: 'admin', label: 'ADMIN' }] : []),
    ];
    body = (
      <>
        <View style={styles.content}>
          {activeTab === 'scan' && <ScanScreen />}
          {activeTab === 'list' && <LiveListScreen isAdmin={isAdmin} />}
          {activeTab === 'admin' && isAdmin && <AdminScreen />}
        </View>
        <View style={styles.bottomNav}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.navButton, activeTab === tab.key && styles.navButtonActive]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
            >
              <Text style={[styles.navText, activeTab === tab.key && styles.navTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Image source={require('./assets/zbc.jpg')} style={styles.logoImage} resizeMode="cover" />
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Zero Bugs Club</Text>
          <Text style={styles.headerSubtitle}>
            Event Entry Scanner{role && role !== 'none' ? ` · ${role === 'admin' ? 'Admin' : 'Volunteer'}` : ''}
          </Text>
        </View>
        {session && role && role !== 'none' ? (
          <TouchableOpacity onPress={signOut} style={styles.signOut} accessibilityLabel="Sign out">
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {body}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  logoImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerTextBox: { flex: 1 },
  headerTitle: { color: '#ffffff', fontWeight: '800', fontSize: 16, lineHeight: 18 },
  headerSubtitle: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
  signOut: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 8 },
  signOutText: { color: '#e5e7eb', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  deniedTitle: { color: '#ffffff', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  deniedText: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  outlineButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  outlineButtonText: { color: '#ffffff', fontWeight: '700' },
  bottomNav: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  navButtonActive: { backgroundColor: '#ffffff' },
  navText: { color: '#9ca3af', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  navTextActive: { color: '#000000' },
});
