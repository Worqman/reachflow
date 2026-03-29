// ReachFlow API client
// All requests go to /api/* which is proxied to the backend

import { supabase } from './supabase'
import { getActiveWorkspaceId } from './workspaceState'

const BASE = "/api";

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };

  // Attach Supabase auth token so the backend can identify the user
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  } catch {}

  // Attach active workspace so the backend scopes data correctly
  const workspaceId = getActiveWorkspaceId()
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

const get = (path) => request("GET", path);
const post = (path, body) => request("POST", path, body);
const put = (path, body) => request("PUT", path, body);
const del = (path) => request("DELETE", path);

// ── Workspace ──────────────────────────────────
export const workspace = {
  get: () => get("/workspaces"),
  update: (data) => put("/workspace", data),
};

// ── Settings ───────────────────────────────────
export const settings = {
  getProfile: () => get("/settings/profile"),
  updateProfile: (data) => put("/settings/profile", data),
  getIntegrations: () => get("/settings/integrations"),
};

// ── Company Profiles ───────────────────────────
export const companyProfiles = {
  list: (workspaceId) =>
    get(`/company-profiles?workspace_id=${encodeURIComponent(String(workspaceId))}`),
  get: (id) => get(`/company-profiles/${id}`),
  create: (data) => post("/company-profiles", data),
  update: (id, data) => put(`/company-profiles/${id}`, data),
  delete: (id) => del(`/company-profiles/${id}`),
  analyzeWebsite: (websiteUrl) =>
    post("/company-profiles/analyze-website", { website_url: websiteUrl }),
};

// ── Agents ─────────────────────────────────────
export const agents = {
  list: () => get("/agents"),
  get: (id) => get(`/agents/${id}`),
  create: (data) => post("/agents", data),
  update: (id, d) => put(`/agents/${id}`, d),
  delete: (id) => del(`/agents/${id}`),
  generateIcp: (id, d) => post(`/agents/${id}/generate-icp`, d),
  generatePersona: (id, d) => post(`/agents/${id}/generate-persona`, d),
};

// ── Campaigns ──────────────────────────────────
export const campaigns = {
  list: () => get("/campaigns"),
  get: (id) => get(`/campaigns/${id}`),
  create: (data) => post("/campaigns", data),
  update: (id, d) => put(`/campaigns/${id}`, d),
  delete: (id) => del(`/campaigns/${id}`),
  getLeads: (id) => get(`/campaigns/${id}/leads`),
  importLeads: (id, d) => post(`/campaigns/${id}/leads`, d),
  getSequence: (id) => get(`/campaigns/${id}/sequence`),
  updateSequence: (id, d) => put(`/campaigns/${id}/sequence`, d),
  getAnalytics: (id) => get(`/campaigns/${id}/analytics`),
  syncStatuses: (id) => post(`/campaigns/${id}/sync-statuses`, {}),
  syncMessages: (id) => post(`/campaigns/${id}/sync-messages`, {}),
  sendInvites: (id) => post(`/campaigns/${id}/send-invites`, {}),
  sendLeadMessage: (id, leadId) => post(`/campaigns/${id}/leads/${leadId}/send-message`, {}),
  updateLeadStatus: (id, leadId, status) => post(`/campaigns/${id}/leads/${leadId}/status`, { status }),
  deleteLead: (id, leadId) => del(`/campaigns/${id}/leads/${leadId}`),
};

// ── Leads ──────────────────────────────────────
export const leads = {
  list: () => get("/leads"),
  search: (data) => post("/leads/search", data),
  create: (data) => post("/leads", data),
  bulkCreate: (leadsArr) => post("/leads/bulk", { leads: leadsArr }),
  update: (id, d) => put(`/leads/${id}`, d),
  delete: (id) => del(`/leads/${id}`),
};

// ── Conversations (Inbox) ──────────────────────
export const conversations = {
  list: () => get("/conversations"),
  get: (id) => get(`/conversations/${id}`),
  byChat: (chatId) => get(`/conversations/by-chat/${chatId}`),
  create: (data) => post("/conversations", data),
  sync: (id) => post(`/conversations/${id}/sync`, {}),
  reply: (id, d) => post(`/conversations/${id}/reply`, d),
  pauseAI: (id) => post(`/conversations/${id}/pause-ai`, {}),
  resumeAI: (id) => post(`/conversations/${id}/resume-ai`, {}),
  markBooked: (id, data = {}) => post(`/conversations/${id}/mark-booked`, data),
  aiEdit: (data) => post("/conversations/ai-edit", data),
};

// ── Meetings ───────────────────────────────────
export const meetings = {
  list: () => get("/meetings"),
};

// ── Profiles ───────────────────────────────────
export const profiles = {
  list: () => get("/profiles"),
};

// ── Unipile ────────────────────────────────────
export const unipile = {
  // Accounts
  getAccounts: () => get('/unipile/accounts'),
  connectAccount: (name) => post('/unipile/accounts/connect', { name }),
  disconnectAccount: (id) => del(`/unipile/accounts/${id}`),

  // Inbox / chats
  getChats: (accountId, { limit, cursor } = {}) => {
    const params = new URLSearchParams()
    if (accountId) params.append('account_id', accountId)
    if (limit) params.append('limit', String(limit))
    if (cursor) params.append('cursor', cursor)
    const qs = params.toString()
    return get(`/unipile/chats${qs ? `?${qs}` : ''}`)
  },
  getMessages: (chatId, { limit, cursor } = {}) => {
    const params = new URLSearchParams()
    if (limit) params.append('limit', String(limit))
    if (cursor) params.append('cursor', cursor)
    const qs = params.toString()
    return get(`/unipile/chats/${chatId}/messages${qs ? `?${qs}` : ''}`)
  },
  sendChatMessage: (chatId, text) => post(`/unipile/chats/${chatId}/messages`, { text }),

  // Outreach
  sendInvite: (data) => post('/unipile/invite', data),
  sendMessage: (data) => post('/unipile/message', data),

  // Lead Finder
  getLinkedInProfile: (accountId, linkedinUrl) =>
    get(`/unipile/linkedin/profile?account_id=${encodeURIComponent(accountId)}&linkedin_url=${encodeURIComponent(linkedinUrl)}`),
  searchPeople: (accountId, payload = {}) =>
    post('/unipile/linkedin/search', { account_id: accountId, ...payload }),
  getPostEngagers: (accountId, postUrl, type = 'likers') =>
    get(`/unipile/post-engagers?account_id=${encodeURIComponent(accountId)}&post_url=${encodeURIComponent(postUrl)}&type=${type}`),
}

// ── Dashboard ──────────────────────────────────
export const dashboard = {
  get: () => get('/dashboard'),
}

// ── Members ────────────────────────────────────
export const members = {
  list: (workspaceId) =>
    get(`/members?workspace_id=${encodeURIComponent(String(workspaceId))}`),
  invite: (data) => post("/members/invite", data),
  accept: (payload) => post("/members/accept", payload),
  updateRole: (memberId, role) => request("PATCH", `/members/${memberId}/role`, { role }),
  remove: (memberId) => del(`/members/${memberId}`),
  cancelInvite: (inviteId) => del(`/members/invites/${inviteId}`),
  resendInvite: (inviteId) => post(`/members/invites/${inviteId}/resend`),
};
