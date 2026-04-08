import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Auth
export const login = (username, password) => api.post('/auth/login', { username, password });

// Users
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const changePassword = (id, password) => api.put(`/users/${id}/password`, { password });

// Conversations
export const getConversations = (params) => api.get('/conversations', { params });
export const getConversation = (id) => api.get(`/conversations/${id}`);
export const getMessages = (id) => api.get(`/conversations/${id}/messages`);
export const sendMessage = (id, content, senderName) => api.post(`/conversations/${id}/messages`, { content, sender_name: senderName });
export const sendNote = (id, content, senderName) => api.post(`/conversations/${id}/notes`, { content, sender_name: senderName });
export const updateConversation = (id, data) => api.put(`/conversations/${id}`, data);
export const getStats = () => api.get('/conversations/stats');
export const exportConversation = (id) => `/api/conversations/${id}/export`;

// Customers
export const getCustomers = (params) => api.get('/customers', { params });
export const updateCustomer = (id, data) => api.put(`/customers/${id}`, data);

// Templates
export const getTemplates = () => api.get('/templates');
export const createTemplate = (data) => api.post('/templates', data);
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`);

// Dashboard
export const getDashboardStats = () => api.get('/stats');

// Broadcast
export const broadcast = (data) => api.post('/broadcast', data);

// Bot training — gọi thẳng Python qua Vite proxy /chatbot
export const trainChatbot = (formData) =>
  axios.post('/chatbot/train', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

export const trainChatbotUrl = (url) =>
  axios.post('/chatbot/train-url', { url });

export const getChunks = () => axios.get('/chatbot/chunks');
