// screens/ProfileScreen.tsx
import React, { useState, useEffect } from 'react'
import { 
  View, 
  StyleSheet, 
  Alert, 
  Text, 
  ScrollView, 
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity
} from 'react-native'
import { Button, Input } from '@rneui/themed'
import { supabase } from '../lib/supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Slider from '@react-native-community/slider'

interface ProfileData {
  id: number
  username: string
  full_name: string
  role: 'worker' | 'manager' | 'admin'
  weight_kg: number | null
  height_cm: number | null
  age: number | null
  shift_start: string
  shift_end: string
  corporation_id: number | null
  corporation_name?: string
}

interface UserSettings {
  user_id: number
  hydration_target_ml: number
  additional_hydration_ml: number
  reminders_enabled: boolean
  max_reminders_per_day: number
  activity_level: 'light' | 'moderate' | 'heavy'
  works_indoors: boolean
  reminder_frequency_mins: number
}

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<ProfileData>({
    id: 0,
    username: '',
    full_name: '',
    role: 'worker',
    weight_kg: null,
    height_cm: null,
    age: null,
    shift_start: '08:00',
    shift_end: '17:00',
    corporation_id: null
  })
  
  const [settings, setSettings] = useState<UserSettings>({
    user_id: 0,
    hydration_target_ml: 2000,
    additional_hydration_ml: 0,
    reminders_enabled: true,
    max_reminders_per_day: 5,
    activity_level: 'moderate',
    works_indoors: false,
    reminder_frequency_mins: 15
  })
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)

  useEffect(() => {
    loadProfileData()
  }, [])

  const loadProfileData = async () => {
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
      
      // Load user profile
      await fetchUserProfile(userIdNum)
      
      // Load user settings
      await fetchUserSettings(userIdNum)
      
    } catch (error) {
      console.error('Error loading profile:', error)
      Alert.alert('Error', 'Failed to load profile data')
    } finally {
      setLoading(false)
    }
  }

  const fetchUserProfile = async (userId: number) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          id,
          username,
          full_name,
          role,
          weight_kg,
          height_cm,
          age,
          shift_start,
          shift_end,
          corporation_id,
          corporations!left (
            name
          )
        `)
        .eq('id', userId)
        .single()

      if (userError) {
        console.error('Error fetching user:', userError)
        throw userError
      }

      if (userData) {
        // Format shift times if they exist
        const shiftStart = userData.shift_start ? 
          userData.shift_start.slice(0, 5) : '08:00'
        const shiftEnd = userData.shift_end ? 
          userData.shift_end.slice(0, 5) : '17:00'

        setProfile({
          id: userData.id,
          username: userData.username,
          full_name: userData.full_name || '',
          role: userData.role,
          weight_kg: userData.weight_kg,
          height_cm: userData.height_cm,
          age: userData.age,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          corporation_id: userData.corporation_id,
          corporation_name: userData.corporations?.name
        })
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error)
      throw error
    }
  }

  const fetchUserSettings = async (userId: number) => {
    try {
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (settingsError) {
        // If no settings exist, create default settings
        console.log('No user settings found, creating default')
        await createDefaultSettings(userId)
        
        // Fetch the newly created settings
        const { data: newSettings } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .single()
          
        if (newSettings) {
          setSettings(newSettings)
        }
      } else if (settingsData) {
        setSettings(settingsData)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    }
  }

  const createDefaultSettings = async (userId: number) => {
    try {
      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: userId,
          hydration_target_ml: 2000,
          reminders_enabled: true,
          activity_level: 'moderate',
          works_indoors: false
        })

      if (error) throw error
    } catch (error) {
      console.error('Error creating default settings:', error)
    }
  }

  const validateForm = (): boolean => {
    // Validate required fields
    if (!profile.full_name.trim()) {
      Alert.alert('Validation Error', 'Full name is required')
      return false
    }

    // Validate weight if provided
    if (profile.weight_kg !== null && (profile.weight_kg <= 0 || profile.weight_kg > 300)) {
      Alert.alert('Validation Error', 'Weight must be between 1 and 300 kg')
      return false
    }

    // Validate height if provided
    if (profile.height_cm !== null && (profile.height_cm <= 0 || profile.height_cm > 250)) {
      Alert.alert('Validation Error', 'Height must be between 1 and 250 cm')
      return false
    }

    // Validate age if provided
    if (profile.age !== null && (profile.age < 1 || profile.age > 120)) {
      Alert.alert('Validation Error', 'Age must be between 1 and 120 years')
      return false
    }

    // Validate shift times
    if (!isValidTime(profile.shift_start) || !isValidTime(profile.shift_end)) {
      Alert.alert('Validation Error', 'Shift times must be in HH:MM format')
      return false
    }

    // Validate hydration target
    if (settings.hydration_target_ml < 500 || settings.hydration_target_ml > 5000) {
      Alert.alert('Validation Error', 'Hydration target must be between 500 and 5000 ml')
      return false
    }

    return true
  }

  const isValidTime = (time: string): boolean => {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
    return timeRegex.test(time)
  }

  const saveProfile = async () => {
    if (!validateForm()) return
    
    if (!userId) {
      Alert.alert('Error', 'User ID not found')
      return
    }
    
    setSaving(true)
    
    try {
      // Update user profile
      const { error: profileError } = await supabase
        .from('users')
        .update({
          full_name: profile.full_name.trim(),
          weight_kg: profile.weight_kg || null,
          height_cm: profile.height_cm || null,
          age: profile.age || null,
          shift_start: profile.shift_start + ':00',
          shift_end: profile.shift_end + ':00',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (profileError) {
        console.error('Error updating profile:', profileError)
        Alert.alert('Update Error', 'Failed to update profile: ' + profileError.message)
        return
      }

      // Update user settings
      const { error: settingsError } = await supabase
        .from('user_settings')
        .update({
          hydration_target_ml: settings.hydration_target_ml,
          additional_hydration_ml: settings.additional_hydration_ml,
          reminders_enabled: settings.reminders_enabled,
          max_reminders_per_day: settings.max_reminders_per_day,
          activity_level: settings.activity_level,
          works_indoors: settings.works_indoors,
          reminder_frequency_mins: settings.reminder_frequency_mins,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (settingsError) {
        console.error('Error updating settings:', settingsError)
        Alert.alert('Update Error', 'Failed to update settings: ' + settingsError.message)
        return
      }

      Alert.alert('Success', 'Profile updated successfully')
      navigation.goBack()
      
    } catch (error) {
      console.error('Error saving profile:', error)
      Alert.alert('Error', 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const calculateRecommendedTarget = () => {
    // Simple calculation based on weight and activity level
    const base = 30 * (profile.weight_kg || 70) // 30ml per kg
    let multiplier = 1
    
    switch (settings.activity_level) {
      case 'light': multiplier = 1; break
      case 'moderate': multiplier = 1.2; break
      case 'heavy': multiplier = 1.5; break
    }
    
    if (settings.works_indoors === false) {
      multiplier += 0.2 // Add 20% for outdoor work
    }
    
    const recommended = Math.round(base * multiplier)
    return Math.min(Math.max(recommended, 1500), 4000) // Keep within reasonable bounds
  }

  const applyRecommendedTarget = () => {
    const recommended = calculateRecommendedTarget()
    setSettings(prev => ({ ...prev, hydration_target_ml: recommended }))
    Alert.alert('Target Updated', `Hydration target set to ${recommended}ml based on your profile`)
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading profile...</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Profile Settings</Text>
          <View style={styles.placeholder} />
        </View>

        {/* User Information Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Username:</Text>
            <Text style={styles.infoValue}>{profile.username}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role:</Text>
            <Text style={styles.infoValue}>{profile.role}</Text>
          </View>
          
          {profile.corporation_name && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Company:</Text>
              <Text style={styles.infoValue}>{profile.corporation_name}</Text>
            </View>
          )}
        </View>

        {/* Basic Information Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Basic Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name *</Text>
            <Input
              placeholder="Enter your full name"
              value={profile.full_name}
              onChangeText={(text) => setProfile({...profile, full_name: text})}
              containerStyle={styles.inputContainer}
              inputStyle={styles.input}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <Input
                placeholder="e.g., 70"
                value={profile.weight_kg?.toString() || ''}
                onChangeText={(text) => {
                  const num = text === '' ? null : parseFloat(text)
                  setProfile({...profile, weight_kg: num})
                }}
                keyboardType="numeric"
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Height (cm)</Text>
              <Input
                placeholder="e.g., 175"
                value={profile.height_cm?.toString() || ''}
                onChangeText={(text) => {
                  const num = text === '' ? null : parseInt(text)
                  setProfile({...profile, height_cm: num})
                }}
                keyboardType="numeric"
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.inputLabel}>Age</Text>
              <Input
                placeholder="e.g., 30"
                value={profile.age?.toString() || ''}
                onChangeText={(text) => {
                  const num = text === '' ? null : parseInt(text)
                  setProfile({...profile, age: num})
                }}
                keyboardType="numeric"
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]} />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.inputLabel}>Shift Start</Text>
              <Input
                placeholder="HH:MM"
                value={profile.shift_start}
                onChangeText={(text) => setProfile({...profile, shift_start: text})}
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Shift End</Text>
              <Input
                placeholder="HH:MM"
                value={profile.shift_end}
                onChangeText={(text) => setProfile({...profile, shift_end: text})}
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>
          </View>
        </View>

        {/* Hydration Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hydration Settings</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Daily Hydration Target: {settings.hydration_target_ml}ml
            </Text>
            <View style={styles.sliderContainer}>
              <Slider
                style={styles.slider}
                minimumValue={500}
                maximumValue={5000}
                step={100}
                value={settings.hydration_target_ml}
                onValueChange={(value) => setSettings({...settings, hydration_target_ml: value})}
                minimumTrackTintColor="#2196F3"
                maximumTrackTintColor="#e0e0e0"
                thumbTintColor="#2196F3"
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>500ml</Text>
                <Text style={styles.sliderLabel}>2500ml</Text>
                <Text style={styles.sliderLabel}>5000ml</Text>
              </View>
            </View>
            
            <Button
              title="Calculate Recommended Target"
              onPress={applyRecommendedTarget}
              type="outline"
              containerStyle={styles.calculateButton}
              titleStyle={styles.calculateButtonText}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Additional Hydration (ml)</Text>
            <Input
              placeholder="Extra hydration based on conditions"
              value={settings.additional_hydration_ml.toString()}
              onChangeText={(text) => {
                const num = parseInt(text) || 0
                setSettings({...settings, additional_hydration_ml: num})
              }}
              keyboardType="numeric"
              containerStyle={styles.inputContainer}
              inputStyle={styles.input}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.inputLabel}>Activity Level</Text>
              <View style={styles.radioGroup}>
                {['light', 'moderate', 'heavy'].map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.radioButton,
                      settings.activity_level === level && styles.radioButtonSelected
                    ]}
                    onPress={() => setSettings({...settings, activity_level: level as any})}
                  >
                    <Text style={[
                      styles.radioButtonText,
                      settings.activity_level === level && styles.radioButtonTextSelected
                    ]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Work Environment</Text>
              <TouchableOpacity
                style={styles.toggleContainer}
                onPress={() => setSettings({...settings, works_indoors: !settings.works_indoors})}
              >
                <View style={[
                  styles.toggle,
                  settings.works_indoors ? styles.toggleOn : styles.toggleOff
                ]}>
                  <View style={styles.toggleCircle} />
                </View>
                <Text style={styles.toggleLabel}>
                  {settings.works_indoors ? 'Indoors' : 'Outdoors'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.inputLabel}>Max Reminders/Day</Text>
              <Input
                placeholder="Max 10"
                value={settings.max_reminders_per_day.toString()}
                onChangeText={(text) => {
                  const num = Math.min(parseInt(text) || 1, 10)
                  setSettings({...settings, max_reminders_per_day: num})
                }}
                keyboardType="numeric"
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Reminder Frequency (min)</Text>
              <Input
                placeholder="Minutes"
                value={settings.reminder_frequency_mins.toString()}
                onChangeText={(text) => {
                  const num = Math.max(parseInt(text) || 15, 5)
                  setSettings({...settings, reminder_frequency_mins: num})
                }}
                keyboardType="numeric"
                containerStyle={styles.inputContainer}
                inputStyle={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <TouchableOpacity
              style={styles.reminderToggle}
              onPress={() => setSettings({...settings, reminders_enabled: !settings.reminders_enabled})}
            >
              <View style={[
                styles.reminderToggleCircle,
                settings.reminders_enabled ? styles.reminderToggleOn : styles.reminderToggleOff
              ]}>
                {settings.reminders_enabled && <Text style={styles.reminderToggleText}>✓</Text>}
              </View>
              <Text style={styles.reminderToggleLabel}>
                Enable Hydration Reminders
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Button */}
        <Button
          title="Save Changes"
          onPress={saveProfile}
          loading={saving}
          disabled={saving}
          buttonStyle={styles.saveButton}
          containerStyle={styles.saveButtonContainer}
        />

        {/* Stats Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profile Statistics</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {settings.hydration_target_ml + settings.additional_hydration_ml}
              </Text>
              <Text style={styles.statLabel}>Total Daily Target (ml)</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {calculateRecommendedTarget()}
              </Text>
              <Text style={styles.statLabel}>Recommended Target (ml)</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {settings.reminders_enabled ? 'On' : 'Off'}
              </Text>
              <Text style={styles.statLabel}>Reminders</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {settings.activity_level}
              </Text>
              <Text style={styles.statLabel}>Activity Level</Text>
            </View>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Profile Information</Text>
          <Text style={styles.infoText}>
            • Your profile information is used to calculate personalized hydration targets{'\n'}
            • Shift times help schedule reminders during your work hours{'\n'}
            • Activity level and work environment affect your hydration needs{'\n'}
            • You can always update your settings based on your needs
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContainer: {
    paddingBottom: 30,
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
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 60, // To balance the header layout
  },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 20,
    borderRadius: 10,
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
    marginBottom: 20,
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
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    paddingHorizontal: 0,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderContainer: {
    marginTop: 5,
    marginBottom: 15,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#666',
  },
  calculateButton: {
    marginTop: 10,
  },
  calculateButtonText: {
    color: '#2196F3',
    fontSize: 14,
  },
  radioGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  radioButton: {
    flex: 1,
    marginHorizontal: 2,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    alignItems: 'center',
  },
  radioButtonSelected: {
    backgroundColor: '#2196F3',
  },
  radioButtonText: {
    fontSize: 12,
    color: '#666',
  },
  radioButtonTextSelected: {
    color: 'white',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    padding: 2,
  },
  toggleOn: {
    backgroundColor: '#4CAF50',
  },
  toggleOff: {
    backgroundColor: '#e0e0e0',
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    transform: [{ translateX: 2 }],
  },
  toggleLabel: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
  },
  reminderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  reminderToggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  reminderToggleOn: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  reminderToggleOff: {
    borderColor: '#999',
    backgroundColor: 'white',
  },
  reminderToggleText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  reminderToggleLabel: {
    fontSize: 14,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
  },
  saveButtonContainer: {
    marginHorizontal: 15,
    marginTop: 20,
    marginBottom: 10,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#e3f2fd',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1565c0',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 22,
  },
})