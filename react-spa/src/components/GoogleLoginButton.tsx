import React, { useEffect } from 'react';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

interface GoogleLoginButtonProps {
  onSuccess: (idToken: string) => void;
  disabled?: boolean;
}

const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onSuccess, disabled }) => {
  const { isLoaded, initGoogleAuth, renderGoogleButton } = useGoogleAuth();

  useEffect(() => {
    if (isLoaded && !disabled) {
      initGoogleAuth((response: any) => {
        onSuccess(response.credential);
      });
      renderGoogleButton('google-signin-btn');
    }
  }, [isLoaded, initGoogleAuth, renderGoogleButton, onSuccess, disabled]);

  return (
    <div className="w-full flex justify-center my-4">
      <div
        id="google-signin-btn"
        className={`${disabled ? 'opacity-50 pointer-events-none' : ''} w-full flex justify-center`}
      >
        {!isLoaded && !disabled && (
          <div className="w-full h-10 bg-slate-100 animate-pulse rounded-lg border border-slate-200"></div>
        )}
      </div>
    </div>
  );
};

export default GoogleLoginButton;
