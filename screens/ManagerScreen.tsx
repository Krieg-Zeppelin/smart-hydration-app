// screens/ManagerScreen.tsx
import React, { useState, useEffect } from 'react'
import { 
  View, 
  StyleSheet, 
  Alert, 
  Text, 
  ScrollView, 
  RefreshControl,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput
} from 'react-native'
import { Button, Card } from '@rneui/themed'
import { supabase } from '../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface Worker {
  id: number
  username: string
  full_name: string
  hydration_today: number
  last_hydration: string | null
  target_ml: number
  percentage: number
  status: 'good' | 'warning' | 'critical'
}

interface Warning {
  id: number
  user_id: number
  user_name: string
  warning_type: 'dehydration' | 'low_intake' | 'inactivity' | 'custom'
  message: string
  created_at: string
  was_acknowledged: boolean
}

interface CompanySummary {
  id: number
  date: string
  total_users: number
  active_users: number
  total_hydration_ml: number
  average_hydration_ml: number
  users_below_target: number
}

export default function ManagerScreen({ navigation, onLogout }: any) {
  // State management
  const [workers, setWorkers] = useState<Worker[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [summaries, setSummaries] = useState<CompanySummary[]>([])
  const [companyInfo, setCompanyInfo] = useState<{
    id: number
    name: string
    license_key: string
  } | null>(null)
  const [managerId, setManagerId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  
  // Modal states
  const [sendWarningModal, setSendWarningModal] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [warningMessage, setWarningMessage] = useState('')
  const [warningType, setWarningType] = useState<'dehydration' | 'low_intake' | 'inactivity' | 'custom'>('dehydration')

  // Load initial data
  useEffect(() => {
    loadManagerData()
  }, [])

  const loadManagerData = async () => {
    try {
      // Get stored user_id from AsyncStorage
      const storedUserId = await AsyncStorage.getItem('user_id')
      
      if (!storedUserId) {
        Alert.alert('Error', 'Manager not logged in')
        navigation.navigate('Login')
        return
      }
      
      const userIdNum = parseInt(storedUserId)
      setManagerId(userIdNum)
      
      // Verify user is actually a manager
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, role, corporation_id')
        .eq('id', userIdNum)
        .single()

      if (userError) {
        console.error('Error fetching manager data:', userError)
        Alert.alert('Error', 'Failed to load manager data')
        return
      }

      if (userData.role !== 'manager' && userData.role !== 'admin') {
        Alert.alert('Access Denied', 'This screen is for managers only')
        navigation.navigate('Dashboard')
        return
      }

      if (!userData.corporation_id) {
        Alert.alert('No Company', 'You are not assigned to any company')
        return
      }

      // Load all data
      await Promise.all([
        fetchCompanyInfo(userData.corporation_id),
        fetchWorkers(userData.corporation_id),
        fetchWarnings(userData.corporation_id),
        fetchSummaries(userData.corporation_id)
      ])
      
    } catch (error) {
      console.error('Error loading manager data:', error)
      Alert.alert('Error', 'Failed to load manager data')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanyInfo = async (corporationId: number) => {
    try {
      const { data, error } = await supabase
        .from('corporations')
        .select('id, name, license_key')
        .eq('id', corporationId)
        .single()

      if (error) throw error
      setCompanyInfo(data)
    } catch (error) {
      console.error('Error fetching company info:', error)
    }
  }

  const fetchWorkers = async (corporationId: number) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Get all workers in the company
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select(`
          id,
          username,
          full_name,
          user_settings (
            hydration_target_ml
          )
        `)
        .eq('corporation_id', corporationId)
        .eq('role', 'worker')
        .eq('is_active', true)

      if (usersError) throw usersError

      if (!users) {
        setWorkers([])
        return
      }

      // Get today's hydration for each worker
      const workersWithHydration = await Promise.all(
        users.map(async (user: any) => {
          const { data: logs, error: logsError } = await supabase
            .from('hydration_logs')
            .select('amount_ml, logged_at')
            .eq('user_id', user.id)
            .gte('logged_at', `${today}T00:00:00`)
            .lte('logged_at', `${today}T23:59:59`)
            .order('logged_at', { ascending: false })

          if (logsError) throw logsError

          const totalToday = logs?.reduce((sum, log) => sum + log.amount_ml, 0) || 0
          const target = user.user_settings?.[0]?.hydration_target_ml || 2000
          const percentage = target > 0 ? Math.round((totalToday / target) * 100) : 0
          
          // Determine status
          let status: 'good' | 'warning' | 'critical' = 'good'
          if (percentage < 30) status = 'critical'
          else if (percentage < 70) status = 'warning'

          return {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            hydration_today: totalToday,
            last_hydration: logs && logs.length > 0 ? logs[0].logged_at : null,
            target_ml: target,
            percentage: percentage,
            status: status
          }
        })
      )

      // Sort by status (critical first) then by percentage
      const sortedWorkers = workersWithHydration.sort((a, b) => {
        const statusOrder = { critical: 0, warning: 1, good: 2 }
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status]
        }
        return a.percentage - b.percentage
      })

      setWorkers(sortedWorkers)
    } catch (error) {
      console.error('Error fetching workers:', error)
      setWorkers([])
    }
  }

  const fetchWarnings = async (corporationId: number) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      const { data, error } = await supabase
        .from('warnings')
        .select(`
          id,
          user_id,
          warning_type,
          message,
          created_at,
          was_acknowledged,
          users!warnings_user_id_fkey (
            username
          )
        `)
        .eq('corporation_id', corporationId)
        .eq('was_acknowledged', false)
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      const formattedWarnings: Warning[] = (data || []).map((warning: any) => ({
        id: warning.id,
        user_id: warning.user_id,
        user_name: warning.users?.username || 'Unknown',
        warning_type: warning.warning_type,
        message: warning.message,
        created_at: warning.created_at,
        was_acknowledged: warning.was_acknowledged
      }))

      setWarnings(formattedWarnings)
    } catch (error) {
      console.error('Error fetching warnings:', error)
      setWarnings([])
    }
  }

  const fetchSummaries = async (corporationId: number) => {
    try {
      const { data, error } = await supabase
        .from('corporation_daily_summaries')
        .select('*')
        .eq('corporation_id', corporationId)
        .order('date', { ascending: false })
        .limit(7)

      if (error) throw error
      setSummaries(data || [])
    } catch (error) {
      console.error('Error fetching summaries:', error)
      setSummaries([])
    }
  }

  const sendWarning = async () => {
    if (!selectedWorker || !companyInfo || !managerId) {
      Alert.alert('Error', 'Missing required information')
      return
    }

    if (!warningMessage.trim()) {
      Alert.alert('Error', 'Please enter a warning message')
      return
    }

    try {
      const { error } = await supabase
        .from('warnings')
        .insert({
          user_id: selectedWorker.id,
          corporation_id: companyInfo.id,
          warning_type: warningType,
          message: warningMessage,
          was_acknowledged: false,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })

      if (error) throw error

      Alert.alert('Success', `Warning sent to ${selectedWorker.full_name}`)
      setSendWarningModal(false)
      setWarningMessage('')
      setWarningType('dehydration')
      
      // Refresh warnings
      await fetchWarnings(companyInfo.id)
    } catch (error) {
      console.error('Error sending warning:', error)
      Alert.alert('Error', 'Failed to send warning')
    }
  }

  const acknowledgeWarning = async (warningId: number) => {
    if (!managerId) return

    try {
      const { error } = await supabase
        .from('warnings')
        .update({
          was_acknowledged: true,
          acknowledged_by: managerId,
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', warningId)

      if (error) throw error

      // Remove from local state
      setWarnings(prev => prev.filter(w => w.id !== warningId))
      
      Alert.alert('Success', 'Warning acknowledged')
    } catch (error) {
      console.error('Error acknowledging warning:', error)
      Alert.alert('Error', 'Failed to acknowledge warning')
    }
  }

  const generateDailyReport = async () => {
    if (!companyInfo) {
      Alert.alert('Error', 'Company information not found')
      return
    }

    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Check if report already exists for today
      const { data: existingReport, error: checkError } = await supabase
        .from('corporation_daily_summaries')
        .select('id')
        .eq('corporation_id', companyInfo.id)
        .eq('date', today)
        .single()

      if (!checkError && existingReport) {
        Alert.alert('Info', 'Daily report already generated for today')
        return
      }

      // Calculate statistics
      const activeWorkers = workers.filter(w => w.hydration_today > 0)
      const totalHydration = workers.reduce((sum, w) => sum + w.hydration_today, 0)
      const averageHydration = workers.length > 0 ? Math.round(totalHydration / workers.length) : 0
      const usersBelowTarget = workers.filter(w => w.percentage < 70).length

      // Insert new summary
      const { error: insertError } = await supabase
        .from('corporation_daily_summaries')
        .insert({
          corporation_id: companyInfo.id,
          date: today,
          total_users: workers.length,
          active_users: activeWorkers.length,
          total_hydration_ml: totalHydration,
          average_hydration_ml: averageHydration,
          users_below_target: usersBelowTarget,
          generated_at: new Date().toISOString()
        })

      if (insertError) throw insertError

      Alert.alert('Success', 'Daily report generated successfully')
      
      // Refresh summaries
      await fetchSummaries(companyInfo.id)
    } catch (error) {
      console.error('Error generating report:', error)
      Alert.alert('Error', 'Failed to generate daily report')
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    if (companyInfo) {
      await Promise.all([
        fetchWorkers(companyInfo.id),
        fetchWarnings(companyInfo.id),
        fetchSummaries(companyInfo.id)
      ])
    }
    setRefreshing(false)
  }

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(['user_id', 'user_role'])
      if (onLogout) {
        onLogout()
      }
      navigation.navigate('Login')
    } catch (error) {
      Alert.alert('Error', 'Logout failed')
    }
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return 'No record'
    const date = new Date(timeString)
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const renderWorkerItem = ({ item }: { item: Worker }) => (
    <View style={[styles.workerItem, styles[`${item.status}Border`]]}>
      <View style={styles.workerInfo}>
        <Text style={styles.workerName}>{item.full_name}</Text>
        <Text style={styles.workerUsername}>@{item.username}</Text>
      </View>
      
      <View style={styles.workerStats}>
        <Text style={styles.hydrationText}>
          {item.hydration_today}ml / {item.target_ml}ml
        </Text>
        <Text style={[styles.percentageText, styles[`${item.status}Text`]]}>
          {item.percentage}%
        </Text>
        {item.last_hydration && (
          <Text style={styles.lastHydrationText}>
            Last: {formatTime(item.last_hydration)}
          </Text>
        )}
      </View>
      
      <View style={styles.workerActions}>
        <Button
          title="Warn"
          onPress={() => {
            setSelectedWorker(item)
            setSendWarningModal(true)
          }}
          buttonStyle={styles.warnButton}
          containerStyle={styles.warnButtonContainer}
        />
      </View>
    </View>
  )

  const renderWarningItem = ({ item }: { item: Warning }) => (
    <View style={styles.warningItem}>
      <View style={styles.warningHeader}>
        <Text style={styles.warningUser}>@{item.user_name}</Text>
        <Text style={styles.warningType}>{item.warning_type}</Text>
      </View>
      <Text style={styles.warningMessage}>{item.message}</Text>
      <Text style={styles.warningTime}>
        {formatTime(item.created_at)} • {formatDate(item.created_at)}
      </Text>
      <Button
        title="Acknowledge"
        onPress={() => acknowledgeWarning(item.id)}
        type="outline"
        containerStyle={styles.acknowledgeButton}
        titleStyle={styles.acknowledgeButtonText}
      />
    </View>
  )

  const renderSummaryItem = ({ item }: { item: CompanySummary }) => (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryDate}>{formatDate(item.date)}</Text>
      <View style={styles.summaryStats}>
        <Text style={styles.summaryStat}>Users: {item.total_users}</Text>
        <Text style={styles.summaryStat}>Active: {item.active_users}</Text>
        <Text style={styles.summaryStat}>Avg: {item.average_hydration_ml}ml</Text>
        <Text style={[styles.summaryStat, item.users_below_target > 0 ? styles.warningText : {}]}>
          Below: {item.users_below_target}
        </Text>
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading Manager Dashboard...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Manager Dashboard</Text>
          {companyInfo && (
            <Text style={styles.companyName}>{companyInfo.name}</Text>
          )}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Company Information Card */}
        {companyInfo && (
          <Card containerStyle={styles.card}>
            <Text style={styles.cardTitle}>Company Information</Text>
            <View style={styles.companyInfoContainer}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Company ID:</Text>
                <Text style={styles.infoValue}>{companyInfo.id}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>License Key:</Text>
                <Text style={styles.infoValue}>{companyInfo.license_key}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total Workers:</Text>
                <Text style={styles.infoValue}>{workers.length}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Statistics Overview Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Today's Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{workers.length}</Text>
              <Text style={styles.statLabel}>Total Workers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {workers.filter(w => w.hydration_today > 0).length}
              </Text>
              <Text style={styles.statLabel}>Active Today</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {workers.reduce((sum, w) => sum + w.hydration_today, 0)}
              </Text>
              <Text style={styles.statLabel}>Total ml</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {workers.filter(w => w.status === 'critical').length}
              </Text>
              <Text style={styles.statLabel}>Critical</Text>
            </View>
          </View>
          
          <Button
            title="Generate Daily Report"
            onPress={generateDailyReport}
            containerStyle={styles.generateReportButton}
            buttonStyle={styles.generateReportButtonInner}
          />
        </Card>

        {/* Workers List Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>
            Workers ({workers.length})
            <Text style={styles.subtitle}>
              {workers.filter(w => w.status === 'critical').length > 0 && 
                ` • ${workers.filter(w => w.status === 'critical').length} need attention`}
            </Text>
          </Text>
          
          {workers.length > 0 ? (
            <FlatList
              data={workers}
              renderItem={renderWorkerItem}
              keyExtractor={item => item.id.toString()}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No workers found</Text>
              }
            />
          ) : (
            <Text style={styles.emptyText}>No workers assigned to your company</Text>
          )}
        </Card>

        {/* Active Warnings Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>
            Active Warnings ({warnings.length})
          </Text>
          
          {warnings.length > 0 ? (
            <FlatList
              data={warnings}
              renderItem={renderWarningItem}
              keyExtractor={item => item.id.toString()}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.emptyText}>No active warnings</Text>
          )}
        </Card>

        {/* Recent Reports Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>
            Recent Daily Reports ({summaries.length})
          </Text>
          
          {summaries.length > 0 ? (
            <FlatList
              data={summaries}
              renderItem={renderSummaryItem}
              keyExtractor={item => item.id.toString()}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.emptyText}>No daily reports generated yet</Text>
          )}
        </Card>

        {/* Quick Actions */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <Button
              title="Refresh All Data"
              onPress={onRefresh}
              type="outline"
              containerStyle={styles.quickActionButton}
            />
            <Button
              title="View All Reports"
              onPress={() => Alert.alert('Info', 'All reports view coming soon')}
              type="outline"
              containerStyle={styles.quickActionButton}
            />
            <Button
              title="Export Data"
              onPress={() => Alert.alert('Info', 'Export feature coming soon')}
              type="outline"
              containerStyle={styles.quickActionButton}
            />
          </View>
        </Card>
      </ScrollView>

      {/* Send Warning Modal */}
      <Modal
        visible={sendWarningModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSendWarningModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Send Warning to {selectedWorker?.full_name}
            </Text>
            
            <Text style={styles.modalLabel}>Warning Type</Text>
            <View style={styles.warningTypeButtons}>
              {['dehydration', 'low_intake', 'inactivity', 'custom'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.warningTypeButton,
                    warningType === type && styles.warningTypeButtonActive
                  ]}
                  onPress={() => setWarningType(type as any)}
                >
                  <Text style={[
                    styles.warningTypeButtonText,
                    warningType === type && styles.warningTypeButtonTextActive
                  ]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={styles.modalLabel}>Message</Text>
            <TextInput
              style={styles.messageInput}
              value={warningMessage}
              onChangeText={setWarningMessage}
              placeholder="Enter warning message..."
              multiline
              numberOfLines={4}
            />
            
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => {
                  setSendWarningModal(false)
                  setWarningMessage('')
                  setWarningType('dehydration')
                }}
                type="outline"
                containerStyle={styles.modalButton}
              />
              <Button
                title="Send Warning"
                onPress={sendWarning}
                containerStyle={styles.modalButton}
                buttonStyle={styles.sendWarningButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  companyName: {
    fontSize: 14,
    color: '#2196F3',
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f44336',
    borderRadius: 6,
  },
  logoutText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  card: {
    borderRadius: 10,
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 0,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 14,
    color: '#f44336',
    fontWeight: 'normal',
  },
  companyInfoContainer: {
    marginTop: 5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 10,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  generateReportButton: {
    marginTop: 10,
  },
  generateReportButtonInner: {
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    paddingVertical: 12,
  },
  workerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  goodBorder: {
    borderLeftColor: '#4CAF50',
  },
  warningBorder: {
    borderLeftColor: '#FF9800',
  },
  criticalBorder: {
    borderLeftColor: '#f44336',
  },
  goodText: {
    color: '#4CAF50',
  },
  warningText: {
    color: '#FF9800',
  },
  criticalText: {
    color: '#f44336',
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  workerUsername: {
    fontSize: 12,
    color: '#666',
  },
  workerStats: {
    alignItems: 'flex-end',
    marginRight: 10,
  },
  hydrationText: {
    fontSize: 14,
    color: '#333',
  },
  percentageText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  lastHydrationText: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  workerActions: {
    marginLeft: 5,
  },
  warnButton: {
    backgroundColor: '#f44336',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  warnButtonContainer: {
    minWidth: 60,
  },
  warningItem: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: '#fff8e1',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd54f',
  },
  warningHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  warningUser: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  warningType: {
    fontSize: 12,
    color: '#f57c00',
    textTransform: 'capitalize',
    backgroundColor: '#ffe0b2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warningMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 5,
  },
  warningTime: {
    fontSize: 11,
    color: '#999',
    marginBottom: 10,
  },
  acknowledgeButton: {
    marginTop: 5,
  },
  acknowledgeButtonText: {
    color: '#2196F3',
    fontSize: 12,
  },
  summaryItem: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  summaryDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 10,
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryStat: {
    fontSize: 13,
    color: '#666',
    width: '48%',
    marginBottom: 5,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickActionButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 25,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
    marginTop: 15,
  },
  warningTypeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  warningTypeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  warningTypeButtonActive: {
    backgroundColor: '#2196F3',
  },
  warningTypeButtonText: {
    fontSize: 12,
    color: '#666',
  },
  warningTypeButtonTextActive: {
    color: 'white',
  },
  messageInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  sendWarningButton: {
    backgroundColor: '#f44336',
    borderRadius: 6,
  },
})