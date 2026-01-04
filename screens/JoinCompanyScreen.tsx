// screens/JoinCompanyScreen.tsx
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

export default function JoinCompanyScreen({ navigation }: any) {
  const [companyId, setCompanyId] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<number | null>(null)
  const [currentCompanyId, setCurrentCompanyId] = useState<number | null>(null)

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        // Get stored user_id from AsyncStorage
        const storedUserId = await AsyncStorage.getItem('user_id')
        
        if (storedUserId) {
          const userIdNum = parseInt(storedUserId)
          setUserId(userIdNum)
          
          // Check if user already has a company
          const { data: userData, error } = await supabase
            .from('users')
            .select('corporation_id')
            .eq('id', userIdNum)
            .single()
          
          if (!error && userData && userData.corporation_id) {
            setCurrentCompanyId(userData.corporation_id)
            
            // Get company name for display
            const { data: companyData } = await supabase
              .from('corporations')
              .select('name')
              .eq('id', userData.corporation_id)
              .single()
            
            if (companyData) {
              Alert.alert(
                'Already in Company',
                `You are already a member of ${companyData.name}. You must leave your current company before joining a new one.`,
                [{ text: 'OK' }]
              )
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error)
      }
    }
    
    fetchCurrentUser()
  }, [])

  const validateInputs = () => {
    if (!companyId.trim()) {
      Alert.alert('Input Required', 'Please enter Company ID')
      return false
    }
    
    if (!licenseKey.trim()) {
      Alert.alert('Input Required', 'Please enter License Key')
      return false
    }
    
    // Check if companyId is a valid number
    const idNumber = parseInt(companyId)
    if (isNaN(idNumber) || idNumber <= 0) {
      Alert.alert('Invalid Input', 'Company ID must be a positive number')
      return false
    }
    
    return true
  }

  const handleJoinCompany = async () => {
    if (!validateInputs()) return
    
    if (currentCompanyId) {
      Alert.alert(
        'Already in Company',
        'You are already a member of a company. Please leave your current company before joining a new one.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Leave Company', onPress: handleLeaveCompany }
        ]
      )
      return
    }
    
    setLoading(true)
    
    try {
      const companyIdNum = parseInt(companyId)
      
      // Step 1: Verify company exists and is active
      const { data: company, error: companyError } = await supabase
        .from('corporations')
        .select('id, name, license_key, is_active')
        .eq('id', companyIdNum)
        .eq('license_key', licenseKey.trim())
        .single()
      
      if (companyError || !company) {
        Alert.alert('Verification Failed', 'Invalid Company ID or License Key. Please check your inputs.')
        setLoading(false)
        return
      }
      
      if (!company.is_active) {
        Alert.alert('Company Inactive', 'This company is currently inactive. Please contact the company administrator.')
        setLoading(false)
        return
      }
      
      // Step 2: Check if user is already in a company (double-check)
      const { data: currentUser } = await supabase
        .from('users')
        .select('corporation_id')
        .eq('id', userId)
        .single()
      
      if (currentUser?.corporation_id) {
        Alert.alert('Already in Company', 'You are already a member of a company.')
        setLoading(false)
        return
      }
      
      // Step 3: Update user's corporation_id
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          corporation_id: company.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
      
      if (updateError) {
        console.error('Update error:', updateError)
        Alert.alert('Update Failed', 'Failed to join company: ' + updateError.message)
        setLoading(false)
        return
      }
      
      // Step 4: Update all existing hydration logs to include corporation_id
      const { error: logsError } = await supabase
        .from('hydration_logs')
        .update({
          corporation_id: company.id,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .is('corporation_id', null) // Only update logs without corporation_id
      
      if (logsError) {
        console.warn('Warning: Could not update existing hydration logs:', logsError.message)
        // Continue even if this fails
      }
      
      // Success
      Alert.alert(
        'Success!',
        `You have successfully joined ${company.name}.`,
        [
          { 
            text: 'Go to Dashboard', 
            onPress: () => {
              setCompanyId('')
              setLicenseKey('')
              navigation.navigate('Dashboard')
            }
          }
        ]
      )
      
    } catch (error: any) {
      console.error('Join company error:', error)
      Alert.alert('Error', 'An unexpected error occurred: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveCompany = async () => {
    if (!userId || !currentCompanyId) return
    
    Alert.alert(
      'Leave Company',
      'Are you sure you want to leave your current company? Your hydration data will be kept but will no longer be visible to company managers.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Leave Company', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true)
            try {
              // Remove corporation_id from user
              const { error: updateError } = await supabase
                .from('users')
                .update({ 
                  corporation_id: null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', userId)
              
              if (updateError) {
                Alert.alert('Error', 'Failed to leave company: ' + updateError.message)
                return
              }
              
              // Set corporation_id to null in hydration logs (optional, but keeps data private)
              const { error: logsError } = await supabase
                .from('hydration_logs')
                .update({
                  corporation_id: null,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .eq('corporation_id', currentCompanyId)
              
              if (logsError) {
                console.warn('Warning: Could not update hydration logs:', logsError.message)
              }
              
              setCurrentCompanyId(null)
              Alert.alert('Success', 'You have left the company.')
              
            } catch (error: any) {
              Alert.alert('Error', 'Failed to leave company: ' + error.message)
            } finally {
              setLoading(false)
            }
          }
        }
      ]
    )
  }

  const handleTestCredentials = () => {
    Alert.alert(
      'Test Credentials',
      'For testing purposes:\n\n' +
      '1. First, create a company in the Manager interface\n' +
      '2. Use the Company ID and License Key from that company\n\n' +
      'Or ask your manager for the credentials.',
      [{ text: 'OK' }]
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
        <View style={styles.header}>
          <Text style={styles.title}>Join a Company</Text>
          <Text style={styles.subtitle}>
            Enter your company credentials to join
          </Text>
        </View>

        <View style={styles.formContainer}>
          {currentCompanyId ? (
            <View style={styles.currentCompanyContainer}>
              <Text style={styles.currentCompanyTitle}>
                Current Company Status
              </Text>
              <Text style={styles.currentCompanyText}>
                You are already a member of a company. You must leave your current company before joining a new one.
              </Text>
              <Button
                title="Leave Current Company"
                onPress={handleLeaveCompany}
                loading={loading}
                buttonStyle={styles.leaveButton}
                containerStyle={styles.buttonContainer}
              />
            </View>
          ) : (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Company ID</Text>
                <Input
                  placeholder="Enter Company ID (e.g., 123)"
                  value={companyId}
                  onChangeText={setCompanyId}
                  keyboardType="numeric"
                  containerStyle={styles.inputContainer}
                  inputStyle={styles.input}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>License Key</Text>
                <Input
                  placeholder="Enter License Key"
                  value={licenseKey}
                  onChangeText={setLicenseKey}
                  secureTextEntry
                  containerStyle={styles.inputContainer}
                  inputStyle={styles.input}
                  placeholderTextColor="#999"
                />
              </View>

              <Text style={styles.instructions}>
                Your manager will provide you with the Company ID and License Key.
                These credentials are required to join your company's hydration tracking system.
              </Text>

              <Button
                title="Join Company"
                onPress={handleJoinCompany}
                loading={loading}
                disabled={loading || !companyId || !licenseKey}
                buttonStyle={styles.joinButton}
                containerStyle={styles.buttonContainer}
              />

              <Button
                title="Need Help?"
                type="outline"
                onPress={handleTestCredentials}
                containerStyle={styles.helpButton}
                titleStyle={styles.helpButtonText}
              />
            </>
          )}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Why join a company?</Text>
            <Text style={styles.infoText}>
              • Company managers can monitor team hydration{'\n'}
              • Receive alerts and reminders from your manager{'\n'}
              • Participate in company-wide hydration goals{'\n'}
              • Access company reports and statistics
            </Text>
          </View>

          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>
              ← Back to Dashboard
            </Text>
          </TouchableOpacity>
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
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  currentCompanyContainer: {
    backgroundColor: '#fff8e1',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ffd54f',
  },
  currentCompanyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f57c00',
    marginBottom: 10,
  },
  currentCompanyText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
    marginLeft: 5,
  },
  inputContainer: {
    paddingHorizontal: 0,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 25,
    padding: 10,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
  },
  joinButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
  },
  leaveButton: {
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingVertical: 14,
  },
  buttonContainer: {
    marginBottom: 15,
  },
  helpButton: {
    marginBottom: 25,
  },
  helpButtonText: {
    color: '#2196F3',
  },
  infoBox: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e7d32',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
  backLink: {
    alignItems: 'center',
    padding: 10,
  },
  backLinkText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '500',
  },
})