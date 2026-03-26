declare global {
  interface Window {
    __runtimeConfig?: {
      turnstileSiteKey?: string;
    };
  }
}

export {};
