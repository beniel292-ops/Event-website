import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Modal, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AdminScreen() {
  const [config, setConfig] = useState({ max_seats: 80, registration_open: true });
  const [registeredCount, setRegisteredCount] = useState(0);
  const [newMaxSeats, setNewMaxSeats] = useState('80');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [scanLogs, setScanLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Modal States
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeConfirmText, setCloseConfirmText] = useState('');

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [pendingSeatCap, setPendingSeatCap] = useState(null);

  useEffect(() => {
    fetchConfig();
    fetchScanLogs();

    // Live updates from every scanner device: logs, registration count, open/closed status.
    const channel = supabase
      .channel('realtime-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scan_logs' }, () => {
        fetchScanLogs();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchConfig({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_config' }, () => {
        fetchConfig({ silent: true });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchConfig = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const { data: configData } = await supabase.from('event_config').select('*').eq('id', 1).single();
      if (configData) {
        setConfig(configData);
        if (!silent) setNewMaxSeats(String(configData.max_seats));
      }

      const { count } = await supabase.from('registrations').select('*', { count: 'exact', head: true });
      if (count !== null) {
        setRegisteredCount(count);
      }
    } catch (err) {
      console.error('Failed to fetch admin config:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchScanLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('scan_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setScanLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch scan logs:', err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchConfig({ silent: true }), fetchScanLogs()]);
    setRefreshing(false);
  };

  const initiateCapacityUpdate = () => {
    const targetSeats = parseInt(newMaxSeats, 10);
    if (isNaN(targetSeats) || targetSeats <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid seat capacity.');
      return;
    }

    if (targetSeats < registeredCount) {
      Alert.alert(
        'Capacity Limit Error',
        `Cannot reduce capacity below current registered count (${registeredCount}).`
      );
      return;
    }

    setPendingSeatCap(targetSeats);
    setShowSeatModal(true);
  };

  const confirmCapacityUpdate = async () => {
    if (!pendingSeatCap) return;
    setShowSeatModal(false);
    setUpdating(true);

    try {
      const { data: updatedRows, error } = await supabase
        .from('event_config')
        .update({ max_seats: pendingSeatCap, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select('id');

      if (error) {
        Alert.alert('Update Failed', error.message);
      } else if (!updatedRows?.length) {
        Alert.alert('Update Failed', 'Only admins can change capacity.');
      } else {
        setConfig((prev) => ({ ...prev, max_seats: pendingSeatCap }));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to update capacity.');
    } finally {
      setUpdating(false);
      setPendingSeatCap(null);
    }
  };

  const handleToggleClick = () => {
    if (config.registration_open) {
      setCloseConfirmText('');
      setShowCloseModal(true);
    } else {
      setShowOpenModal(true);
    }
  };

  const confirmCloseRegistration = () => {
    if (closeConfirmText.trim().toLowerCase() !== 'close-entry') {
      Alert.alert('Verification Failed', 'You must type "close-entry" to confirm closing registration.');
      return;
    }
    setShowCloseModal(false);
    executeStatusUpdate(false);
  };

  const confirmOpenRegistration = () => {
    setShowOpenModal(false);
    executeStatusUpdate(true);
  };

  const executeStatusUpdate = async (nextStatus) => {
    setUpdating(true);
    try {
      const { data: updatedRows, error } = await supabase
        .from('event_config')
        .update({ registration_open: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select('id');

      if (error) {
        Alert.alert('Status Update Failed', error.message);
      } else if (!updatedRows?.length) {
        Alert.alert('Status Update Failed', 'Only admins can open or close registration.');
      } else {
        setConfig((prev) => ({ ...prev, registration_open: nextStatus }));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to update registration status.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  const availableSeats = Math.max(0, config.max_seats - registeredCount);

  const renderLogItem = ({ item }) => {
    const isApproved = item.status === 'APPROVED';
    const isDuplicate = item.status === 'REJECTED_DUPLICATE';
    const isDeleted = item.status === 'DELETED';
    const timeFormatted = new Date(item.created_at || Date.now()).toLocaleTimeString();

    return (
      <View style={styles.logRow}>
        <View style={styles.logRowLeft}>
          <Text style={styles.logTimestamp}>{timeFormatted}</Text>
          <Text style={styles.logTitle}>{item.name}</Text>
          <Text style={styles.logSub}>{item.reg_no} • {item.details}</Text>
        </View>
        <View style={styles.logRowRight}>
          <View
            style={[
              styles.logBadge,
              isApproved
                ? styles.logBadgeApproved
                : isDuplicate
                ? styles.logBadgeDuplicate
                : isDeleted
                ? styles.logBadgeDeleted
                : styles.logBadgeError,
            ]}
          >
            <Text
              style={[
                styles.logBadgeText,
                isApproved
                  ? styles.logBadgeTextApproved
                  : isDuplicate
                  ? styles.logBadgeTextDuplicate
                  : isDeleted
                  ? styles.logBadgeTextDeleted
                  : styles.logBadgeTextError,
              ]}
            >
              {isApproved
                ? 'APPROVED'
                : isDuplicate
                ? 'DUPLICATE'
                : isDeleted
                ? 'DELETED'
                : 'REJECTED'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
    >
      <Text style={styles.headerTitle}>Mobile Admin Controls</Text>
      <Text style={styles.headerSub}>Manage event seating & registration availability</Text>

      {/* Seat Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>REGISTRATION STATS</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Current Registrations:</Text>
          <Text style={styles.rowValue}>{registeredCount}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Configured Max Seats:</Text>
          <Text style={styles.rowValue}>{config.max_seats}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Available Seats Left:</Text>
          <Text style={[styles.rowValue, { color: availableSeats > 0 ? '#34d399' : '#f87171' }]}>
            {availableSeats}
          </Text>
        </View>
      </View>

      {/* Capacity Edit Form */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>CAPACITY MANAGEMENT</Text>
        <Text style={styles.inputHelp}>
          Enter new seat count (Minimum allowed: {registeredCount})
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={newMaxSeats}
          onChangeText={setNewMaxSeats}
        />
        <TouchableOpacity style={styles.button} onPress={initiateCapacityUpdate} disabled={updating}>
          {updating ? <ActivityIndicator color="#000000" /> : <Text style={styles.buttonText}>UPDATE SEAT CAP</Text>}
        </TouchableOpacity>
      </View>

      {/* Toggle Form Open/Close */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FORM AVAILABILITY CONTROL</Text>
        <Text style={styles.statusText}>
          Current Status:{' '}
          <Text style={{ color: config.registration_open ? '#34d399' : '#f87171', fontWeight: '900' }}>
            {config.registration_open ? 'OPEN' : 'CLOSED'}
          </Text>
        </Text>
        <TouchableOpacity
          style={[styles.buttonOutline, { borderColor: config.registration_open ? '#f87171' : '#34d399' }]}
          onPress={handleToggleClick}
          disabled={updating}
        >
          <Text style={[styles.buttonOutlineText, { color: config.registration_open ? '#f87171' : '#34d399' }]}>
            {config.registration_open ? 'MANUALLY CLOSE REGISTRATION' : 'MANUALLY OPEN REGISTRATION'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Realtime Door Scan Activity Audit Logs Section */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>LIVE DOOR SCAN & DELETION LOGS</Text>
        {scanLogs.length === 0 ? (
          <Text style={styles.noLogsText}>No door scans recorded yet.</Text>
        ) : (
          <View style={styles.logsListContainer}>
            {scanLogs.map((item) => (
              <React.Fragment key={item.id}>
                {renderLogItem({ item })}
              </React.Fragment>
            ))}
          </View>
        )}
      </View>

      {/* Custom Close Registration Confirmation Modal */}
      <Modal
        visible={showCloseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Close Event Registration</Text>
            <Text style={styles.modalSub}>
              Closing registration will block any new student signups on the website immediately.
            </Text>

            <Text style={styles.modalPrompt}>
              Type <Text style={{ color: '#ef4444', fontWeight: '900' }}>close-entry</Text> below to confirm:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Type close-entry"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              value={closeConfirmText}
              onChangeText={setCloseConfirmText}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCloseModal(false)}
                disabled={updating}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalDangerButton,
                  closeConfirmText.trim().toLowerCase() !== 'close-entry' &&
                    styles.modalButtonDisabled,
                ]}
                onPress={confirmCloseRegistration}
                disabled={updating || closeConfirmText.trim().toLowerCase() !== 'close-entry'}
              >
                {updating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.modalDangerButtonText}>Close Registration</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Open Registration Confirmation Modal */}
      <Modal
        visible={showOpenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOpenModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Open Event Registration</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to re-open public student registrations on the website?
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowOpenModal(false)}
                disabled={updating}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSuccessButton}
                onPress={confirmOpenRegistration}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.modalSuccessButtonText}>Open Registration</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Seat Capacity Update Confirmation Modal */}
      <Modal
        visible={showSeatModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeatModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Capacity Update</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to change max seat capacity to{' '}
              <Text style={{ color: '#ffffff', fontWeight: '900' }}>{pendingSeatCap}</Text> seats?
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSeatModal(false)}
                disabled={updating}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={confirmCapacityUpdate}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.modalPrimaryButtonText}>Confirm Capacity</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 10,
  },
  headerSub: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 20,
  },
  card: {
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  cardLabel: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rowLabel: {
    color: '#9ca3af',
    fontSize: 14,
    flex: 1,
  },
  rowValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  inputHelp: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    borderRadius: 10,
    backgroundColor: '#171717',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  button: {
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000000',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 14,
  },
  buttonOutline: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonOutlineText: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
  noLogsText: {
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  logsListContainer: {
    gap: 8,
  },
  logRow: {
    borderRadius: 8,
    backgroundColor: '#171717',
    borderColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logRowLeft: {
    flex: 1,
  },
  logTimestamp: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
  },
  logTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  logSub: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  logRowRight: {
    marginLeft: 8,
  },
  logBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  logBadgeApproved: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  logBadgeTextApproved: {
    color: '#34d399',
    fontSize: 9,
    fontWeight: '900',
  },
  logBadgeDuplicate: {
    backgroundColor: '#7f1d1d',
    borderColor: '#f87171',
  },
  logBadgeTextDuplicate: {
    color: '#fca5a5',
    fontSize: 9,
    fontWeight: '900',
  },
  logBadgeDeleted: {
    backgroundColor: '#451a03',
    borderColor: '#f59e0b',
  },
  logBadgeTextDeleted: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '900',
  },
  logBadgeError: {
    backgroundColor: '#1c1917',
    borderColor: '#dc2626',
  },
  logBadgeTextError: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 14,
    width: '100%',
    backgroundColor: '#0a0a0a',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    padding: 22,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  modalSub: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 16,
  },
  modalPrompt: {
    color: '#e5e7eb',
    fontSize: 13,
    marginBottom: 10,
  },
  modalInput: {
    borderRadius: 10,
    backgroundColor: '#171717',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    borderRadius: 10,
    flex: 1,
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalDangerButton: {
    borderRadius: 10,
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDangerButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  modalSuccessButton: {
    borderRadius: 10,
    flex: 1,
    backgroundColor: '#34d399',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSuccessButtonText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
  },
  modalPrimaryButton: {
    borderRadius: 10,
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
  },
  modalButtonDisabled: {
    opacity: 0.4,
  },
});
