import React, { useEffect } from 'react';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

interface GoogleLoginButtonProps {
    onSuccess: (token: string) => void;
    onError?: (error: string) => void;
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ onSuccess, onError }) => {
    const { initGoogleAuth, renderGoogleButton, isLoading } = useGoogleAuth();

    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            if (isLoading) return; // Wait for config to be loaded

            try {
                const initialized = await initGoogleAuth((response) => {
                    if (response.credential) {
                        onSuccess(response.credential);
                    } else {
                        // Handle case where credential is missing if that's even possible in success callback
                        console.error('No credential received from Google');
                    }
                });

                if (initialized && mounted) {
                    await renderGoogleButton('google-signin-btn');
                } else if (!initialized && onError) {
                    onError('Failed to initialize Google Auth');
                }
            } catch (err) {
                console.error('Error initializing Google Auth:', err);
                if (onError) onError('Error initializing Google Auth');
            }
        };

        initialize();

        return () => {
            mounted = false;
        };
    }, [initGoogleAuth, renderGoogleButton, onSuccess, onError, isLoading]);

    return (
        <div className="w-full flex justify-center mb-6">
            <div id="google-signin-btn"></div>
        </div>
    );
};
