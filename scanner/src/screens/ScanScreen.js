import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buzz = (type) => Haptics.notificationAsync(type).catch(() => {});

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedToken, setScannedToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [participant, setParticipant] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [approving, setApproving] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [initialCheckedInStatus, setInitialCheckedInStatus] = useState(false);
  // Synchronous lock: the camera fires onBarcodeScanned several times before state updates.
  const scanLockRef = useRef(false);

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.infoText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.titleText}>Camera Access Required</Text>
        <Text style={styles.infoText}>We need camera access to scan QR codes on event passes.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const logScanEvent = async (status, name, reg_no, details) => {
    try {
      await supabase.from('scan_logs').insert([
        {
          status,
          name: name || 'Unknown',
          reg_no: reg_no || 'N/A',
          details: details || '',
        },
      ]);
    } catch (err) {
      console.warn('Failed to insert scan log:', err);
    }
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    const token = String(data || '').trim();
    setScannedToken(token || 'invalid');
    setErrorMsg(null);
    setJustApproved(false);

    // Not one of our passes (random QR, URL, etc.) — reject without hitting the database.
    if (!UUID_REGEX.test(token)) {
      setErrorMsg('This QR code is not a Zero Bugs Club entry pass.');
      buzz(Haptics.NotificationFeedbackType.Error);
      logScanEvent('REJECTED_INVALID', 'Invalid QR', 'N/A', token.slice(0, 40));
      return;
    }

    setLoading(true);
    try {
      const { data: regData, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', token)
        .maybeSingle();

      if (error) {
        setErrorMsg('Could not verify the pass. Check the internet connection and scan again.');
        buzz(Haptics.NotificationFeedbackType.Error);
        logScanEvent('REJECTED_ERROR', 'Unknown', 'N/A', 'DB Query Error');
      } else if (!regData) {
        setErrorMsg('Pass not found. This registration does not exist or was deleted.');
        buzz(Haptics.NotificationFeedbackType.Error);
        logScanEvent('REJECTED_INVALID', 'Invalid QR Pass', 'N/A', token.slice(0, 8));
      } else {
        setParticipant(regData);
        setInitialCheckedInStatus(regData.checked_in);
        if (regData.checked_in) {
          buzz(Haptics.NotificationFeedbackType.Warning);
          logScanEvent('REJECTED_DUPLICATE', regData.name, regData.reg_no, 'Already Checked In');
        } else {
          buzz(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (err) {
      setErrorMsg('Unexpected scan error. Please scan again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveEntry = async () => {
    if (!participant || approving) return;
    setApproving(true);

    try {
      const nowIso = new Date().toISOString();
      // Only flips a pass that is still unchecked, so two volunteers approving
      // the same pass at the same moment cannot both succeed.
      const { data: updated, error } = await supabase
        .from('registrations')
        .update({ checked_in: true, checked_in_at: nowIso })
        .eq('id', participant.id)
        .eq('checked_in', false)
        .select();

      if (error) {
        Alert.alert('Approval Failed', error.message);
      } else if (!updated || updated.length === 0) {
        // Someone else checked this pass in between scan and approve.
        const { data: latest } = await supabase.from('registrations').select('*').eq('id', participant.id).maybeSingle();
        if (latest) setParticipant(latest);
        setInitialCheckedInStatus(true);
        buzz(Haptics.NotificationFeedbackType.Warning);
        logScanEvent('REJECTED_DUPLICATE', participant.name, participant.reg_no, 'Approved on another device');
      } else {
        setParticipant(updated[0]);
        setJustApproved(true);
        buzz(Haptics.NotificationFeedbackType.Success);
        logScanEvent('APPROVED', participant.name, participant.reg_no, 'Door Entry Approved');
      }
    } catch (err) {
      Alert.alert('Approval Error', 'Failed to approve entry.');
    } finally {
      setApproving(false);
    }
  };

  const resetScan = () => {
    scanLockRef.current = false;
    setScannedToken(null);
    setParticipant(null);
    setErrorMsg(null);
    setJustApproved(false);
    setInitialCheckedInStatus(false);
  };

  return (
    <View style={styles.container}>
      {!scannedToken ? (
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />
          <View style={styles.overlay}>
            <View style={styles.scanTarget} />
            <Text style={styles.scanInstruction}>Align pass QR code within the box</Text>
          </View>
        </View>
      ) : (
        <View style={styles.resultContainer}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.infoText}>Verifying Pass Token...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.cardError}>
              <Text style={styles.errorTitle}>ENTRY REJECTED</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.resetButton} onPress={resetScan}>
                <Text style={styles.resetButtonText}>Scan Next Pass</Text>
              </TouchableOpacity>
            </View>
          ) : participant ? (
            <View style={initialCheckedInStatus ? styles.cardWarning : styles.cardSuccess}>
              {/* Badge Display Logic */}
              {justApproved ? (
                <View style={styles.badgeSuccess}>
                  <Text style={styles.badgeSuccessText}>✓ ENTRY APPROVED</Text>
                </View>
              ) : initialCheckedInStatus ? (
                <View style={styles.badgeWarning}>
                  <Text style={styles.badgeWarningText}>⚠ ALREADY CHECKED IN</Text>
                </View>
              ) : (
                <View style={styles.badgePending}>
                  <Text style={styles.badgePendingText}>PASS VALIDATED - READY FOR ENTRY</Text>
                </View>
              )}

              <Text style={styles.participantName}>{participant.name}</Text>
              <Text style={styles.participantRegNo}>{participant.reg_no}</Text>
              <Text style={styles.participantEmail}>{participant.email}</Text>

              {initialCheckedInStatus && !justApproved && (
                <Text style={styles.checkInTime}>
                  Previously checked in at: {new Date(participant.checked_in_at || Date.now()).toLocaleTimeString()}
                </Text>
              )}

              {justApproved && (
                <Text style={styles.approvedTime}>
                  Checked in at: {new Date(participant.checked_in_at || Date.now()).toLocaleTimeString()}
                </Text>
              )}

              {!initialCheckedInStatus && !justApproved && (
                <TouchableOpacity
                  style={styles.approveButton}
                  onPress={handleApproveEntry}
                  disabled={approving}
                >
                  {approving ? (
                    <ActivityIndicator color="#000000" />
                  ) : (
                    <Text style={styles.approveButtonText}>APPROVE ENTRY</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.resetButton, justApproved && styles.resetButtonHighlight]}
                onPress={resetScan}
              >
                <Text style={[styles.resetButtonText, justApproved && styles.resetButtonTextHighlight]}>
                  Scan Next Pass
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000000',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanTarget: {
    borderRadius: 16,
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  scanInstruction: {
    color: '#ffffff',
    marginTop: 20,
    fontSize: 14,
    fontWeight: '600',
  },
  titleText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
  },
  infoText: {
    color: '#a3a3a3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 14,
  },
  resultContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSuccess: {
    borderRadius: 12,
    width: '100%',
    backgroundColor: '#0a0a0a',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  cardWarning: {
    borderRadius: 12,
    width: '100%',
    backgroundColor: '#171717',
    borderColor: '#ef4444',
    borderWidth: 2,
    padding: 24,
    alignItems: 'center',
  },
  cardError: {
    borderRadius: 12,
    width: '100%',
    backgroundColor: '#1c1917',
    borderColor: '#dc2626',
    borderWidth: 2,
    padding: 24,
    alignItems: 'center',
  },
  badgePending: {
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  badgePendingText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  badgeSuccess: {
    borderRadius: 6,
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 16,
  },
  badgeSuccessText: {
    color: '#34d399',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  badgeWarning: {
    borderRadius: 6,
    backgroundColor: '#7f1d1d',
    borderColor: '#f87171',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
  },
  badgeWarningText: {
    color: '#fca5a5',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  participantName: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  participantRegNo: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  participantEmail: {
    color: '#a3a3a3',
    fontSize: 13,
    marginBottom: 16,
  },
  checkInTime: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 20,
  },
  approvedTime: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 20,
  },
  approveButton: {
    borderRadius: 10,
    backgroundColor: '#ffffff',
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  approveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  resetButton: {
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  resetButtonHighlight: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  resetButtonTextHighlight: {
    color: '#000000',
    fontWeight: '900',
  },
  errorTitle: {
    color: '#f87171',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  errorText: {
    color: '#e5e7eb',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
});
