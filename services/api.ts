
import { SlotMap, BookingData } from '../types';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyzH2GPENrTEyNhDWxPqKkYGi1gIVnDz05VCfIcIQHBPE43n31WReLAmUPKLnUndybyHQ/exec';

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 30000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const getSlots = async (): Promise<SlotMap> => {
  try {
    const response = await fetchWithTimeout(`${SCRIPT_URL}?action=getSlots`, {
      method: 'GET',
      mode: 'cors'
    });
    const data = await response.json();
    return data.slots || {};
  } catch (error) {
    console.error('Failed to fetch slots:', error);
    throw error;
  }
};

export const getUserData = async (externalId: string): Promise<any> => {
  try {
    const response = await fetchWithTimeout(`${SCRIPT_URL}?action=getUserData&external_id=${externalId}`, {
      method: 'GET',
      mode: 'cors'
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    return { exists: false };
  }
};

export const cancelBooking = async (extId: string, cityName: string, slotIso: string): Promise<boolean> => {
  try {
    const params = new URLSearchParams();
    params.append('action', 'cancelBooking');
    params.append('external_id', extId);
    params.append('city', cityName);
    params.append('slot_iso', slotIso);
    const response = await fetchWithTimeout(SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      body: params,
    });
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    return false;
  }
};

export const saveSlots = async (slots: SlotMap): Promise<boolean> => {
  try {
    const params = new URLSearchParams();
    params.append('action', 'saveSlots');
    params.append('slots', JSON.stringify(slots));
    const response = await fetchWithTimeout(SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      body: params,
    });
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    return false;
  }
};

export const createBooking = async (booking: BookingData): Promise<boolean> => {
  try {
    const params = new URLSearchParams();
    params.append('action', 'createBooking');
    Object.entries(booking).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value.toString());
    });
    const response = await fetchWithTimeout(SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      body: params,
    });
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    return false;
  }
};
