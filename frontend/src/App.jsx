// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import TodoList from './components/TodoList';
import ceiLogo from './assets/cei-logo.png';

function App() {
  const API_URL = import.meta.env.VITE_API_URL;
  const ASSET_BASE_URL = API_URL?.replace(/\/api\/?$/, '');
  const [currentUser, setCurrentUser] = useState(null);
  const profileImageSrc = currentUser?.profile_image_path
    ? (currentUser.profile_image_path.startsWith('http')
      ? currentUser.profile_image_path
      : `${ASSET_BASE_URL}${currentUser.profile_image_path}`)
    : '';

  // Check for stored username on initial load
  useEffect(() => {
    const storedUser = localStorage.getItem('todo_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setCurrentUser(parsed);
      } catch (err) {
        localStorage.removeItem('todo_user');
      }
    }
  }, []);

  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    // Clear username from local storage and state
    localStorage.removeItem('todo_user');
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <img
              src={ceiLogo}
              alt="CEI Logo"
              className="h-10 w-10 rounded-xl object-contain"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">CEI Todo</p>
              <p className="text-xs text-slate-500">
                Todo App
              </p>
            </div>
          </div>

          {/* Right side status */}
          <div className="flex items-center gap-2 text-xs text-slate-500 rounded-2xl border border-orange-700 px-2 py-2">
            {profileImageSrc ? (
              <img
                src={profileImageSrc}
                alt="Profile"
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : null}
            {currentUser ? (
              <span>
                Login as <span className="font-semibold">{currentUser.username}</span>
              </span>
            ) : (
              <span>Not Login</span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6">
          <h1 className="text-lg font-semibold text-slate-900">
            Full Stack Todo App
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {currentUser
            ? `Managing tasks as ${currentUser.username}.`
            : 'Login or register to manage tasks.'}
          </p>

          <div className="mt-6">
            {currentUser ? (
              <TodoList user={currentUser} onLogout={handleLogout} />
            ) : (
              <Auth onLogin={handleLogin} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
