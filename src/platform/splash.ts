import * as SplashScreen from 'expo-splash-screen';

void SplashScreen.preventAutoHideAsync();

export function hideSplash(): void {
  void SplashScreen.hideAsync();
}
