export type ConfirmAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type ConfirmRequest = {
  title: string;
  message?: string;
  actions: ConfirmAction[];
};
