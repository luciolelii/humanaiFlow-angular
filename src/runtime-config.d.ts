declare global {
  interface Window {
    __runtimeConfig?: {
      apiUrl?: string;
      assistantEnabled?: boolean;
      tourModeAlwaysOn?: boolean;
      turnstileEnabled?: boolean;
      turnstileSiteKey?: string;
    };
  }
}

export {};
