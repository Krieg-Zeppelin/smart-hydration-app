// screens/LoginScreen.tsx
import React, { useState } from 'react'
import { 
  View, 
  StyleSheet, 
  Alert, 
  Text, 
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native'
import { Button, Input } from '@rneui/themed'
import { supabase } from '../lib/supabase'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface LoginScreenProps {
  navigation: any
  onLogin: (userId: string, role: 'worker' | 'manager' | 'admin') => void
}

export default function LoginScreen({ navigation, onLogin }: LoginScreenProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)

  const validateForm = () => {
    if (!formData.username.trim()) {
      Alert.alert('错误', '用户名是必填项')
      return false
    }
    if (!formData.password.trim()) {
      Alert.alert('错误', '密码是必填项')
      return false
    }
    if (!isLogin) {
      if (!formData.fullName.trim()) {
        Alert.alert('错误', '全名是必填项')
        return false
      }
      if (formData.password !== formData.confirmPassword) {
        Alert.alert('错误', '两次输入的密码不一致')
        return false
      }
      if (formData.password.length < 6) {
        Alert.alert('错误', '密码必须至少6个字符')
        return false
      }
    }
    return true
  }

  const handleLogin = async () => {
    if (!validateForm()) return
    
    setLoading(true)
    
    try {
      // 直接从users表查询用户
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role, password, corporation_id, is_active')
        .eq('username', formData.username.trim())
        .eq('password', formData.password.trim()) // 明文密码比较
        .single()

      if (error || !data) {
        Alert.alert('登录失败', '用户名或密码错误')
        return
      }

      if (!data.is_active) {
        Alert.alert('账户已禁用', '您的账户已被禁用')
        return
      }

      // 检查用户是否有公司（工作角色需要）
      if (!data.corporation_id && data.role === 'worker') {
        const shouldProceed = await new Promise(resolve => {
          Alert.alert(
            '未分配公司',
            '您尚未分配到任何公司。是否要继续创建个人资料？',
            [
              { text: '取消', style: 'cancel', onPress: () => resolve(false) },
              { text: '继续', onPress: () => resolve(true) }
            ]
          )
        })
        
        if (!shouldProceed) return
      }

      // 登录成功 - 将用户数据传递给父组件
      onLogin(data.id.toString(), data.role)
      
      // 根据角色导航
      if (data.role === 'worker') {
        navigation.navigate('Dashboard')
      } else {
        navigation.navigate('Manager')
      }

    } catch (error: any) {
      Alert.alert('错误', error.message || '登录过程中发生错误')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    if (!validateForm()) return
    
    setLoading(true)
    
    try {
      // 检查用户名是否已存在
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', formData.username.trim())
        .single()

      if (existingUser) {
        Alert.alert('用户名已被占用', '该用户名已被使用')
        return
      }

      // 创建新用户（初始没有公司）
      const { data: newUser, error } = await supabase
        .from('users')
        .insert([
          {
            username: formData.username.trim(),
            password: formData.password.trim(),
            full_name: formData.fullName.trim(),
            role: 'worker', // 注册用户默认为worker角色
            corporation_id: null, // 初始为空，后续加入公司
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
            // 其他字段使用schema中的默认值
          }
        ])
        .select()
        .single()

      if (error) {
        Alert.alert('注册失败', error.message)
        return
      }

      // 创建默认用户设置
      await supabase
        .from('user_settings')
        .insert([
          {
            user_id: newUser.id,
            hydration_target_ml: 2000,
            reminders_enabled: true,
            activity_level: 'moderate',
            works_indoors: false
          }
        ])

      Alert.alert(
        '账户创建成功',
        '您的账户已成功创建！请使用新账户登录。',
        [{ text: '确定', onPress: () => setIsLogin(true) }]
      )

    } catch (error: any) {
      Alert.alert('错误', error.message || '注册过程中发生错误')
    } finally {
      setLoading(false)
    }
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
          <Icon name="app-store" size={60} color="#2196F3" />
          <Text style={styles.title}>智能水杯系统</Text>
          <Text style={styles.subtitle}>保持水分，保持高效</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>
            {isLogin ? '欢迎回来' : '创建账户'}
          </Text>

          {!isLogin && (
            <Input
              placeholder="全名"
              value={formData.fullName}
              onChangeText={(text) => setFormData({...formData, fullName: text})}
              leftIcon={<Icon name="account" size={20} color="#666" />}
              containerStyle={styles.inputContainer}
            />
          )}

          <Input
            placeholder="用户名"
            value={formData.username}
            onChangeText={(text) => setFormData({...formData, username: text})}
            autoCapitalize="none"
            leftIcon={<Icon name="account-circle" size={20} color="#666" />}
            containerStyle={styles.inputContainer}
          />

          <Input
            placeholder="密码"
            value={formData.password}
            onChangeText={(text) => setFormData({...formData, password: text})}
            secureTextEntry
            leftIcon={<Icon name="lock" size={20} color="#666" />}
            containerStyle={styles.inputContainer}
          />

          {!isLogin && (
            <Input
              placeholder="确认密码"
              value={formData.confirmPassword}
              onChangeText={(text) => setFormData({...formData, confirmPassword: text})}
              secureTextEntry
              leftIcon={<Icon name="lock-check" size={20} color="#666" />}
              containerStyle={styles.inputContainer}
            />
          )}

          <Button
            title={isLogin ? '登录' : '创建账户'}
            onPress={isLogin ? handleLogin : handleSignup}
            loading={loading}
            disabled={loading}
            buttonStyle={styles.primaryButton}
            containerStyle={styles.buttonContainer}
          />

          <TouchableOpacity 
            onPress={() => setIsLogin(!isLogin)}
            style={styles.toggleContainer}
          >
            <Text style={styles.toggleText}>
              {isLogin 
                ? "没有账户？立即注册" 
                : "已有账户？立即登录"}
            </Text>
          </TouchableOpacity>

          {isLogin && (
            <TouchableOpacity style={styles.demoContainer}>
              <Text style={styles.demoText}>
                演示账户：{'\n'}
                • 工人账户: worker1 / 114514{'\n'}
                • 经理账户: manager1 / 114514
              </Text>
            </TouchableOpacity>
          )}
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
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2196F3',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 25,
    textAlign: 'center',
    color: '#333',
  },
  inputContainer: {
    marginBottom: 15,
    paddingHorizontal: 0,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    paddingVertical: 14,
  },
  buttonContainer: {
    marginTop: 10,
    marginBottom: 20,
  },
  toggleContainer: {
    alignItems: 'center',
    padding: 10,
  },
  toggleText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '500',
  },
  demoContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  demoText: {
    color: '#1565c0',
    fontSize: 14,
    lineHeight: 20,
  },
})