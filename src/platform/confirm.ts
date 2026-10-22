import { Alert } from 'react-native';

import type { ConfirmRequest } from '@/platform/confirmTypes';

export function confirm(request: ConfirmRequest): void {
  Alert.alert(
    request.title,
    request.message,
    request.actions.map((action) => ({
      text: action.text,
      style: action.style,
      onPress: action.onPress,
    }))
  );
}

export function subscribeConfirm(_listener: (request: ConfirmRequest | null) => void): () => void {
  return () => undefined;
}

export function dismissConfirm(): void {
  // Alert.alert se cierra solo en Android.
}
