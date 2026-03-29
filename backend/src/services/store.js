// ─────────────────────────────────────────────────────────────────
// ReachFlow In-Memory Store
// All records carry workspaceId so Postgres migration is a drop-in.
// ─────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";

const DEFAULT_WORKSPACE_ID = "ws_default";

const db = {
  workspaces: [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: "Creative Deer",
      linkedinAccount: "Asdren Zhubi",
      createdAt: new Date().toISOString(),
      profile: {
        companyName: "Creative Deer",
        website: "https://creativedeer.co.uk",
        valueProp:
          "We help UK SMEs and startups grow online with web design, digital marketing, and growth automation.",
        services:
          "Web design, Google Ads, Meta Ads, social media, automation, lead generation, LinkedIn outreach",
        socialProof: "",
        tone: "Professional-Friendly",
        calendarLink: "",
      },
    },
  ],
  agents: [],
  campaigns: [],
  leads: [],
  conversations: [],
  meetings: [],
};

// ── Workspace ──────────────────────────────────────────────────
export const workspaceStore = {
  get: (id = DEFAULT_WORKSPACE_ID) =>
    db.workspaces.find((w) => w.id === id) || null,

  update: (id = DEFAULT_WORKSPACE_ID, data) => {
    const idx = db.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    db.workspaces[idx] = {
      ...db.workspaces[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return db.workspaces[idx];
  },

  getProfile: (id = DEFAULT_WORKSPACE_ID) => {
    const ws = db.workspaces.find((w) => w.id === id);
    return ws?.profile || null;
  },

  updateProfile: (id = DEFAULT_WORKSPACE_ID, profileData) => {
    const idx = db.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return null;
    db.workspaces[idx].profile = {
      ...db.workspaces[idx].profile,
      ...profileData,
    };
    return db.workspaces[idx].profile;
  },
};

// ── Agents ─────────────────────────────────────────────────────
export const agentStore = {
  list: (workspaceId = DEFAULT_WORKSPACE_ID) =>
    db.agents.filter((a) => a.workspaceId === workspaceId),

  get: (id) => db.agents.find((a) => a.id === id) || null,

  create: (workspaceId = DEFAULT_WORKSPACE_ID, data) => {
    const agent = {
      id: `agent_${randomUUID().slice(0, 8)}`,
      workspaceId,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    db.agents.push(agent);
    return agent;
  },

  update: (id, data) => {
    const idx = db.agents.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    db.agents[idx] = {
      ...db.agents[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return db.agents[idx];
  },

  delete: (id) => {
    const idx = db.agents.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    db.agents.splice(idx, 1);
    return true;
  },
};

// ── Campaigns ──────────────────────────────────────────────────
export const campaignStore = {
  list: (workspaceId = DEFAULT_WORKSPACE_ID) =>
    db.campaigns.filter((c) => c.workspaceId === workspaceId),

  get: (id) => db.campaigns.find((c) => c.id === id) || null,

  create: (workspaceId = DEFAULT_WORKSPACE_ID, data) => {
    const campaign = {
      id: `camp_${randomUUID().slice(0, 8)}`,
      workspaceId,
      status: "draft",
      sequence: { nodes: [] },
      settings: {
        dailyConnectionLimit: 20,
        dailyMessageLimit: 30,
        timezone: "Europe/London",
        activeHoursStart: "09:00",
        activeHoursEnd: "18:00",
      },
      analytics: { sent: 0, accepted: 0, replied: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    db.campaigns.push(campaign);
    return campaign;
  },

  update: (id, data) => {
    const idx = db.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.campaigns[idx] = {
      ...db.campaigns[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return db.campaigns[idx];
  },

  delete: (id) => {
    const idx = db.campaigns.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    db.campaigns.splice(idx, 1);
    return true;
  },

  getLeads: (campaignId) => db.leads.filter((l) => l.campaignId === campaignId),

  addLead: (campaignId, leadData) => {
    const lead = {
      id: `lead_${randomUUID().slice(0, 8)}`,
      campaignId,
      status: "pending",
      addedAt: new Date().toISOString(),
      ...leadData,
    };
    db.leads.push(lead);
    return lead;
  },
};

// ── Leads ──────────────────────────────────────────────────────
export const leadStore = {
  list: (workspaceId = DEFAULT_WORKSPACE_ID) =>
    db.leads.filter((l) => l.workspaceId === workspaceId),

  get: (id) => db.leads.find((l) => l.id === id) || null,

  create: (workspaceId = DEFAULT_WORKSPACE_ID, data) => {
    const lead = {
      id: `lead_${randomUUID().slice(0, 8)}`,
      workspaceId,
      createdAt: new Date().toISOString(),
      ...data,
    };
    db.leads.push(lead);
    return lead;
  },

  update: (id, data) => {
    const idx = db.leads.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    db.leads[idx] = { ...db.leads[idx], ...data };
    return db.leads[idx];
  },

  delete: (id) => {
    const idx = db.leads.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    db.leads.splice(idx, 1);
    return true;
  },
};

// ── Conversations ──────────────────────────────────────────────
export const conversationStore = {
  list: (workspaceId = DEFAULT_WORKSPACE_ID) =>
    db.conversations.filter((c) => c.workspaceId === workspaceId),

  get: (id) => db.conversations.find((c) => c.id === id) || null,

  create: (workspaceId = DEFAULT_WORKSPACE_ID, data) => {
    const conv = {
      id: `conv_${randomUUID().slice(0, 8)}`,
      workspaceId,
      messages: [],
      status: "ai_active",
      aiPaused: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    db.conversations.push(conv);
    return conv;
  },

  addMessage: (id, message) => {
    const conv = db.conversations.find((c) => c.id === id);
    if (!conv) return null;
    conv.messages.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...message,
    });
    conv.updatedAt = new Date().toISOString();
    return conv;
  },

  update: (id, data) => {
    const idx = db.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.conversations[idx] = {
      ...db.conversations[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return db.conversations[idx];
  },
};

// ── Meetings ───────────────────────────────────────────────────
export const meetingStore = {
  list: (workspaceId = DEFAULT_WORKSPACE_ID) =>
    db.meetings.filter((m) => m.workspaceId === workspaceId),

  create: (workspaceId = DEFAULT_WORKSPACE_ID, data) => {
    const meeting = {
      id: `mtg_${randomUUID().slice(0, 8)}`,
      workspaceId,
      createdAt: new Date().toISOString(),
      ...data,
    };
    db.meetings.push(meeting);
    return meeting;
  },
};
