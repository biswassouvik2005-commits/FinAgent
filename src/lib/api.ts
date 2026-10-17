import axios from 'axios';

const baseURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

const api = axios.create({ baseURL });

export default api;
