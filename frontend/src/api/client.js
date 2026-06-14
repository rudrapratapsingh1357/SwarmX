import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin,
  timeout: 10000,
});

export const createMission = (data) => api.post('/api/missions/create', data);
export const startMission = (id) => api.post(`/api/missions/${id}/start`);
export const pauseMission = (id) => api.post(`/api/missions/${id}/pause`);
export const endMission = (id) => api.post(`/api/missions/${id}/end`);
export const getMissions = () => api.get('/api/missions');
export const getMission = (id) => api.get(`/api/missions/${id}`);
export const getAgents = (id) => api.get(`/api/missions/${id}/agents`);
export const triggerFailure = (missionId, agentId) => api.post(`/api/missions/${missionId}/agents/${agentId}/fail`);
export const getTargets = (id) => api.get(`/api/missions/${id}/targets`);
export const verifyTarget = (missionId, targetId) => api.post(`/api/missions/${missionId}/targets/${targetId}/verify`);
export const triggerMassFailure = (missionId, percentage = 0.3) =>
  api.post(`/api/missions/${missionId}/agents/mass-failure`, { percentage });

export default api;
