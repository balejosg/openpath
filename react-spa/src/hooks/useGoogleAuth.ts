import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    google: any;
  }
}

export const useGoogleAuth = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch configuration to get Google Client ID
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/config');
        const config = await response.json();
        if (config.googleClientId) {
          setGoogleClientId(config.googleClientId);
        }
      } catch (error) {
        console.error('Error fetching googleClientId:', error);
      }
    };

    fetchConfig();

    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        setIsLoaded(true);
        clearInterval(interval);
      }
    }, 100);

    return () => { clearInterval(interval); };
  }, []);

  const initGoogleAuth = useCallback(
    (onSuccess: (response: any) => void) => {
      if (!isLoaded || !googleClientId) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: onSuccess,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
    },
    [isLoaded, googleClientId]
  );

  const renderGoogleButton = useCallback(
    (elementId: string) => {
      if (!isLoaded || !googleClientId) return;

      const element = document.getElementById(elementId);
      if (element) {
        window.google.accounts.id.renderButton(element, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        });
      }
    },
    [isLoaded, googleClientId]
  );

  return { isLoaded: isLoaded && !!googleClientId, initGoogleAuth, renderGoogleButton };
};