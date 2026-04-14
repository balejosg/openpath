import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppAuthContent from '../app-auth-content';

const testDoubles = vi.hoisted(() => ({
  loginProps: vi.fn(),
  registerProps: vi.fn(),
  forgotProps: vi.fn(),
  resetProps: vi.fn(),
}));

function getLastProps(mockFn: { mock: { calls: unknown[][] } }): unknown {
  const calls = mockFn.mock.calls;
  const lastCall = calls.at(-1);
  if (!lastCall) {
    throw new Error('Expected mock to be called');
  }
  return lastCall[0];
}

vi.mock('../views/Login', () => ({
  default: (props: unknown) => {
    testDoubles.loginProps(props);
    return <div>Login view</div>;
  },
}));

vi.mock('../views/Register', () => ({
  default: (props: unknown) => {
    testDoubles.registerProps(props);
    return <div>Register view</div>;
  },
}));

vi.mock('../views/ForgotPassword', () => ({
  default: (props: unknown) => {
    testDoubles.forgotProps(props);
    return <div>Forgot view</div>;
  },
}));

vi.mock('../views/ResetPassword', () => ({
  default: (props: unknown) => {
    testDoubles.resetProps(props);
    return <div>Reset view</div>;
  },
}));

describe('AppAuthContent', () => {
  it('renders login by default and wires auth navigation callbacks', () => {
    const onLogin = vi.fn();
    const onRegister = vi.fn();
    const onSelectAuthView = vi.fn();

    render(
      <AppAuthContent
        authView="login"
        onLogin={onLogin}
        onRegister={onRegister}
        onSelectAuthView={onSelectAuthView}
      />
    );

    expect(screen.getByText('Login view')).toBeInTheDocument();
    const props = getLastProps(testDoubles.loginProps) as {
      onLogin: () => void;
      onNavigateToRegister: () => void;
      onNavigateToForgot: () => void;
    };
    expect(props.onLogin).toBe(onLogin);
    expect(typeof props.onNavigateToRegister).toBe('function');
    expect(typeof props.onNavigateToForgot).toBe('function');
    props.onNavigateToRegister();
    props.onNavigateToForgot();

    expect(onSelectAuthView).toHaveBeenNthCalledWith(1, 'register');
    expect(onSelectAuthView).toHaveBeenNthCalledWith(2, 'forgot-password');
  });

  it('renders register and forwards register/login callbacks', () => {
    const onRegister = vi.fn();
    const onSelectAuthView = vi.fn();

    render(
      <AppAuthContent
        authView="register"
        onLogin={vi.fn()}
        onRegister={onRegister}
        onSelectAuthView={onSelectAuthView}
      />
    );

    expect(screen.getByText('Register view')).toBeInTheDocument();
    const props = getLastProps(testDoubles.registerProps) as {
      onRegister: () => void;
      onNavigateToLogin: () => void;
    };
    expect(props.onRegister).toBe(onRegister);
    expect(typeof props.onNavigateToLogin).toBe('function');
    props.onNavigateToLogin();
    expect(onSelectAuthView).toHaveBeenCalledWith('login');
  });

  it('renders forgot and reset flows with the expected navigation', () => {
    const onSelectAuthView = vi.fn();

    const { rerender } = render(
      <AppAuthContent
        authView="forgot-password"
        onLogin={vi.fn()}
        onRegister={vi.fn()}
        onSelectAuthView={onSelectAuthView}
      />
    );

    expect(screen.getByText('Forgot view')).toBeInTheDocument();
    const forgotProps = getLastProps(testDoubles.forgotProps) as {
      onNavigateToLogin: () => void;
      onNavigateToReset: () => void;
    };
    forgotProps.onNavigateToLogin();
    forgotProps.onNavigateToReset();

    rerender(
      <AppAuthContent
        authView="reset-password"
        onLogin={vi.fn()}
        onRegister={vi.fn()}
        onSelectAuthView={onSelectAuthView}
      />
    );

    expect(screen.getByText('Reset view')).toBeInTheDocument();
    const resetProps = getLastProps(testDoubles.resetProps) as {
      onNavigateToLogin: () => void;
      onNavigateToForgot: () => void;
    };
    resetProps.onNavigateToLogin();
    resetProps.onNavigateToForgot();

    expect(onSelectAuthView).toHaveBeenNthCalledWith(1, 'login');
    expect(onSelectAuthView).toHaveBeenNthCalledWith(2, 'reset-password');
    expect(onSelectAuthView).toHaveBeenNthCalledWith(3, 'login');
    expect(onSelectAuthView).toHaveBeenNthCalledWith(4, 'forgot-password');
  });
});
