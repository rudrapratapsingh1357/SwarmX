import { useState, useCallback } from 'react';
import * as api from '../api/client';

export default function useMission() {
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMission = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMission(id);
      setMission(response.data);
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to fetch mission details';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createNewMission = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.createMission(data);
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to create mission';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const startCurrentMission = useCallback(async (id) => {
    try {
      await api.startMission(id);
    } catch (err) {
      console.error('Failed to start mission:', err);
    }
  }, []);

  const pauseCurrentMission = useCallback(async (id) => {
    try {
      await api.pauseMission(id);
    } catch (err) {
      console.error('Failed to pause mission:', err);
    }
  }, []);

  const endCurrentMission = useCallback(async (id) => {
    try {
      const response = await api.endMission(id);
      return response.data;
    } catch (err) {
      console.error('Failed to end mission:', err);
      throw err;
    }
  }, []);

  return {
    mission,
    loading,
    error,
    fetchMission,
    createNewMission,
    startCurrentMission,
    pauseCurrentMission,
    endCurrentMission,
  };
}
