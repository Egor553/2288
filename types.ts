
export type SlotMap = {
  [city: string]: string[]; // ISO Strings
};

export interface BookingData {
  type: 'Online' | 'Offline';
  city: string;
  slot: string; // Formatted date string
  full_name: string;
  phone: string;
  external_id?: string;
}

export enum Screen {
  CITY_SELECT = 'CITY_SELECT',
  CITY_RESULT = 'CITY_RESULT',
  CALENDAR = 'CALENDAR',
  BOOKING_FORM = 'BOOKING_FORM',
  MY_BOOKING = 'MY_BOOKING',
  ADMIN = 'ADMIN',
}

export interface UserActiveBooking {
  type: string;
  city: string;
  slot: string;
  timestamp: string;
}

export interface WebAppTheme {
  bg_color: string;
  text_color: string;
  hint_color: string;
  link_color: string;
  button_color: string;
  button_text_color: string;
  secondary_bg_color: string;
}

declare global {
  interface Window {
    Telegram: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          query_id?: string;
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
          };
          start_param?: string;
        };
        themeParams: WebAppTheme;
        ready: () => void;
        close: () => void;
        sendData: (data: string) => void;
        expand: () => void;
        showConfirm: (message: string, callback: (ok: boolean) => void) => void;
        showAlert: (message: string) => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
          offClick: (fn: () => void) => void;
          enable: () => void;
          disable: () => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}
