// frontend/src/components/TodoList.js
import React, { useState, useEffect, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function TodoList({ user, onLogout }) {
  const username = user?.username || '';
  const userId = user?.id;

  const [todos, setTodos] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [activeView, setActiveView] = useState('personal');

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamTasks, setTeamTasks] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [newTeamTaskTitle, setNewTeamTaskTitle] = useState('');
  const [newTeamTaskDesc, setNewTeamTaskDesc] = useState('');
  const [newAssignedUserId, setNewAssignedUserId] = useState('');

  useEffect(() => {
    fetchTodos();
    fetchTeams();
  }, [username]);

  useEffect(() => {
    if (selectedTeamId) {
      fetchTeamMembers(selectedTeamId);
      fetchTeamTasks(selectedTeamId);
    } else {
      setTeamMembers([]);
      setTeamTasks([]);
    }
  }, [selectedTeamId]);

  const fetchTodos = async () => {
    try {
      const response = await fetch(`${API_URL}/todos/${encodeURIComponent(username)}`);
      if (!response.ok) return;
      const data = await response.json();
      const normalizedData = data.map(t => ({
        ...t,
        status: t.status || (t.done ? 'Done' : 'Todo'),
      }));
      setTodos(normalizedData);
    } catch (err) {
      console.error('Error fetching todos:', err);
    }
  };

  const fetchTeams = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/teams/user/${userId}`);
      if (!response.ok) return;
      const data = await response.json();
      setTeams(data);
      if (!selectedTeamId && data.length > 0) {
        setSelectedTeamId(data[0].id);
      }
      if (data.length === 0) {
        setSelectedTeamId(null);
      }
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  };

  const fetchTeamMembers = async (teamId) => {
    try {
      const response = await fetch(`${API_URL}/teams/${teamId}/members`);
      if (!response.ok) return;
      const data = await response.json();
      setTeamMembers(data);
      if (!newAssignedUserId && data.length > 0) {
        setNewAssignedUserId(String(data[0].id));
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  };

  const fetchTeamTasks = async (teamId) => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_URL}/teams/${teamId}/tasks?requester_user_id=${userId}`);
      if (!response.ok) return;
      const data = await response.json();
      setTeamTasks(data);
    } catch (err) {
      console.error('Error fetching team tasks:', err);
    }
  };

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
          target_datetime: newTargetDate || null,
          status: 'Todo',
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

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim() || !userId) return;
    try {
      const response = await fetch(`${API_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim(), creator_user_id: userId }),
      });
      if (!response.ok) return;
      await response.json();
      setNewTeamName('');
      fetchTeams();
    } catch (err) {
      console.error('Error creating team:', err);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedTeamId || !newMemberIdentifier.trim() || !userId) return;
    try {
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: userId, user_identifier: newMemberIdentifier.trim() }),
      });
      if (!response.ok) return;
      setNewMemberIdentifier('');
      fetchTeamMembers(selectedTeamId);
    } catch (err) {
      console.error('Error adding member:', err);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!selectedTeamId || !userId) return;
    try {
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: userId }),
      });
      if (!response.ok) return;
      fetchTeamMembers(selectedTeamId);
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  const handleCreateTeamTask = async (e) => {
    e.preventDefault();
    if (!selectedTeamId || !userId || !newTeamTaskTitle.trim() || !newAssignedUserId) return;
    try {
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user_id: userId,
          title: newTeamTaskTitle.trim(),
          description: newTeamTaskDesc.trim() || null,
          assigned_user_id: Number(newAssignedUserId),
          status: 'Todo',
        }),
      });
      if (!response.ok) return;
      setNewTeamTaskTitle('');
      setNewTeamTaskDesc('');
      fetchTeamTasks(selectedTeamId);
    } catch (err) {
      console.error('Error creating team task:', err);
    }
  };

  const handleTeamTaskStatus = async (taskId, newStatus) => {
    if (!selectedTeamId || !userId) return;
    try {
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, status: newStatus }),
      });
      if (!response.ok) return;
      setTeamTasks(teamTasks.map(task =>
        task.id === taskId ? { ...task, status: newStatus } : task
      ));
    } catch (err) {
      console.error('Error updating team task status:', err);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) return;

      setTodos(todos.map(todo =>
        todo.id === id ? { ...todo, status: newStatus } : todo
      ));
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

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

  const groupedTodos = useMemo(() => {
    const groups = { Todo: [], Doing: [], Done: [] };

    const sortFn = (a, b) => {
      const dateA = new Date(a.target_datetime || 0);
      const dateB = new Date(b.target_datetime || 0);
      return dateB - dateA;
    };

    todos.forEach(todo => {
      const status = todo.status || 'Todo';
      if (groups[status]) {
        groups[status].push(todo);
      } else {
        groups.Todo.push(todo);
      }
    });

    Object.keys(groups).forEach(key => groups[key].sort(sortFn));

    return groups;
  }, [todos]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Todo': return 'bg-gray-100 border-gray-300 text-gray-700';
      case 'Doing': return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'Done': return 'bg-green-50 border-green-200 text-green-700';
      default: return 'bg-gray-50';
    }
  };

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || null;
  const isTeamAdmin = selectedTeam && selectedTeam.admin_id === userId;

  const groupedTeamTasks = useMemo(() => {
    const groups = { Todo: [], Doing: [], Done: [] };
    teamTasks.forEach(task => {
      const status = task.status || 'Todo';
      if (groups[status]) {
        groups[status].push(task);
      } else {
        groups.Todo.push(task);
      }
    });
    return groups;
  }, [teamTasks]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Todo Board: {username}</h2>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-orange-500 active:text-orange-800 underline">
          Logout
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        <button
          onClick={() => setActiveView('personal')}
          className={`rounded-full border px-3 py-1 ${activeView === 'personal' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          My Todos
        </button>
        <button
          onClick={() => setActiveView('team')}
          className={`rounded-full border px-3 py-1 ${activeView === 'team' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Team Tasks
        </button>
      </div>

      {activeView === 'team' && (
        <div className="mb-8 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-semibold text-slate-700">Team</div>
              <select
                value={selectedTeamId || ''}
                onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Select team</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>

              <form onSubmit={handleCreateTeam} className="flex flex-wrap items-center gap-2">
                <input
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  type="text"
                  placeholder="New team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <button type="submit" className="h-9 rounded-md bg-orange-500 px-3 text-sm text-white">
                  Create Team
                </button>
              </form>
              {selectedTeamId && isTeamAdmin && (
                <button
                  onClick={async () => {
                    if (!window.confirm('Delete this team? This will remove all members and tasks.')) return;
                    try {
                      const response = await fetch(`${API_URL}/teams/${selectedTeamId}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ admin_user_id: userId }),
                      });
                      if (!response.ok) return;
                      setSelectedTeamId(null);
                      fetchTeams();
                    } catch (err) {
                      console.error('Error deleting team:', err);
                    }
                  }}
                  className="h-9 rounded-md border border-red-200 bg-white px-3 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete Team
                </button>
              )}
            </div>
            {selectedTeam && (
              <div className="mt-2 text-xs text-slate-500">
                Team Admin: {isTeamAdmin ? 'You' : 'Member'}
              </div>
            )}
          </div>

          {selectedTeamId && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-sm font-semibold text-slate-700">Members</div>
                {isTeamAdmin && (
                  <form onSubmit={handleAddMember} className="mb-3 flex items-center gap-2">
                    <input
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      type="text"
                      placeholder="Username or email"
                      value={newMemberIdentifier}
                      onChange={(e) => setNewMemberIdentifier(e.target.value)}
                    />
                    <button type="submit" className="h-9 rounded-md bg-orange-500 px-3 text-sm text-white">
                      Add
                    </button>
                  </form>
                )}
                <ul className="space-y-2 text-sm">
                  {teamMembers.map(member => (
                    <li key={member.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                      <span className="text-slate-700">
                        {member.full_name} ({member.username}) {member.id === selectedTeam.admin_id ? '(Admin)' : '(Member)'}
                      </span>
                      {isTeamAdmin && member.id !== selectedTeam.admin_id && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-xs text-red-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                  {teamMembers.length === 0 && (
                    <div className="text-xs text-slate-400">No members yet.</div>
                  )}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-sm font-semibold text-slate-700">Create Team Task</div>
                {isTeamAdmin ? (
                  <form onSubmit={handleCreateTeamTask} className="space-y-2">
                    <input
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      type="text"
                      placeholder="Task title"
                      value={newTeamTaskTitle}
                      onChange={(e) => setNewTeamTaskTitle(e.target.value)}
                    />
                    <textarea
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      placeholder="Description (optional)"
                      value={newTeamTaskDesc}
                      onChange={(e) => setNewTeamTaskDesc(e.target.value)}
                      rows={3}
                    />
                    <select
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={newAssignedUserId}
                      onChange={(e) => setNewAssignedUserId(e.target.value)}
                    >
                      <option value="">Assign to...</option>
                      {teamMembers.map(member => (
                        <option key={member.id} value={member.id}>
                        {member.full_name} ({member.username}) {member.id === selectedTeam.admin_id ? '(Admin)' : '(Member)'}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="h-9 w-full rounded-md bg-orange-500 px-3 text-sm text-white">
                      Create Task
                    </button>
                  </form>
                ) : (
                  <div className="text-xs text-slate-500">
                    Only the Team Admin can create tasks.
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedTeamId && (
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Team Tasks</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {['Todo', 'Doing', 'Done'].map(groupName => (
                  <div key={groupName} className={`rounded-xl border p-3 ${getStatusColor(groupName)} bg-opacity-50`}>
                    <h3 className="font-bold text-center mb-3 text-sm uppercase tracking-wider opacity-80">
                      {groupName} ({groupedTeamTasks[groupName].length})
                    </h3>
                    <ul className="space-y-3">
                      {groupedTeamTasks[groupName].map(task => (
                        <li key={task.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                            <span className="font-medium text-slate-800 break-words w-full pr-2">
                              {task.title}
                            </span>
                          </div>
                          {task.description && (
                            <div className="text-xs text-slate-500">{task.description}</div>
                          )}
                          <div className="text-xs text-slate-500">
                            Assigned to {(() => {
                              const assignee = teamMembers.find(m => m.id === task.assigned_user_id);
                              if (!assignee) return 'Unknown';
                              return `${assignee.full_name} (${assignee.username})`;
                            })()}
                          </div>
                          <div className="pt-2 mt-1 border-t border-gray-50">
                            {(() => {
                              const canEditStatus = isTeamAdmin || task.assigned_user_id === userId;
                              return (
                                <select
                                  value={task.status || groupName}
                                  onChange={(e) => handleTeamTaskStatus(task.id, e.target.value)}
                                  disabled={!canEditStatus}
                                  className={`w-full text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 text-slate-600 cursor-pointer ${!canEditStatus ? 'opacity-60 cursor-not-allowed' : ''}`}
                                  title={canEditStatus ? 'Update status' : 'Only the Team Admin or assigned user can update status'}
                                >
                                  <option value="Todo">Move to Todo</option>
                                  <option value="Doing">Move to Doing</option>
                                  <option value="Done">Move to Done</option>
                                </select>
                              );
                            })()}
                          </div>
                        </li>
                      ))}
                      {groupedTeamTasks[groupName].length === 0 && (
                        <div className="text-center py-6 text-gray-400 text-xs italic">
                          No tasks in {groupName}
                        </div>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeView === 'personal' && (
        <>
          <form onSubmit={handleAddTodo} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Task Name</label>
              <input
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors"
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
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors text-gray-600"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
              />
            </div>

            <button type="submit" className="h-10 w-full rounded-md bg-orange-500 px-6 font-medium text-white hover:bg-orange-600 sm:w-auto active:bg-orange-700 shadow-sm">
              Add
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['Todo', 'Doing', 'Done'].map(groupName => (
              <div key={groupName} className={`rounded-xl border p-3 ${getStatusColor(groupName)} bg-opacity-50`}>
                <h3 className="font-bold text-center mb-3 text-sm uppercase tracking-wider opacity-80">
                  {groupName} ({groupedTodos[groupName].length})
                </h3>

                <ul className="space-y-3">
                  {groupedTodos[groupName].map(todo => (
                    <li key={todo.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-slate-800 break-words w-full pr-2">
                          {todo.task}
                        </span>
                        <button
                          onClick={() => { if (window.confirm(`Delete "${todo.task}"?`)) handleDeleteTodo(todo.id); }}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          x
                        </button>
                      </div>

                      <div className="text-xs space-y-0.5 text-gray-500">
                        {todo.target_datetime && (
                          <p className="flex items-center gap-1 text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit">
                            <span>Target</span>
                            {new Date(todo.target_datetime).toLocaleString([], { year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        <p className="opacity-60 pl-1">Upd: {new Date(todo.updated || Date.now()).toLocaleDateString()}</p>
                      </div>

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
        </>
      )}
    </div>
  );
}

export default TodoList;
