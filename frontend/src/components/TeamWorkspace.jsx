import React, { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function TeamWorkspace({ currentUser }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  const [newTeamName, setNewTeamName] = useState('');
  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');

  const selectedTeam = useMemo(
    () => teams.find((team) => String(team.id) === String(selectedTeamId)) || null,
    [teams, selectedTeamId]
  );
  const isAdmin = Boolean(selectedTeam?.is_admin);

  const loadTeams = async () => {
    if (!currentUser?.id) return;
    try {
      setError('');
      const response = await fetch(`${API_URL}/teams?user_id=${currentUser.id}`);
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to load teams');
        return;
      }
      const data = await response.json();
      setTeams(data);
      if (data.length > 0) {
        if (!selectedTeamId || !data.find((t) => String(t.id) === String(selectedTeamId))) {
          setSelectedTeamId(String(data[0].id));
        }
      } else {
        setSelectedTeamId('');
        setMembers([]);
        setTasks([]);
      }
    } catch (err) {
      setError('Network error while loading teams');
    }
  };

  const loadMembers = async (teamId) => {
    if (!teamId) return;
    const response = await fetch(`${API_URL}/teams/${teamId}/members?user_id=${currentUser.id}`);
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to load team members');
    }
    const data = await response.json();
    setMembers(data);
  };

  const loadTasks = async (teamId) => {
    if (!teamId) return;
    const response = await fetch(`${API_URL}/teams/${teamId}/tasks?user_id=${currentUser.id}`);
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to load team tasks');
    }
    const data = await response.json();
    setTasks(data);
  };

  useEffect(() => {
    loadTeams();
  }, [currentUser?.id]);

  useEffect(() => {
    const run = async () => {
      if (!selectedTeamId) return;
      try {
        setError('');
        await Promise.all([loadMembers(selectedTeamId), loadTasks(selectedTeamId)]);
      } catch (err) {
        setError(err.message || 'Failed to load team details');
      }
    };
    run();
  }, [selectedTeamId, currentUser?.id]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    try {
      setError('');
      const response = await fetch(`${API_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTeamName.trim(),
          admin_user_id: currentUser.id,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to create team');
        return;
      }
      setNewTeamName('');
      await loadTeams();
    } catch (err) {
      setError('Network error while creating team');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberIdentifier.trim() || !selectedTeamId) return;
    try {
      setError('');
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_user_id: currentUser.id,
          user_identifier: newMemberIdentifier.trim(),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to add member');
        return;
      }
      setNewMemberIdentifier('');
      await loadMembers(selectedTeamId);
    } catch (err) {
      setError('Network error while adding member');
    }
  };

  const searchUsers = async (keyword = '') => {
    try {
      const response = await fetch(`${API_URL}/users/search?query=${encodeURIComponent(keyword)}`);
      if (!response.ok) return;
      const data = await response.json();
      setUserSearchResults(data);
    } catch (err) {
      // Keep UI usable even if search fails.
      setUserSearchResults([]);
    }
  };

  useEffect(() => {
    if (!isAdmin || !selectedTeamId) return;
    searchUsers('');
  }, [isAdmin, selectedTeamId]);

  const handleRemoveMember = async (memberUserId) => {
    try {
      setError('');
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/members/${memberUserId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_user_id: currentUser.id }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to remove member');
        return;
      }
      await Promise.all([loadMembers(selectedTeamId), loadTasks(selectedTeamId)]);
    } catch (err) {
      setError('Network error while removing member');
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !assignedUserId || !selectedTeamId) return;
    try {
      setError('');
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_user_id: currentUser.id,
          title: newTaskTitle.trim(),
          assigned_user_id: Number(assignedUserId),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to create task');
        return;
      }
      setNewTaskTitle('');
      await loadTasks(selectedTeamId);
    } catch (err) {
      setError('Network error while creating task');
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeamId || !selectedTeam) return;
    const confirmDelete = window.confirm(
      `Delete team "${selectedTeam.name}"? This will remove all members and team tasks.`
    );
    if (!confirmDelete) return;

    try {
      setError('');
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_user_id: currentUser.id }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to delete team');
        return;
      }
      await loadTeams();
    } catch (err) {
      setError('Network error while deleting team');
    }
  };

  const handleUpdateStatus = async (taskId, status) => {
    try {
      setError('');
      const response = await fetch(`${API_URL}/teams/${selectedTeamId}/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_user_id: currentUser.id,
          status,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to update status');
        return;
      }
      await loadTasks(selectedTeamId);
    } catch (err) {
      setError('Network error while updating status');
    }
  };

  if (!currentUser?.id) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        Team features require an account with a numeric `id`. Please log out and log in again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreateTeam} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row">
        <input
          type="text"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New team name"
          className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm"
        />
        <button type="submit" className="h-10 rounded-md bg-orange-500 px-4 text-sm text-white">
          Create Team
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => setSelectedTeamId(String(team.id))}
            className={`rounded-full border px-3 py-1 text-sm ${String(selectedTeamId) === String(team.id) ? 'border-orange-500 bg-orange-100 text-orange-700' : 'border-slate-300 text-slate-600'}`}
          >
            {team.name} {team.is_admin ? '(Admin)' : ''}
          </button>
        ))}
        {teams.length === 0 ? <p className="text-sm text-slate-500">No teams yet. Create one to start.</p> : null}
      </div>

      {selectedTeam ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Members</h3>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleDeleteTeam}
                  className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                >
                  Delete Team
                </button>
              ) : null}
            </div>
            {isAdmin ? (
              <form onSubmit={handleAddMember} className="flex gap-2">
                <input
                  type="text"
                  value={newMemberIdentifier}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewMemberIdentifier(value);
                    searchUsers(value);
                  }}
                  placeholder="Username or email"
                  className="h-9 flex-1 rounded-md border border-slate-300 px-2 text-sm"
                />
                <button type="submit" className="h-9 rounded-md bg-slate-700 px-3 text-xs text-white">
                  Add Member
                </button>
              </form>
            ) : null}
            {isAdmin ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-medium text-slate-500">Suggestions (username • email)</p>
                <ul className="max-h-32 space-y-1 overflow-auto">
                  {userSearchResults
                    .filter((user) => !members.some((member) => Number(member.id) === Number(user.id)))
                    .map((user) => (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => setNewMemberIdentifier(user.email || user.username)}
                          className="w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
                        >
                          {user.username}
                          {user.email ? ` • ${user.email}` : ''}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between rounded-md border border-slate-100 px-2 py-2 text-sm">
                  <span>
                    {member.full_name} ({member.username}) {member.is_admin ? '• Admin' : ''}
                  </span>
                  {isAdmin && !member.is_admin ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-xs text-red-600 underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Create Team Task</h3>
            {isAdmin ? (
              <form onSubmit={handleCreateTask} className="space-y-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title"
                  className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                />
                <select
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                >
                  <option value="">Assign to member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name} ({member.username})
                    </option>
                  ))}
                </select>
                <button type="submit" className="h-9 rounded-md bg-orange-500 px-3 text-xs text-white">
                  Create Task
                </button>
              </form>
            ) : (
              <p className="text-xs text-slate-500">Only team admin can create tasks.</p>
            )}
          </div>
        </div>
      ) : null}

      {selectedTeam ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Team Tasks</h3>
          <ul className="space-y-2">
            {tasks.map((task) => {
              const canUpdate = isAdmin || Number(task.assigned_user_id) === Number(currentUser.id);
              return (
                <li key={task.id} className="rounded-md border border-slate-100 p-3 text-sm">
                  <p className="font-medium text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    Assigned to: {task.assigned_user_name} • Created by: {task.created_by_name}
                  </p>
                  <div className="mt-2">
                    <select
                      value={task.status}
                      disabled={!canUpdate}
                      onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                      className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                    >
                      <option value="Todo">Todo</option>
                      <option value="Doing">Doing</option>
                      <option value="Done">Done</option>
                    </select>
                    {!canUpdate ? <span className="ml-2 text-xs text-slate-400">Only admin/assignee can update</span> : null}
                  </div>
                </li>
              );
            })}
            {tasks.length === 0 ? <p className="text-sm text-slate-500">No team tasks yet.</p> : null}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export default TeamWorkspace;
