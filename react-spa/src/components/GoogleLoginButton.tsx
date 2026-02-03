import React, { useEffect, useState } from 'react';
import { useGoogleAuth, GoogleCredentialResponse } from '../hooks/useGoogleAuth';
import '../types/google.d'; // Import for global Window type augmentation

interface GoogleLoginButtonProps {
  onSuccess: (idToken: string) => void;
  disabled?: boolean;
}

const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onSuccess, disabled }) => {
  const { isLoaded, initGoogleAuth, renderGoogleButton } = useGoogleAuth();
  const [buttonRendered, setButtonRendered] = useState(false);

  useEffect(() => {
    if (isLoaded && !disabled) {
      initGoogleAuth((response: GoogleCredentialResponse) => {
        onSuccess(response.credential);
      });
      renderGoogleButton('google-signin-btn');
      // Give Google a moment to render
      const checkRendered = setTimeout(() => {
        const container = document.getElementById('google-signin-btn');
        if (container?.querySelector('iframe, div[role="button"]')) {
          setButtonRendered(true);
        }
      }, 500);
      return () => {
        clearTimeout(checkRendered);
      };
    }
    return undefined;
  }, [isLoaded, initGoogleAuth, renderGoogleButton, onSuccess, disabled]);

  // Show fallback button if Google button doesn't render within timeout
  const showFallback = !buttonRendered && isLoaded;

  return (
    <div className="w-full flex justify-center my-4" data-testid="google-login-container">
      <div
        id="google-signin-btn"
        data-testid="google-signin-btn"
        className={`${disabled === true ? 'opacity-50 pointer-events-none' : ''} w-full flex justify-center`}
      >
        {!isLoaded && disabled !== true && (
          <div
            className="w-full h-10 bg-slate-100 animate-pulse rounded-lg border border-slate-200"
            aria-label="Cargando botón de Google..."
          />
        )}
        {showFallback && (
          <button
            type="button"
            className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-slate-700 font-medium"
            onClick={() => {
              // Trigger Google One Tap as fallback
              window.google?.accounts.id.prompt();
            }}
            data-testid="google-fallback-btn"
            aria-label="Iniciar sesión con Google"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar con Google
          </button>
        )}
      </div>
    </div>
  );
};

export default GoogleLoginButton;
