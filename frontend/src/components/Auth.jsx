// frontend/src/components/Auth.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

const API_URL = import.meta.env.VITE_API_URL;

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);
  const googleButtonRef = useRef(null);
  const googleInitRef = useRef(false);
  const [googleReady, setGoogleReady] = useState(false);

  const [fullName, setFullName] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [profileImage, setProfileImage] = useState(null);

  const previewUrl = useMemo(() => {
    if (!profileImage) return '';
    return URL.createObjectURL(profileImage);
  }, [profileImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (mode !== 'login') {
      googleInitRef.current = false;
      setGoogleReady(false);
      return;
    }

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.id && googleButtonRef.current) {
        setGoogleReady(true);
        clearInterval(timer);
      } else if (attempts > 25) {
        clearInterval(timer);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'login') return;
    if (googleInitRef.current) return;
    if (!googleReady) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google || !googleButtonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setError('');
        try {
          const loginResponse = await fetch(`${API_URL}/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
          });

          if (!loginResponse.ok) {
            const errorData = await loginResponse.json();
            setError(errorData.message || 'Google login failed.');
            return;
          }

          const data = await loginResponse.json();
          if (data.success) {
            const user = {
              ...data.user,
              username: data.user?.username || data.user?.email || '',
            };
            localStorage.setItem('todo_user', JSON.stringify(user));
            onLogin(user);
          } else {
            setError(data.message || 'Google login failed.');
          }
        } catch (err) {
          setError('Network error: Could not connect to the server.');
          console.error(err);
        }
      },
    });

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 320,
    });

    googleInitRef.current = true;
  }, [mode, onLogin, googleReady]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!loginUsername.trim() || !loginPassword || !captchaToken) {
      setError('Please enter a username, password, and complete the CAPTCHA.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
          hcaptcha_token: captchaToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.message || 'Login failed due to server error.');
        return;
      }

      const data = await response.json();
      if (data.success) {
        const user = data.user || { username: loginUsername.trim() };
        localStorage.setItem('todo_user', JSON.stringify(user));
        onLogin(user);
        setCaptchaToken('');
        if (captchaRef.current) {
          captchaRef.current.resetCaptcha();
        }
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      setError('Network error: Could not connect to the server.');
      console.error(err);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim() || !registerUsername.trim() || !registerPassword || !profileImage) {
      setError('Please provide full name, username, password, and a profile image.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('full_name', fullName.trim());
      formData.append('username', registerUsername.trim());
      formData.append('password', registerPassword);
      formData.append('profile_image', profileImage);

      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.message || 'Registration failed due to server error.');
        return;
      }

      const data = await response.json();
      const user = {
        id: data.id,
        username: data.username,
        full_name: data.full_name,
        profile_image_path: data.profile_image_path,
      };

      localStorage.setItem('todo_user', JSON.stringify(user));
      onLogin(user);
    } catch (err) {
      setError('Network error: Could not connect to the server.');
      console.error(err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`rounded-md px-3 py-2 text-sm ${mode === 'login' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`rounded-md px-3 py-2 text-sm ${mode === 'register' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          Register
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="mt-4 flex flex-col gap-3 sm:items-center">
          <input
            type="text"
            placeholder="Username"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            className="h-10 w-full sm:w-80 rounded-md border border-gray-400 bg-white px-3 py-2 text-sm outline-none text-center"
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className="h-10 w-full sm:w-80 rounded-md border border-gray-400 bg-white px-3 py-2 text-sm outline-none text-center"
          />
          <div className="flex w-full justify-center">
            <HCaptcha
              sitekey={import.meta.env.VITE_HCAPTCHA_SITE_KEY}
              onVerify={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken('')}
              ref={captchaRef}
            />
          </div>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="text-xs text-slate-400">or</div>
            <div ref={googleButtonRef} />
          </div>
          <button type="submit" className="h-10 w-full rounded-md bg-orange-500 px-4 text-white hover:bg-orange-600 active:bg-orange-700 sm:w-auto">
            Login
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="mt-4 flex flex-col gap-3 sm:items-center">
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10 w-full sm:w-80 rounded-md border border-gray-400 bg-white px-3 py-2 text-sm outline-none text-center"
          />
          <input
            type="text"
            placeholder="Username"
            value={registerUsername}
            onChange={(e) => setRegisterUsername(e.target.value)}
            className="h-10 w-full sm:w-80 rounded-md border border-gray-400 bg-white px-3 py-2 text-sm outline-none text-center"
          />
          <input
            type="password"
            placeholder="Password"
            value={registerPassword}
            onChange={(e) => setRegisterPassword(e.target.value)}
            className="h-10 w-full sm:w-80 rounded-md border border-gray-400 bg-white px-3 py-2 text-sm outline-none text-center"
          />
          <div className="w-full sm:w-80 rounded-md border border-dashed border-gray-400 bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Profile preview"
                className="mx-auto mt-3 h-24 w-24 rounded-full object-cover"
              />
            ) : null}
          </div>
          <button type="submit" className="h-10 w-full rounded-md bg-orange-500 px-4 text-white hover:bg-orange-600 active:bg-orange-700 sm:w-auto">
            Create account
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default Auth;
