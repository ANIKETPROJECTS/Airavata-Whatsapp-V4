import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'airavata-auth-token';

export function getAuthToken(): Promise<string | null> {
  return Platform.OS === 'web'
    ? AsyncStorage.getItem(TOKEN_KEY)
    : SecureStore.getItemAsync(TOKEN_KEY);
}

export function saveAuthToken(token: string): Promise<void> {
  return Platform.OS === 'web'
    ? AsyncStorage.setItem(TOKEN_KEY, token)
    : SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearAuthToken(): Promise<void> {
  return Platform.OS === 'web'
    ? AsyncStorage.removeItem(TOKEN_KEY)
    : SecureStore.deleteItemAsync(TOKEN_KEY);
}
