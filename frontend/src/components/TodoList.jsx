// frontend/src/components/TodoList.js
import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL

function TodoList({ username, onLogout }) {
  const [todos, setTodos] = useState([]);
  const [newTask, setNewTask] = useState('');

  useEffect(() => {
    fetchTodos();
  }, [username]); // Refetch when username changes (e.g., after login)

  // 1. READ: Fetch all todos for the current user
  const fetchTodos = async () => {
    try {
      const response = await fetch(`${API_URL}/todos/${username}`);

      if (!response.ok) {
        console.error('Failed to fetch todos:', response.statusText);
        return;
      }

      const data = await response.json();
      setTodos(data);
    } catch (err) {
      console.error('Error fetching todos:', err);
    }
  };

  // 2. CREATE: Add a new todo
  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    try {
      const response = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, task: newTask }),
      });

      if (!response.ok) {
        console.error('Failed to add todo:', response.statusText);
        return;
      }

      const newTodo = await response.json();
      // Add the new item to the beginning of the list
      setTodos([newTodo, ...todos]);
      setNewTask('');
    } catch (err) {
      console.error('Error adding todo:', err);
    }
  };

  // 3. UPDATE: Toggle the 'done' status
  const handleToggleDone = async (id, currentDoneStatus) => {
    const newDoneStatus = !currentDoneStatus;
    try {
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: newDoneStatus }),
      });

      if (!response.ok) {
        console.error('Failed to update todo:', response.statusText);
        return;
      }

      // Update the status in the local state immediately
      setTodos(todos.map(todo =>
        todo.id === id ? { ...todo, done: newDoneStatus } : todo
      ));
    } catch (err) {
      console.error('Error toggling done status:', err);
    }
  };

  // 4. DELETE: Remove a todo item
  const handleDeleteTodo = async (id) => {
    try {
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        console.error('Failed to delete todo:', response.statusText);
        return;
      }

      // Filter out the deleted item from the state
      setTodos(todos.filter(todo => todo.id !== id));
    } catch (err) {
      console.error('Error deleting todo:', err);
    }
  };

  const handleLogout = () => {
    // Clear storage and trigger state change in App.js
    localStorage.removeItem('todo_username');
    onLogout();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Todo List for: {username}</h2>
        <button onClick={handleLogout} className='text-sm text-gray-500 hover:text-orange-500 active:text-orange-800 active:underline'>
          Logout</button>
      </div>

      <form onSubmit={handleAddTodo} className='flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0'>
        <input
          className='h-10 w-full sm:w-56 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-center sm:text-left outline-none'
          type="text"
          placeholder="New Task"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
        />
        <button type="submit" className='h-10 mt-2 sm:mt-0 w-full rounded-md bg-orange-500 px-4 text-white hover:bg-orange-600 sm:ml-3 sm:w-auto active:bg-orange-700'>
          Add Task</button>
      </form>

      <ul className='mt-4 space-y-2'>
        {todos.map(todo => (
          <li key={todo.id} style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
            <input
              type="checkbox"
              className='mr-2 accent-gray-600 hover:accent-gray-800'
              checked={!!todo.done} // Convert MySQL's 0/1 to boolean
              onChange={() => handleToggleDone(todo.id, todo.done)}
            />
            {todo.task}
            <small className='block sm:inline text-xs text-gray-500 sm:ml-2'> (Updated: {new Date(todo.updated).toLocaleString()})</small>
            <button onClick={() => {const ok = window.confirm(`Delete "${todo.task}"?`); if (ok) handleDeleteTodo(todo.id);}} className='ml-2 rounded-md bg-red-500 text-white border border-red-500 sm:border-gray-300 px-2 py-1 text-sm active:bg-red-700 sm:active:bg-red-700 sm:bg-transparent sm:text-gray-600 sm:hover:border-red-500 sm:hover:bg-red-500 sm:hover:text-white'>
              Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TodoList;
