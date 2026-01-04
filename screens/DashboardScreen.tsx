// screens/DashboardScreen.tsx
import React, { useState, useEffect } from 'react'
import { 
  View, 
  StyleSheet, 
  Alert, 
  Text, 
  ScrollView, 
  RefreshControl,
  TouchableOpacity
} from 'react-native'
import { Button, Card } from '@rneui/themed'
import { supabase } from '../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface HydrationData {
  total_today: number
  target: number
  last_log: string | null
  daily_average: number
}

interface UserData {
  id: number
  username: string
  full_name: string
  role: 'worker' | 'manager' | 'admin'
  corporation_id: number | null
  corporation_name?: string
}

export default function DashboardScreen({ navigation, onLogout }: any) {
  const [hydration, setHydration] = useState<HydrationData>({
    total_today: 0,
    target: 2000,
    last_log: null,
    daily_average: 0,
  })
  
  const [userData, setUserData] = useState<UserData | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUserData()
  }, [])

  useEffect(() => {
  const testConnection = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    if (error) {
      console.error('Supabase connection error:', error)
      Alert.alert('Database Error', error.message)
    } else {
      console.log('Supabase connected successfully')
    }
  }
  testConnection()
}, [])


  const loadUserData = async () => {
    try {
      // Get stored user_id from AsyncStorage
      const storedUserId = await AsyncStorage.getItem('user_id')
      
      if (!storedUserId) {
        Alert.alert('Error', 'User not logged in')
        navigation.navigate('Login')
        return
      }
      
      const userIdNum = parseInt(storedUserId)
      setUserId(userIdNum)
      
      // Fetch user data
      await fetchUserData(userIdNum)
      // Fetch hydration data
      await fetchHydrationData(userIdNum)
      
    } catch (error) {
      console.error('Error loading user data:', error)
      Alert.alert('Error', 'Failed to load user data')
    } finally {
      setLoading(false)
    }
  }

  const fetchUserData = async (userId: number) => {
    try {
      // First get user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, username, full_name, role, corporation_id')
        .eq('id', userId)
        .single()

      if (userError) {
        console.error('Error fetching user:', userError)
        throw userError
      }

      let corporationName = null
      
      // If user has a corporation, fetch corporation name
      if (userData.corporation_id) {
        const { data: corpData, error: corpError } = await supabase
          .from('corporations')
          .select('name')
          .eq('id', userData.corporation_id)
          .single()

        if (!corpError && corpData) {
          corporationName = corpData.name
        }
      }

      const userInfo: UserData = {
        id: userData.id,
        username: userData.username,
        full_name: userData.full_name,
        role: userData.role,
        corporation_id: userData.corporation_id,
        corporation_name: corporationName
      }
      
      setUserData(userInfo)
      
    } catch (error) {
      console.error('Error fetching user data:', error)
      throw error
    }
  }

  const fetchHydrationData = async (userId: number) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Get today's hydration logs
      const { data: logs, error: logsError } = await supabase
        .from('hydration_logs')
        .select('amount_ml, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', `${today}T00:00:00`)
        .lte('logged_at', `${today}T23:59:59`)
        .order('logged_at', { ascending: false })

      if (logsError) {
        console.error('Error fetching logs:', logsError)
        throw logsError
      }

      // Calculate total for today
      const totalToday = logs?.reduce((sum, log) => sum + log.amount_ml, 0) || 0
      const lastLog = logs && logs.length > 0 ? logs[0].logged_at : null

      // Get user settings for target
      const { data: settings, error: settingsError } = await supabase
        .from('user_settings')
        .select('hydration_target_ml')
        .eq('user_id', userId)
        .single()

      let target = 2000 // Default
      if (settingsError) {
        console.warn('No user settings found, using default target')
      } else if (settings) {
        target = settings.hydration_target_ml || 2000
      }

      // Calculate 7-day average
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weekAgoStr = weekAgo.toISOString()

      const { data: weekLogs, error: weekError } = await supabase
        .from('hydration_logs')
        .select('amount_ml, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', weekAgoStr)
        .lte('logged_at', new Date().toISOString())

      let dailyAverage = 0
      if (!weekError && weekLogs && weekLogs.length > 0) {
        const weekTotal = weekLogs.reduce((sum, log) => sum + log.amount_ml, 0)
        const days = Math.max(Math.ceil((new Date().getTime() - new Date(weekAgoStr).getTime()) / (1000 * 60 * 60 * 24)), 1)
        dailyAverage = Math.round(weekTotal / days)
      }

      setHydration({
        total_today: totalToday,
        target: target,
        last_log: lastLog,
        daily_average: dailyAverage
      })

    } catch (error) {
      console.error('Error fetching hydration data:', error)
      throw error
    }
  }

  const logHydration = async (amount: number) => {
    if (!userId || !userData) {
      Alert.alert('Error', 'User data not loaded')
      return
    }

    try {
      // Check if user has corporation_id
      if (!userData.corporation_id) {
        Alert.alert('Warning', 'You are not assigned to a company. Logging personal hydration only.')
      }

      const { error } = await supabase
        .from('hydration_logs')
        .insert({
          user_id: userId,
          corporation_id: userData.corporation_id, // This can be null
          amount_ml: amount,
          source_type: 'manual',
          logged_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })

      if (error) {
        console.error('Error logging hydration:', error)
        Alert.alert('Error', 'Failed to log hydration: ' + error.message)
      } else {
        Alert.alert('Success', `Logged ${amount}ml of hydration`)
        // Refresh data
        await fetchHydrationData(userId)
      }
    } catch (error: any) {
      console.error('Error:', error)
      Alert.alert('Error', 'Failed to log hydration')
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    if (userId) {
      try {
        await Promise.all([
          fetchUserData(userId),
          fetchHydrationData(userId)
        ])
      } catch (error) {
        Alert.alert('Error', 'Failed to refresh data')
      }
    }
    setRefreshing(false)
  }

  const formatTime = (timeString: string | null) => {
    if (!timeString) return 'No records'
    const date = new Date(timeString)
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (timeString: string | null) => {
    if (!timeString) return ''
    const date = new Date(timeString)
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric' 
    })
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

  const calculateProgress = () => {
    return Math.min(hydration.total_today / hydration.target, 1)
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    )
  }

  const progress = calculateProgress()
  const progressPercentage = Math.round(progress * 100)
  const progressColor = progress >= 0.75 ? '#4CAF50' : 
                       progress >= 0.5 ? '#2196F3' : 
                       '#FF9800'

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>
            Welcome, {userData?.username}
          </Text>
          {userData?.corporation_name ? (
            <Text style={styles.companyText}>
              Company: {userData.corporation_name}
            </Text>
          ) : (
            <Text style={styles.noCompanyText}>
              Not assigned to a company
            </Text>
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
        {/* Today's Hydration Progress Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Today's Hydration Progress</Text>
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.amountText}>
                {hydration.total_today}ml / {hydration.target}ml
              </Text>
              <Text style={[styles.percentageText, { color: progressColor }]}>
                {progressPercentage}%
              </Text>
            </View>
            
            <View style={styles.progressBarContainer}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    width: `${progressPercentage}%`,
                    backgroundColor: progressColor
                  }
                ]} 
              />
            </View>
            
            <View style={styles.progressStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Today:</Text>
                <Text style={styles.statValue}>{hydration.total_today}ml</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Daily Average:</Text>
                <Text style={styles.statValue}>{hydration.daily_average}ml</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Last Log:</Text>
                <Text style={styles.statValue}>{formatTime(hydration.last_log)}</Text>
              </View>
            </View>
            
            {hydration.last_log && (
              <View style={styles.lastLogDate}>
                <Text style={styles.dateText}>
                  {formatDate(hydration.last_log)}
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Quick Log Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Quick Hydration Log</Text>
          <Text style={styles.cardSubtitle}>Tap to log water intake</Text>
          
          <View style={styles.quickLogContainer}>
            <View style={styles.quickLogRow}>
              <Button
                title="100ml"
                containerStyle={styles.quickLogButton}
                buttonStyle={[styles.quickLogButtonInner, { backgroundColor: '#e3f2fd' }]}
                titleStyle={styles.quickLogButtonText}
                onPress={() => logHydration(100)}
              />
              <Button
                title="250ml"
                containerStyle={styles.quickLogButton}
                buttonStyle={[styles.quickLogButtonInner, { backgroundColor: '#bbdefb' }]}
                titleStyle={styles.quickLogButtonText}
                onPress={() => logHydration(250)}
              />
            </View>
            
            <View style={styles.quickLogRow}>
              <Button
                title="500ml"
                containerStyle={styles.quickLogButton}
                buttonStyle={[styles.quickLogButtonInner, { backgroundColor: '#90caf9' }]}
                titleStyle={styles.quickLogButtonText}
                onPress={() => logHydration(500)}
              />
              <Button
                title="1000ml"
                containerStyle={styles.quickLogButton}
                buttonStyle={[styles.quickLogButtonInner, { backgroundColor: '#64b5f6' }]}
                titleStyle={styles.quickLogButtonText}
                onPress={() => logHydration(1000)}
              />
            </View>
          </View>
        </Card>

        {/* Custom Log Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Custom Hydration Log</Text>
          <Text style={styles.cardSubtitle}>Enter custom amount in milliliters</Text>
          
          <Button
            title="Log Custom Amount"
            type="outline"
            containerStyle={styles.customButton}
            titleStyle={styles.customButtonText}
            onPress={() => {
              Alert.prompt(
                'Log Hydration',
                'Enter amount in milliliters (ml):',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Log', 
                    onPress: (amount) => {
                      if (amount && !isNaN(parseInt(amount)) && parseInt(amount) > 0) {
                        logHydration(parseInt(amount))
                      } else if (amount) {
                        Alert.alert('Invalid Input', 'Please enter a valid positive number')
                      }
                    }
                  }
                ],
                'plain-text',
                '',
                'numeric'
              )
            }}
          />
        </Card>

        {/* Menu Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Menu</Text>
          
          <View style={styles.menuContainer}>
            <Button
              title="Personal Settings"
              type="clear"
              titleStyle={styles.menuButtonText}
              containerStyle={styles.menuButton}
              onPress={() => Alert.alert('Info', 'Personal settings feature coming soon')}
            />

            
            
            {!userData?.corporation_id && (
              <Button
                title="Join a Company"
                type="clear"
                titleStyle={styles.menuButtonText}
                containerStyle={styles.menuButton}
                onPress={() => navigation.navigate('JoinCompany')}
              />
            )}

            <Button
                title="Profile Settings"
                type="clear"
                titleStyle={styles.menuButtonText}
                containerStyle={styles.menuButton}
                onPress={() => navigation.navigate('Profile')}
            />
            
            <Button
              title="View History"
              type="clear"
              titleStyle={styles.menuButtonText}
              containerStyle={styles.menuButton}
              onPress={() => Alert.alert('Info', 'History feature coming soon')}
            />
            
            <Button
              title="Health Tips"
              type="clear"
              titleStyle={styles.menuButtonText}
              containerStyle={styles.menuButton}
              onPress={() => Alert.alert('Health Tips', 'Drink at least 8 glasses (2 liters) of water daily. Increase intake during physical activity.')}
            />
          </View>
        </Card>

        {/* Status Card */}
        <Card containerStyle={styles.card}>
          <Text style={styles.cardTitle}>Your Status</Text>
          
          <View style={styles.statusContainer}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Role:</Text>
              <Text style={styles.statusValue}>{userData?.role}</Text>
            </View>
            
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Full Name:</Text>
              <Text style={styles.statusValue}>{userData?.full_name}</Text>
            </View>
            
            {userData?.corporation_id ? (
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Company ID:</Text>
                <Text style={styles.statusValue}>{userData.corporation_id}</Text>
              </View>
            ) : (
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Company:</Text>
                <Text style={[styles.statusValue, { color: '#FF9800' }]}>Not joined</Text>
              </View>
            )}
            
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Hydration Target:</Text>
              <Text style={styles.statusValue}>{hydration.target}ml/day</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
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
  welcomeSection: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  companyText: {
    fontSize: 14,
    color: '#2196F3',
    marginTop: 2,
  },
  noCompanyText: {
    fontSize: 14,
    color: '#FF9800',
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
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  progressContainer: {
    marginTop: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  percentageText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBar: {
    height: '100%',
    borderRadius: 5,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  lastLogDate: {
    marginTop: 5,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },
  quickLogContainer: {
    marginTop: 10,
  },
  quickLogRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quickLogButton: {
    width: '48%',
  },
  quickLogButtonInner: {
    borderRadius: 8,
    paddingVertical: 12,
  },
  quickLogButtonText: {
    color: '#1565C0',
    fontWeight: '500',
  },
  customButton: {
    marginTop: 10,
  },
  customButtonText: {
    color: '#2196F3',
  },
  menuContainer: {
    marginTop: 5,
  },
  menuButton: {
    marginBottom: 8,
  },
  menuButtonText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'left',
  },
  statusContainer: {
    marginTop: 10,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
})