import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('import', {
      name: 'Importazione',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function sendImportNotification(
  totalAdded: number,
  fileCount: number,
  errorCount: number,
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const title = errorCount === 0
    ? 'Importazione completata ✓'
    : `Importazione completata (${errorCount} ${errorCount === 1 ? 'errore' : 'errori'})`;
  const body = totalAdded > 0
    ? `${totalAdded} transazioni importate da ${fileCount} ${fileCount === 1 ? 'file' : 'file'}.`
    : 'Nessuna nuova transazione trovata.';

  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}
