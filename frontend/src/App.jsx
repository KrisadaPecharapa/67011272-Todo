// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TodoList from './components/TodoList';
import ceiLogo from './assets/cei-logo.png';

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  // Check for stored username on initial load
  useEffect(() => {
    const storedUser = localStorage.getItem('todo_username');
    if (storedUser) {
      setCurrentUser(storedUser);
    }
  }, []);

  const handleLogin = (username) => {
    setCurrentUser(username);
  };

  const handleLogout = () => {
    // Clear username from local storage and state
    localStorage.removeItem('todo_username');
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
          <div className="text-xs text-slate-500">
            {currentUser ? (
              <span>
                Signed in as <span className="font-semibold">{currentUser}</span>
              </span>
            ) : (
              <span>Not signed in</span>
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
            ? `Managing tasks as ${currentUser}.`
            : 'Login with your username to manage tasks.'}
          </p>

          <div className="mt-6">
            {currentUser ? (
              <TodoList username={currentUser} onLogout={handleLogout} />
            ) : (
              <Login onLogin={handleLogin} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
