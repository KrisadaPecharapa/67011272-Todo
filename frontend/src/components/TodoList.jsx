// frontend/src/components/TodoList.js
import React, { useState, useEffect, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL

function TodoList({ username, onLogout }) {
  const [todos, setTodos] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');

  useEffect(() => {
    fetchTodos();
  }, [username]); 

  // 1. READ: Fetch all todos
  const fetchTodos = async () => {
    try {
      const response = await fetch(`${API_URL}/todos/${encodeURIComponent(username)}`);
      if (!response.ok) return;
      const data = await response.json();
      
      // Normalize data: ensure status exists, default to 'Todo' if missing or converting from old boolean
      const normalizedData = data.map(t => ({
        ...t,
        status: t.status || (t.done ? 'Done' : 'Todo') 
      }));
      setTodos(normalizedData);
    } catch (err) {
      console.error('Error fetching todos:', err);
    }
  };

  // 2. CREATE: Add a new todo with Target Date and Default Status
  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!newTask.trim() || !username) return;

    try {
      const response = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          task: newTask, 
          target_datetime: newTargetDate || null, // Handle empty date
          status: 'Todo' // Default status
        }),
      });

      if (!response.ok) return;

      const newTodo = await response.json();
      setTodos([newTodo, ...todos]);
      setNewTask('');
      setNewTargetDate('');
    } catch (err) {
      console.error('Error adding todo:', err);
    }
  };

  // 3. UPDATE: Change Status (Todo -> Doing -> Done)
  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }), // Sending status string
      });

      if (!response.ok) return;

      setTodos(todos.map(todo =>
        todo.id === id ? { ...todo, status: newStatus } : todo
      ));
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // 4. DELETE
  const handleDeleteTodo = async (id) => {
    try {
      const response = await fetch(`${API_URL}/todos/${id}`, { method: 'DELETE' });
      if (!response.ok) return;
      setTodos(todos.filter(todo => todo.id !== id));
    } catch (err) {
      console.error('Error deleting todo:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('todo_user');
    onLogout();
  };

  // Helper: Group and Sort Todos
  const groupedTodos = useMemo(() => {
    const groups = { Todo: [], Doing: [], Done: [] };
    
    // Sort function: Target Datetime Descending (Newest dates first)
    const sortFn = (a, b) => {
      const dateA = new Date(a.target_datetime || 0);
      const dateB = new Date(b.target_datetime || 0);
      return dateB - dateA;
    };

    todos.forEach(todo => {
      // Fallback for old data without status
      const status = todo.status || 'Todo'; 
      if (groups[status]) {
        groups[status].push(todo);
      } else {
        // If status is unknown, dump in Todo
        groups['Todo'].push(todo);
      }
    });

    // Apply Sort
    Object.keys(groups).forEach(key => groups[key].sort(sortFn));
    
    return groups;
  }, [todos]);

  // UI Helper: Status Badge Colors
  const getStatusColor = (status) => {
    switch(status) {
      case 'Todo': return 'bg-gray-100 border-gray-300 text-gray-700';
      case 'Doing': return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'Done': return 'bg-green-50 border-green-200 text-green-700';
      default: return 'bg-gray-50';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Todo Board: {username}</h2>
        <button onClick={handleLogout} className='text-sm text-gray-500 hover:text-orange-500 active:text-orange-800 underline'>
          Logout</button>
      </div>

      {/* Input Form */}
      <form onSubmit={handleAddTodo} className='bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 flex flex-col gap-3 sm:flex-row sm:items-end'>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Task Name</label>
          <input
            className='h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors'
            type="text"
            placeholder="What needs to be done?"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
          />
        </div>
        
        <div className="w-full sm:w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1">Target Date</label>
          <input
            type="datetime-local"
            className='h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors text-gray-600'
            value={newTargetDate}
            onChange={(e) => setNewTargetDate(e.target.value)}
          />
        </div>

        <button type="submit" className='h-10 w-full rounded-md bg-orange-500 px-6 font-medium text-white hover:bg-orange-600 sm:w-auto active:bg-orange-700 shadow-sm'>
          Add
        </button>
      </form>

      {/* Kanban Board Layout */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {['Todo', 'Doing', 'Done'].map(groupName => (
          <div key={groupName} className={`rounded-xl border p-3 ${getStatusColor(groupName)} bg-opacity-50`}>
            <h3 className="font-bold text-center mb-3 text-sm uppercase tracking-wider opacity-80">
              {groupName} ({groupedTodos[groupName].length})
            </h3>
            
            <ul className='space-y-3'>
              {groupedTodos[groupName].map(todo => (
                <li key={todo.id} className='bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-2'>
                  
                  {/* Task Content */}
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-slate-800 break-words w-full pr-2">
                      {todo.task}
                    </span>
                    <button 
                      onClick={() => {if (window.confirm(`Delete "${todo.task}"?`)) handleDeleteTodo(todo.id);}} 
                      className='text-gray-400 hover:text-red-500 transition-colors'
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Dates */}
                  <div className="text-xs space-y-0.5 text-gray-500">
                    {todo.target_datetime && (
                       <p className="flex items-center gap-1 text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit">
                         <span>🎯</span> 
                         {new Date(todo.target_datetime).toLocaleString([], { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </p>
                    )}
                    <p className="opacity-60 pl-1">Upd: {new Date(todo.updated || Date.now()).toLocaleDateString()}</p>
                  </div>

                  {/* Status Change Dropdown */}
                  <div className="pt-2 mt-1 border-t border-gray-50">
                    <select 
                      value={todo.status || groupName} 
                      onChange={(e) => handleStatusChange(todo.id, e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 text-slate-600 cursor-pointer"
                    >
                      <option value="Todo">Move to Todo</option>
                      <option value="Doing">Move to Doing</option>
                      <option value="Done">Move to Done</option>
                    </select>
                  </div>

                </li>
              ))}
              
              {groupedTodos[groupName].length === 0 && (
                <div className="text-center py-6 text-gray-400 text-xs italic">
                  No tasks in {groupName}
                </div>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TodoList;
