// frontend/src/components/Login.js
import React, { useState } from 'react';

const API_URL = 'http://localhost:5001/api';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }

    try {
      // Use Fetch API for POST request
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }), // Convert object to JSON string
      });

      // Check if the response status is OK (200-299)
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.message || 'Login failed due to server error.');
        return;
      }

      const data = await response.json(); // Parse the response body as JSON

      if (data.success) {
        localStorage.setItem('todo_username', username);
        onLogin(username); // Update App component state
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      // Handle network connection errors
      setError('Network error: Could not connect to the server.');
      console.error(err);
    }
  };

  return (
    <div>
      <h2>Login (Username Only)</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button type="submit">Login</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

export default Login;
