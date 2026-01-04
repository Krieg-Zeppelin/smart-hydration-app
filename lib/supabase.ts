import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://sfkzufqroeixoofpfxci.supabase.co"
const supabaseAnonKey = "sb_publishable_pUUTWLNWPNIRmMs593twaw_DnLqw69N"

const supabasepublickey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4cWZkbmRpb2Fqdm11dGZmc3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTg4MzgsImV4cCI6MjA4MDY5NDgzOH0.VOfCh0a6i8OI-TuMBRNk4lACKw5t9IBpifgPij9ri9I"

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})