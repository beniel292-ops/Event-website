import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function LiveListScreen({ isAdmin = false }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetItem, setTargetItem] = useState(null);
  const [confirmRegNo, setConfirmRegNo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRegistrations();

    const channel = supabase
      .channel('mobile-live-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchRegistrations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchRegistrations = async () => {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Fetch error:', error);
      } else if (data) {
        setRegistrations(data);
      }
    } catch (err) {
      console.error('Failed to fetch list:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRegistrations();
    setRefreshing(false);
  };

  const openDeleteModal = (item) => {
    setTargetItem(item);
    setConfirmRegNo('');
  };

  const closeDeleteModal = () => {
    setTargetItem(null);
    setConfirmRegNo('');
  };

  const handleConfirmDelete = async () => {
    if (!targetItem) return;

    if (confirmRegNo.trim().toUpperCase() !== targetItem.reg_no.trim().toUpperCase()) {
      Alert.alert('Verification Error', `Registration number does not match (${targetItem.reg_no}).`);
      return;
    }

    setDeleting(true);
    try {
      const { data: deletedRows, error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', targetItem.id)
        .select('id');

      if (!error && (!deletedRows || deletedRows.length === 0)) {
        Alert.alert('Not Deleted', 'Only admins can delete entries, or this entry was already removed.');
      } else if (error) {
        Alert.alert(
          'Database Delete Blocked',
          `${error.message}\n\nOnly admins can delete entries.`
        );
      } else {
        // Log deletion event to Supabase
        await supabase.from('scan_logs').insert([
          {
            status: 'DELETED',
            name: targetItem.name,
            reg_no: targetItem.reg_no,
            details: targetItem.checked_in ? 'Removed (was checked in)' : 'Registration Entry Removed',
          },
        ]);

        setRegistrations((prev) => prev.filter((r) => r.id !== targetItem.id));
        closeDeleteModal();
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to delete registration entry.');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = registrations.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.reg_no.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q)
    );
  });

  const checkedInCount = registrations.filter((r) => r.checked_in).length;

  const renderItem = ({ item }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemSub}>{item.reg_no} • {item.email}</Text>
      </View>

      <View style={styles.itemRight}>
        {item.checked_in ? (
          <View style={styles.badgeCheckedIn}>
            <Text style={styles.badgeCheckedInText}>Checked In</Text>
          </View>
        ) : (
          <View style={styles.badgePending}>
            <Text style={styles.badgePendingText}>Pending</Text>
          </View>
        )}

        {isAdmin && (
          <TouchableOpacity style={styles.deleteIconButton} onPress={() => openDeleteModal(item)}>
            <Text style={styles.deleteIconButtonText}>Delete Entry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.statsHeader}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>TOTAL REGISTRATION</Text>
          <Text style={styles.statValue}>{registrations.length}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>DOOR CHECKED IN</Text>
          <Text style={[styles.statValue, { color: '#34d399' }]}>{checkedInCount}</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, reg no, email…"
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading && registrations.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No matching registrations found.</Text>
          }
        />
      )}

      {/* Custom Deletion Confirmation Dialog Modal */}
      <Modal
        visible={!!targetItem}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Registration Deletion</Text>
            <Text style={styles.modalSub}>
              You are about to permanently delete <Text style={{ color: '#ffffff', fontWeight: '800' }}>{targetItem?.name}</Text>.
            </Text>

            {targetItem?.checked_in && (
              <Text style={styles.modalWarning}>
                ⚠ This person is already CHECKED IN at the door. Deleting removes their attendance record.
              </Text>
            )}

            <Text style={styles.modalPrompt}>
              Type <Text style={{ color: '#ef4444', fontWeight: '900' }}>{targetItem?.reg_no}</Text> below to confirm:
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder={`Enter ${targetItem?.reg_no}`}
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              value={confirmRegNo}
              onChangeText={setConfirmRegNo}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={closeDeleteModal}
                disabled={deleting}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalDeleteButton,
                  confirmRegNo.trim().toUpperCase() !== targetItem?.reg_no?.toUpperCase() &&
                    styles.modalDeleteButtonDisabled,
                ]}
                onPress={handleConfirmDelete}
                disabled={
                  deleting ||
                  confirmRegNo.trim().toUpperCase() !== targetItem?.reg_no?.toUpperCase()
                }
              >
                {deleting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.modalDeleteButtonText}>Delete Entry</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    borderRadius: 12,
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    padding: 16,
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  searchBox: {
    marginBottom: 16,
  },
  searchInput: {
    borderRadius: 10,
    backgroundColor: '#171717',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    color: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 24,
  },
  itemRow: {
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    borderColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemLeft: {
    flex: 1,
  },
  itemName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  itemSub: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: 10,
  },
  badgeCheckedIn: {
    borderRadius: 6,
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeCheckedInText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '800',
  },
  badgePending: {
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgePendingText: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
  },
  deleteIconButton: {
    borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deleteIconButtonText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyText: {
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
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
    marginBottom: 14,
  },
  modalWarning: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 14,
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
  modalDeleteButton: {
    borderRadius: 10,
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDeleteButtonDisabled: {
    opacity: 0.4,
  },
  modalDeleteButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
});
