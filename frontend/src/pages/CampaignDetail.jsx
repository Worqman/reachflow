import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation, useParams } from "react-router-dom";
import LeadFinderModal from "../components/LeadFinderModal";
import ProfileUrlModal from "../components/ProfileUrlModal";
import PostEngagersModal from "../components/PostEngagersModal";
import LinkedInProfileModal from "../components/LinkedInProfileModal";
import ImportContactsModal from "../components/ImportContactsModal";
import Modal from "../components/Modal";
import { Sk, SkeletonTableRows } from "../components/Skeleton";
import {
  campaigns as campaignsApi,
  agents as agentsApi,
  leads as leadsApi,
  leadLists as leadListsApi,
  unipile,
} from "../lib/api";
import { useToast } from "../components/Toast";
import "./CampaignDetail.css";

// ── Step type definitions ─────────────────────────────────────
const STEP_TYPES = [
  // Actions
  {
    type: "visit_profile",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    label: "Visit profile",
    hasConfig: false,
  },
  {
    type: "like_post",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    label: "Like last post",
    hasConfig: false,
  },
  {
    type: "follow",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
      </svg>
    ),
    label: "Follow Lead",
    hasConfig: false,
  },
  {
    type: "wait",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    label: "Wait x days",
    hasConfig: true,
  },
  {
    type: "connection_request",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="16" y1="11" x2="22" y2="11" />
      </svg>
    ),
    label: "Send connection request",
    hasConfig: true,
    isCondition: true,
  },
  {
    type: "message",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    label: "Send message",
    hasConfig: true,
    isCondition: true,
  },
  {
    type: "voice_note",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
    label: "Send voice note",
    hasConfig: true,
  },
  {
    type: "comment_post",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    label: "Comment last post",
    hasConfig: true,
  },
  {
    type: "inmail",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    label: "LinkedIn InMail",
    hasConfig: true,
    isCondition: true,
  },
  {
    type: "add_tag",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    label: "Add tag",
    hasConfig: true,
  },
  {
    type: "reply_comment",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    ),
    label: "Reply Comment",
    hasConfig: true,
  },
  {
    type: "message_open",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    label: "Send message to open profile",
    hasConfig: true,
    isCondition: true,
  },
  // Conditions
  {
    type: "cond_has_linkedin",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    label: "Has LinkedIn URL",
    hasConfig: false,
    isCondition: true,
  },
  {
    type: "cond_1st_level",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    label: "Lead is 1st level",
    hasConfig: false,
    isCondition: true,
  },
  {
    type: "cond_opened_message",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    label: "Opened LinkedIn Message",
    hasConfig: false,
    isCondition: true,
  },
  {
    type: "cond_check_column",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
    label: "Check data in column",
    hasConfig: true,
    isCondition: true,
  },
  {
    type: "cond_open_profile",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    label: "Lead is Open Profile",
    hasConfig: false,
    isCondition: true,
  },
];

const ACTION_STEPS = [
  {
    type: "connection_request",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="16" y1="11" x2="22" y2="11" />
      </svg>
    ),
    label: "Send connection request",
  },
  {
    type: "message",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    label: "Send message",
  },
  {
    type: "voice_note",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
    label: "Send voice note",
  },
  {
    type: "comment_post",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    label: "Comment last post",
  },
  {
    type: "like_post",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    label: "Like last post",
  },
  {
    type: "visit_profile",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    label: "Visit profile",
  },
  {
    type: "inmail",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
    label: "LinkedIn InMail",
  },
  {
    type: "add_tag",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
    label: "Add tag",
  },
  {
    type: "reply_comment",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    ),
    label: "Reply Comment",
  },
  {
    type: "message_open",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    label: "Send message to open profile",
  },
  {
    type: "follow",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
      </svg>
    ),
    label: "Follow Lead",
  },
  {
    type: "wait",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    label: "Wait x days",
  },
];

const CONDITION_STEPS = [
  {
    type: "cond_has_linkedin",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    label: "Has LinkedIn URL",
  },
  {
    type: "cond_1st_level",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    label: "Lead is 1st level",
  },
  {
    type: "cond_opened_message",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    label: "Opened LinkedIn Message",
  },
  {
    type: "cond_check_column",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
    label: "Check data in column",
  },
  {
    type: "cond_open_profile",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    label: "Lead is Open Profile",
  },
];

function stepMeta(type) {
  return (
    STEP_TYPES.find((s) => s.type === type) || {
      icon: "◎",
      label: type,
      hasConfig: false,
    }
  );
}

function waitLabel(config) {
  const n = config?.days || 1;
  const unit = config?.unit || "days";
  const unitLabel =
    unit === "minutes"
      ? n !== 1
        ? "mins"
        : "min"
      : unit === "hours"
        ? n !== 1
          ? "hours"
          : "hour"
        : n !== 1
          ? "days"
          : "day";
  return `Wait ${n} ${unitLabel}`;
}

function getBranchLabels(nodeType) {
  switch (nodeType) {
    case 'connection_request': return { no: 'Not Accepted Yet', yes: 'Accepted' }
    case 'message': case 'message_open': case 'inmail': return { no: 'Not Replied', yes: 'Replied' }
    case 'cond_has_linkedin': return { no: 'No LinkedIn', yes: 'Has LinkedIn' }
    case 'cond_1st_level': return { no: 'Not 1st Level', yes: '1st Level' }
    case 'cond_opened_message': return { no: 'Not Opened', yes: 'Opened' }
    case 'cond_check_column': return { no: 'No Match', yes: 'Matches' }
    case 'cond_open_profile': return { no: 'Not Open Profile', yes: 'Open Profile' }
    default: return { no: 'No', yes: 'Yes' }
  }
}

function nodeLabel(node) {
  if (node.type === "wait") return waitLabel(node.config);
  return stepMeta(node.type).label;
}

function nodeConfigured(node) {
  const meta = stepMeta(node.type);
  if (!meta.hasConfig) return true;
  if (node.type === "wait") return (node.config?.days || 0) > 0;
  if (node.type === "connection_request") return true;
  if (
    [
      "message",
      "message_open",
      "voice_note",
      "comment_post",
      "reply_comment",
    ].includes(node.type)
  )
    return !!node.config?.text?.trim();
  if (node.type === "inmail")
    return !!node.config?.subject?.trim() && !!node.config?.body?.trim();
  if (node.type === "add_tag") return !!node.config?.tag?.trim();
  if (node.type === "cond_check_column") return !!node.config?.field?.trim();
  return true;
}

const IMPORT_SOURCES = [
  {
    id: "finder",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    label: "Lead Finder",
    desc: "Search Apollo's 300M+ contact database",
  },
  {
    id: "list",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
    label: "My Leads",
    desc: "Add leads from your saved lead database",
  },
  {
    id: "csv",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    label: "Import from CSV",
    desc: "Upload a CSV of LinkedIn profile URLs",
  },
  {
    id: "url",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    label: "LinkedIn Search URL",
    desc: "Paste a LinkedIn search results URL",
  },
  {
    id: "profile",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    label: "LinkedIn Profile URL",
    desc: "Paste a single LinkedIn profile URL to import one person",
  },
  {
    id: "event",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    label: "LinkedIn Event",
    desc: "Import attendees from a LinkedIn event",
  },
  {
    id: "post",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    label: "LinkedIn Post",
    desc: "Import people who liked or commented",
  },
  {
    id: "group",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    label: "LinkedIn Group",
    desc: "Import members from a LinkedIn group",
  },
  {
    id: "list",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
    label: "Add from my list",
    desc: "Choose from your saved lead lists",
  },
];

const STATUS_COLORS = {
  pending: "badge-muted",
  invited: "badge-warning",
  connected: "badge-signal",
  replied: "badge-info",
  booked: "badge-signal",
  rejected: "badge-danger",
  failed: "badge-danger",
  skipped: "badge-muted",
};

const PERSONA_FIELDS = [
  {
    key: "roleAndObjective",
    label: "Role & Objective",
    rows: 3,
    placeholder:
      "Describe what this AI assistant's role is and what it's trying to achieve…",
  },
  {
    key: "toneAndStyle",
    label: "Tone & Style",
    rows: 3,
    placeholder: "How should it communicate — tone, word limits, style rules…",
  },
  {
    key: "movingToCall",
    label: "Moving to Call",
    rows: 3,
    placeholder: "When and how to transition to suggesting a meeting…",
  },
  {
    key: "objectionHandling",
    label: "Objection Handling",
    rows: 4,
    placeholder:
      "How to handle: not right person, too small, are you automated, need partner approval…",
  },
  {
    key: "finalRules",
    label: "Final Rules",
    rows: 3,
    placeholder:
      "Word limits, dos and donts, must-follow rules for every message…",
  },
];

// ── Main component ───────────────────────────────────────────
export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const isSetup = new URLSearchParams(search).get("setup") === "true";
  const { toast } = useToast();

  const [campaign, setCampaign] = useState(null);
  const [leads, setLeads] = useState([]);
  const [agents, setAgents] = useState([]);
  const [linkedinAccounts, setLinkedinAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("leads");
  const [showImport, setShowImport] = useState(false);
  const [importContactsOpen, setImportContactsOpen] = useState(false);
  const [savingImportContacts, setSavingImportContacts] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [campaignLeadLists, setCampaignLeadLists] = useState([]);
  const [lfOpen, setLfOpen] = useState(false);
  const [profileUrlOpen, setProfileUrlOpen] = useState(false);
  const [linkedInProfileOpen, setLinkedInProfileOpen] = useState(false);
  const [postEngagersOpen, setPostEngagersOpen] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [sendingMessageFor, setSendingMessageFor] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function handleSendInvites() {
    setSendingInvites(true);
    try {
      const result = await campaignsApi.sendInvites(id);
      const count = result.queued ?? result.sent ?? 0;
      if (count === 0) {
        toast?.(
          result.message || "No pending leads to send invites to",
          "danger",
        );
      } else {
        toast?.(
          `Queued ${count} connection request${count !== 1 ? "s" : ""} — sending with delays`,
          "success",
        );
        // Delay refresh slightly to allow the first invite status to be written
        setTimeout(refreshLeads, 3000);
      }
    } catch (err) {
      toast?.(err.message || "Failed to send invites", "danger");
    } finally {
      setSendingInvites(false);
    }
  }

  async function syncStatuses(silent = false) {
    if (!silent) setSyncing(true);
    try {
      const result = await campaignsApi.syncStatuses(id);
      if (result.connected > 0) {
        toast?.(
          `${result.connected} new connection${result.connected !== 1 ? "s" : ""} detected — messages sent`,
          "success",
        );
        refreshLeads();
      } else if (!silent) {
        toast?.("No new connections found", "success");
      }
    } catch (err) {
      if (!silent) toast?.(err.message || "Sync failed", "danger");
    } finally {
      if (!silent) setSyncing(false);
    }
  }

  // Auto-poll every 30s when on leads tab — sync connections + messages
  useEffect(() => {
    if (tab !== "leads") return;
    const hasInvited = leads.some((l) => l.status === "invited");
    const hasActive = leads.some((l) =>
      ["connected", "replied"].includes(l.status),
    );
    if (!hasInvited && !hasActive) return;

    const interval = setInterval(async () => {
      if (hasInvited) syncStatuses(true);
      if (hasActive) {
        try {
          const result = await campaignsApi.syncMessages(id);
          if (result.processed > 0) refreshLeads();
        } catch {
          /* silent */
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [tab, leads, id]);

  async function handleDeleteLead(leadId) {
    try {
      await campaignsApi.deleteLead(id, leadId);
      refreshLeads();
    } catch (err) {
      toast?.(err.message || "Failed to delete lead", "danger");
    }
  }

  async function handleSendLeadMessage(leadId) {
    setSendingMessageFor(leadId);
    try {
      await campaignsApi.sendLeadMessage(id, leadId);
      toast?.("AI opening message sent", "success");
      refreshLeads();
    } catch (err) {
      toast?.(err.message || "Failed to send message", "danger");
    } finally {
      setSendingMessageFor(null);
    }
  }

  async function refreshLeads() {
    try {
      const data = await campaignsApi.getLeads(id);
      setLeads(Array.isArray(data) ? data : []);
    } catch {}
  }

  // Load LinkedIn accounts + lead lists for ImportContactsModal
  useEffect(() => {
    unipile.getAccounts().then((data) => {
      setWorkspaceMembers(Array.isArray(data?.items) ? data.items : []);
    }).catch(() => {});
    leadListsApi.list().then((data) => {
      setCampaignLeadLists(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  // Called after any import modal completes in setup mode
  async function handleSetupImportDone() {
    await refreshLeads();
    if (isSetup) setImportContactsOpen(true);
  }

  async function handleImportContactsConfirm({ userId, listId }) {
    setSavingImportContacts(true);
    try {
      const saves = [];
      if (userId) {
        const acc = workspaceMembers.find((a) => a.id === userId);
        saves.push(
          campaignsApi.update(id, {
            settings: {
              ...campaign?.settings,
              linkedinAccountId: userId,
              linkedinAccountName: acc?.name || acc?.username || "",
            },
          }).then((updated) => setCampaign(updated)).catch(() => {})
        );
      }
      if (listId) {
        const leadsToSave = leads.map((l) => ({
          name: l.name,
          title: l.title,
          company: l.company,
          location: l.location,
          linkedinUrl: l.linkedinUrl,
          providerId: l.providerId,
        }));
        saves.push(leadsApi.bulkCreate(leadsToSave, listId).catch(() => {}));
      }
      await Promise.all(saves);
    } finally {
      setSavingImportContacts(false);
    }
    setImportContactsOpen(false);
    setTab("builder");
  }

  async function handleCreateLeadList(name) {
    const created = await leadListsApi.create(name);
    setCampaignLeadLists((prev) => [...prev, created]);
    return created;
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [camp, campLeads, agentList, accs] = await Promise.allSettled([
          campaignsApi.get(id),
          campaignsApi.getLeads(id),
          agentsApi.list(),
          unipile.getAccounts(),
        ]);
        if (camp.status === "fulfilled") setCampaign(camp.value);
        const loadedLeads =
          campLeads.status === "fulfilled"
            ? Array.isArray(campLeads.value)
              ? campLeads.value
              : []
            : [];
        setLeads(loadedLeads);
        if (agentList.status === "fulfilled")
          setAgents(Array.isArray(agentList.value) ? agentList.value : []);
        if (accs.status === "fulfilled")
          setLinkedinAccounts(accs.value?.items || []);

        // Auto-sync on load if any leads are in 'invited' state
        const hasInvited = loadedLeads.some((l) => l.status === "invited");
        if (hasInvited) syncStatuses(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleToggleStatus() {
    if (!campaign) return;
    const next = campaign.status === "active" ? "paused" : "active";
    try {
      const updated = await campaignsApi.update(id, { status: next });
      setCampaign(updated);
      if (next === "active") {
        // Immediately trigger invites when user clicks Run
        campaignsApi.sendInvites(id).catch(() => {});
        toast?.("Campaign started — sending invites", "success");
      } else {
        toast?.("Campaign paused", "success");
      }
    } catch (err) {
      toast?.(err.message || "Could not update status", "danger");
    }
  }

  if (loading) {
    return (
      <div className="campaign-detail animate-fade-in">
        <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sk w={80} h={14} r={4} />
            <Sk w={180} h={20} r={6} />
            <Sk w={64} h={22} r={99} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => <Sk key={i} w={80} h={28} r={6} />)}
          </div>
          <div className="table-wrap" style={{ marginTop: 4 }}>
            <table><tbody><SkeletonTableRows rows={6} cols={6} /></tbody></table>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="campaign-detail animate-fade-in">
        <div style={{ padding: "20px 28px" }}>
          <Link to="/campaigns" className="detail-back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Campaigns
          </Link>
          <div style={{ marginTop: 24, color: "#9ca3af", fontSize: 13 }}>Campaign not found.</div>
        </div>
      </div>
    );
  }

  const selectedAgent =
    agents.find((a) => a.id === campaign.settings?.agentId) || null;

  return (
    <div className="campaign-detail animate-fade-in">
      {/* Top bar */}
      <div className="detail-topbar">
        <div className="detail-topbar-left">
          <Link to="/campaigns" className="detail-back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Campaigns
          </Link>
          <span className="detail-breadcrumb-sep">/</span>
          <span className="detail-campaign-name">{campaign.name}</span>
          <span className={`detail-status-pill ${campaign.status === "active" ? "active" : "paused"}`}>
            <span className="detail-status-dot" />
            {campaign.status === "active" ? "Active" : "Paused"}
          </span>
        </div>

        <div className="detail-topbar-right">
          {!isSetup && selectedAgent && (
            <span className="detail-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/>
                <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
              </svg>
              {selectedAgent.name}
            </span>
          )}
          {!isSetup && campaign.settings?.linkedinAccountName && (
            <span className="detail-chip">
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 12, height: 12, color: '#0a66c2' }}>
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
              {campaign.settings.linkedinAccountName}
            </span>
          )}
          {isSetup ? (
            <span className="detail-setup-hint">Complete each step to launch</span>
          ) : (
            <button
              className={`detail-run-btn ${campaign.status === "active" ? "pausing" : ""}`}
              onClick={handleToggleStatus}
            >
              {campaign.status === "active" ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Run Campaign
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tabs / Setup stepper */}
      <div className="detail-tabs">
        {isSetup
          ? [
              { key: "leads",    label: "Leads" },
              { key: "accounts", label: "LinkedIn Accounts" },
              { key: "builder",  label: "Sequences" },
              { key: "schedule", label: "Schedule" },
            ].map(({ key, label }, i) => (
              <button
                key={key}
                className={`detail-tab setup-wizard-tab ${tab === key ? "active" : ""}`}
                onClick={() => setTab(key)}
              >
                <span className="setup-step-num">{i + 1}</span>
                {label}
              </button>
            ))
          : ["leads", "builder", "persona", "analytics", "settings"].map((t) => (
              <button
                key={t}
                className={`detail-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))
        }
      </div>

      <LeadFinderModal
        open={lfOpen}
        onClose={() => setLfOpen(false)}
        onImport={isSetup ? handleSetupImportDone : refreshLeads}
        campaignId={id}
      />

      <ProfileUrlModal
        open={profileUrlOpen}
        onClose={() => setProfileUrlOpen(false)}
        onImport={isSetup ? handleSetupImportDone : refreshLeads}
        campaignId={id}
      />

      <PostEngagersModal
        open={postEngagersOpen}
        onClose={() => setPostEngagersOpen(false)}
        onImport={isSetup ? handleSetupImportDone : refreshLeads}
        campaignId={id}
      />

      <LinkedInProfileModal
        open={linkedInProfileOpen}
        onClose={() => setLinkedInProfileOpen(false)}
        onImport={isSetup ? handleSetupImportDone : refreshLeads}
        campaignId={id}
      />

      <ImportContactsModal
        open={importContactsOpen}
        onClose={() => setImportContactsOpen(false)}
        onConfirm={handleImportContactsConfirm}
        members={workspaceMembers}
        lists={campaignLeadLists}
        onCreateList={handleCreateLeadList}
        saving={savingImportContacts}
      />

      {/* Tab content */}
      <div
        key={tab}
        className={`detail-content animate-tab-in${tab !== "builder" ? " detail-content-padded" : ""}`}
      >
        {tab === "leads" && (
          <LeadsTab
            campaignId={id}
            leads={leads}
            onImport={() => setShowImport(true)}
            showImport={showImport}
            onCloseImport={() => setShowImport(false)}
            onOpenLeadFinder={(which = "finder") => {
              setShowImport(false);
              if (which === "url") setProfileUrlOpen(true);
              else if (which === "post") setPostEngagersOpen(true);
              else if (which === "profile") setLinkedInProfileOpen(true);
              else setLfOpen(true);
            }}
            onSendInvites={handleSendInvites}
            sendingInvites={sendingInvites}
            onSendMessage={handleSendLeadMessage}
            sendingMessageFor={sendingMessageFor}
            onDeleteLead={handleDeleteLead}
            onSync={() => syncStatuses(false)}
            syncing={syncing}
            onRefreshLeads={refreshLeads}
            onSetupImportDone={isSetup ? handleSetupImportDone : undefined}
            isSetup={isSetup}
            onSetupNext={() => setTab("accounts")}
            linkedinAccounts={linkedinAccounts}
            campaign={campaign}
            onSaveCampaign={setCampaign}
          />
        )}
        {tab === "builder" && (
          <BuilderTab
            campaignId={id}
            initialNodes={campaign.sequence?.nodes || []}
            linkedinAccounts={linkedinAccounts}
            leads={leads}
            onSaved={(updated) => {
              setCampaign((prev) => ({ ...prev, sequence: updated }));
              if (isSetup) setTab("schedule");
            }}
            toast={toast}
            campaignStatus={campaign.status}
            onToggleStatus={handleToggleStatus}
            isSetup={isSetup}
            onSetupNext={() => setTab("schedule")}
          />
        )}
        {tab === "accounts" && isSetup && (
          <AccountsSetupTab
            campaignId={id}
            campaign={campaign}
            linkedinAccounts={linkedinAccounts}
            agents={agents}
            onSaved={(updated) => {
              setCampaign(updated);
              setTab("builder");
            }}
            toast={toast}
          />
        )}
        {tab === "persona" && !isSetup && (
          <PersonaTab
            campaignId={id}
            campaign={campaign}
            agents={agents}
            onSaved={(updated) => { setCampaign(updated) }}
            toast={toast}
            isSetup={false}
          />
        )}
        {tab === "analytics" && !isSetup && <AnalyticsTab campaignId={id} />}
        {tab === "settings" && !isSetup && (
          <SettingsTab
            campaign={campaign}
            agents={agents}
            linkedinAccounts={linkedinAccounts}
            onSaved={(updated) => { setCampaign(updated) }}
            toast={toast}
            isSetup={false}
          />
        )}
        {tab === "schedule" && isSetup && (
          <ScheduleSetupTab
            campaign={campaign}
            onSaved={(updated) => {
              setCampaign(updated);
              navigate(`/campaigns/${id}`, { replace: true });
            }}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
}

// ── My Leads Picker Modal ────────────────────────────────────
function MyLeadsPickerModal({ open, onClose, campaignId, onImported }) {
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [leadsMap, setLeadsMap] = useState({}); // listId → leads[]
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selected, setSelected] = useState([]); // lead ids
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');

  // Load lists on open
  useEffect(() => {
    if (!open) { setSelected([]); setActiveListId(null); setLeadsMap({}); setSearch(''); return; }
    setLoadingLists(true);
    leadListsApi.list()
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        setLists(rows);
        if (rows.length > 0) setActiveListId(rows[0].id);
      })
      .catch(() => setLists([]))
      .finally(() => setLoadingLists(false));
  }, [open]);

  // Load leads when active list changes
  useEffect(() => {
    if (!activeListId) return;
    if (leadsMap[activeListId]) return; // already fetched
    setLoadingLeads(true);
    leadsApi.list(activeListId)
      .then((data) => setLeadsMap((prev) => ({ ...prev, [activeListId]: Array.isArray(data) ? data : [] })))
      .catch(() => setLeadsMap((prev) => ({ ...prev, [activeListId]: [] })))
      .finally(() => setLoadingLeads(false));
  }, [activeListId]);

  const activeLeads = (leadsMap[activeListId] || []).filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.name || '').toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q) || (l.title || '').toLowerCase().includes(q);
  });

  function toggle(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    const ids = activeLeads.map((l) => l.id);
    const allChecked = ids.every((id) => selected.includes(id));
    setSelected((prev) => allChecked ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }

  async function handleImport() {
    const allLeads = Object.values(leadsMap).flat();
    const toAdd = allLeads.filter((l) => selected.includes(l.id));
    if (!toAdd.length) return;
    setImporting(true);
    try {
      await campaignsApi.importLeads(campaignId, { leads: toAdd, source: 'list' });
      onImported();
      onClose();
    } catch {}
    setImporting(false);
  }

  if (!open) return null;

  const allActiveIds = activeLeads.map((l) => l.id);
  const allActiveChecked = allActiveIds.length > 0 && allActiveIds.every((id) => selected.includes(id));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box animate-fade-in mlp-modal">
        {/* Header */}
        <div className="mlp-header">
          <div>
            <div className="mlp-title">Add from My Leads</div>
            <div className="mlp-subtitle">Select a list, then choose leads to add to this campaign</div>
          </div>
          <button className="mlp-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body: two-pane */}
        <div className="mlp-body">
          {/* Left: list sidebar */}
          <div className="mlp-sidebar">
            <div className="mlp-sidebar-label">Lists</div>
            {loadingLists ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                {[1,2,3].map(i => <Sk key={i} w="90%" h={36} r={8} />)}
              </div>
            ) : lists.length === 0 ? (
              <div className="mlp-empty-sidebar">No lists yet</div>
            ) : (
              lists.map((lst) => {
                const lstLeads = leadsMap[lst.id] || [];
                const selCount = lstLeads.filter((l) => selected.includes(l.id)).length;
                return (
                  <button
                    key={lst.id}
                    className={`mlp-list-item ${activeListId === lst.id ? 'active' : ''}`}
                    onClick={() => { setActiveListId(lst.id); setSearch(''); }}
                  >
                    <div className="mlp-list-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    </div>
                    <div className="mlp-list-info">
                      <span className="mlp-list-name">{lst.name}</span>
                      {selCount > 0 && <span className="mlp-list-sel-badge">{selCount}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: leads */}
          <div className="mlp-leads-pane">
            {/* Search + select-all bar */}
            {!loadingLists && lists.length > 0 && (
              <div className="mlp-leads-toolbar">
                <div className="mlp-search-wrap">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    className="mlp-search"
                    placeholder="Search leads…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {activeLeads.length > 0 && (
                  <button className="mlp-sel-all" onClick={toggleAll}>
                    {allActiveChecked ? 'Deselect all' : `Select all (${activeLeads.length})`}
                  </button>
                )}
              </div>
            )}

            <div className="mlp-leads-list">
              {loadingLeads ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Sk w={36} h={36} r={999} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <Sk w="45%" h={13} />
                        <Sk w="65%" h={11} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : lists.length === 0 ? (
                <div className="mlp-empty-pane">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                  <div className="mlp-empty-title">No lists yet</div>
                  <div className="mlp-empty-desc">Go to My Leads and save leads to a list first.</div>
                </div>
              ) : activeLeads.length === 0 && search ? (
                <div className="mlp-empty-pane">
                  <div className="mlp-empty-title">No matches</div>
                  <div className="mlp-empty-desc">Try a different search term.</div>
                </div>
              ) : activeLeads.length === 0 ? (
                <div className="mlp-empty-pane">
                  <div className="mlp-empty-title">This list is empty</div>
                  <div className="mlp-empty-desc">Add leads to this list from Lead Finder or My Leads.</div>
                </div>
              ) : (
                activeLeads.map((lead) => {
                  const isChecked = selected.includes(lead.id);
                  return (
                    <div
                      key={lead.id}
                      className={`mlp-lead-row ${isChecked ? 'checked' : ''}`}
                      onClick={() => toggle(lead.id)}
                    >
                      <div className={`mlp-checkbox ${isChecked ? 'checked' : ''}`}>
                        {isChecked && <svg viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div className="mlp-avatar">{initials(lead.name).toUpperCase()}</div>
                      <div className="mlp-lead-info">
                        <div className="mlp-lead-name">{lead.name || '—'}</div>
                        <div className="mlp-lead-meta">
                          {[lead.title, lead.company].filter(Boolean).join(' · ') || <span style={{ color: '#d1d5db' }}>No details</span>}
                        </div>
                      </div>
                      {lead.linkedinUrl && (
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mlp-li-btn"
                          onClick={(e) => e.stopPropagation()}
                          title="View LinkedIn profile"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H6.477v-7H9v7zM7.694 8.717c-.771 0-1.286-.514-1.286-1.2s.514-1.2 1.371-1.2c.771 0 1.286.514 1.286 1.2s-.514 1.2-1.371 1.2zM18 17h-2.442v-3.826c0-1.058-.651-1.302-.895-1.302s-1.058.163-1.058 1.302V17h-2.523v-7h2.523v.977C13.93 10.407 14.581 10 15.802 10 17.023 10 18 10.977 18 13.174V17z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mlp-footer">
          <span className="mlp-footer-count">
            {selected.length > 0 ? `${selected.length} lead${selected.length !== 1 ? 's' : ''} selected` : 'No leads selected'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="mlp-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="mlp-btn-primary" disabled={selected.length === 0 || importing} onClick={handleImport}>
              {importing ? 'Adding…' : `Add ${selected.length > 0 ? selected.length : ''} to Campaign`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CSV field-type definitions for column mapping ─────────────
const CSV_FIELD_TYPES = [
  { value: '',              label: 'Skip this column' },
  { value: 'linkedin_url',  label: 'LinkedIn URL (Required)' },
  { value: 'first_name',    label: 'First Name' },
  { value: 'last_name',     label: 'Last Name' },
  { value: 'full_name',     label: 'Full Name' },
  { value: 'job_title',     label: 'Job Title' },
  { value: 'company',       label: 'Company' },
  { value: 'location',      label: 'Location' },
  { value: 'email',         label: 'Email' },
  { value: 'website',       label: 'Website' },
  { value: 'headline',      label: 'Headline' },
  { value: 'summary',       label: 'Summary' },
  { value: 'industry',      label: 'Industry' },
]

function detectFieldType(header) {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '_')
  if (h.includes('linkedin') || h === 'profile_url') return 'linkedin_url'
  if (h === 'first_name' || h === 'firstname' || h === 'first') return 'first_name'
  if (h === 'last_name' || h === 'lastname' || h === 'last' || h === 'surname') return 'last_name'
  if (h === 'full_name' || h === 'fullname' || h === 'name' || h === 'contact_name') return 'full_name'
  if (h.includes('job_title') || h === 'title' || h.includes('jobtitle') || h.includes('position') || h === 'role') return 'job_title'
  if (h.includes('company') || h.includes('organization') || h === 'employer') return 'company'
  if (h.includes('location') || h === 'city' || h === 'country' || h === 'region') return 'location'
  if (h.includes('email') || h.includes('mail')) return 'email'
  if (h === 'website' || h === 'web' || h === 'url') return 'website'
  if (h.includes('headline') || h === 'bio') return 'headline'
  if (h.includes('summary') || h.includes('about')) return 'summary'
  if (h.includes('industry') || h.includes('sector')) return 'industry'
  return ''
}

function parseCsvRaw(text) {
  function splitRow(row) {
    const cells = []; let cur = '', inQ = false
    for (const ch of row) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    cells.push(cur.trim())
    return cells
  }
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], sampleRows: [], allRows: [] }
  const rawHeaders = splitRow(lines[0])
  const headers = rawHeaders.map(h => h.replace(/^"|"$/g, '').trim())
  const allRows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]).map(c => c.replace(/^"|"$/g, '').trim())
    if (cells.every(c => !c)) continue
    allRows.push(cells)
  }
  return { headers, sampleRows: allRows.slice(0, 3), allRows }
}

function applyColumnMapping(allRows, headers, mapping) {
  return allRows.map((cells, i) => {
    const lead = { id: `csv_${i}` }
    let firstName = '', lastName = ''
    headers.forEach((h, colIdx) => {
      const type = mapping[h] || ''
      const val = cells[colIdx] || ''
      if (type === 'linkedin_url') lead.linkedinUrl = val
      else if (type === 'first_name') firstName = val
      else if (type === 'last_name') lastName = val
      else if (type === 'full_name') lead.name = val
      else if (type === 'job_title') lead.title = val
      else if (type === 'company') lead.company = val
      else if (type === 'location') lead.location = val
    })
    if (!lead.name && (firstName || lastName)) lead.name = [firstName, lastName].filter(Boolean).join(' ')
    if (!lead.name) lead.name = `Row ${i + 1}`
    return lead
  })
}

// ── CSV Setup Wizard steps ─────────────────────────────────────
function CsvSourceStep({ onSelectCsv, onSelectMyLeads }) {
  const cardStyle = { width: 320, border: '1px solid var(--border)', borderRadius: 12, padding: 28, cursor: 'pointer', background: 'var(--surface)', transition: 'border-color 0.15s' }
  const hover = e => e.currentTarget.style.borderColor = 'var(--signal)'
  const unhover = e => e.currentTarget.style.borderColor = 'var(--border)'
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Select Leads Source</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>Choose where you want to get your leads from</p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={cardStyle} onClick={onSelectMyLeads} onMouseEnter={hover} onMouseLeave={unhover}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 32, height: 32, marginBottom: 14, color: 'var(--signal)' }}>
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 1.657-4.03 3-9 3s-9-1.343-9-3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5" />
          </svg>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>My Leads</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
            Add leads from your saved lead database. Pick and choose who to include in this campaign.
          </div>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => { e.stopPropagation(); onSelectMyLeads() }}>
            Select →
          </button>
        </div>
        <div style={cardStyle} onClick={onSelectCsv} onMouseEnter={hover} onMouseLeave={unhover}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 32, height: 32, marginBottom: 14, color: 'var(--signal)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Upload CSV</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
            Import leads from a CSV file. The file should include LinkedIn URLs and other optional information.
          </div>
          <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => { e.stopPropagation(); onSelectCsv() }}>
            Select →
          </button>
        </div>
      </div>
    </div>
  )
}

function CsvUploadStep({ onFile, onBack }) {
  const fileRef = React.useRef()
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  function processFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) { setError('Please upload a .csv file'); return }
    const reader = new FileReader()
    reader.onload = e => {
      const { headers, sampleRows, allRows } = parseCsvRaw(e.target.result)
      if (!headers.length) { setError('No columns detected — check your CSV format'); return }
      if (!allRows.length) { setError('No data rows found — CSV must have at least one row after the header'); return }
      onFile(file, headers, sampleRows, allRows)
    }
    reader.readAsText(file)
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={onBack}>← Back</button>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Upload CSV File</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>LinkedIn URL is required. LinkedIn URLs and other optional information.</p>
      <div
        style={{ border: `2px dashed ${dragOver ? 'var(--signal)' : 'var(--border)'}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--surface-2)' : 'var(--surface)', transition: 'all 0.15s' }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]) }}
      >
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => processFile(e.target.files[0])} />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 40, height: 40, color: 'var(--text-muted)', margin: '0 auto 14px' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Click to choose a CSV file</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or drag and drop here</div>
      </div>
      {error && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
    </div>
  )
}

function CsvMappingStep({ file, headers, sampleData, allRows, mapping, onMappingChange, onImport, importing, error, onBack }) {
  const fileSizeKb = file ? Math.round(file.size / 1024) : 0

  function setFieldType(header, value) {
    // If assigning a unique field (like linkedin_url), clear it from other headers first
    const unique = ['linkedin_url', 'full_name']
    const updated = { ...mapping }
    if (unique.includes(value)) {
      Object.keys(updated).forEach(k => { if (updated[k] === value) updated[k] = '' })
    }
    updated[header] = value
    onMappingChange(updated)
  }

  const hasLinkedinUrl = Object.values(mapping).includes('linkedin_url')

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={onBack}>← Back</button>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        Match your CSV columns to the appropriate fields. <strong>LinkedIn URL is required.</strong>
      </p>

      {file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 24, width: 'fit-content' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 20, height: 20, color: 'var(--text-muted)', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>({fileSizeKb} KB) · {headers.length} columns detected · {allRows.length} rows</div>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '28%' }}>CSV Column</th>
              <th style={{ width: '36%' }}>Select Type</th>
              <th>Sample Data</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, hi) => {
              const sample = sampleData.map(row => row[hi] || '').filter(Boolean).slice(0, 3).join(', ')
              return (
                <tr key={header}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{header}</td>
                  <td>
                    <select
                      className="input"
                      style={{ fontSize: 13, padding: '5px 10px', height: 'auto' }}
                      value={mapping[header] || ''}
                      onChange={e => setFieldType(header, e.target.value)}
                    >
                      {CSV_FIELD_TYPES.map(ft => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sample}>{sample || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!hasLinkedinUrl && (
        <div style={{ fontSize: 13, color: 'var(--warning, #f59e0b)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⚠ Please map a column to "LinkedIn URL (Required)" before importing
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <button
        className="btn btn-primary"
        disabled={!hasLinkedinUrl || importing}
        onClick={onImport}
      >
        {importing ? 'Importing…' : `Import ${allRows.length} Contacts →`}
      </button>
    </div>
  )
}

// ── CSV Import Modal ─────────────────────────────────────────
function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return [];

  function splitRow(row) {
    const cells = [];
    let cur = "",
      inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitRow(lines[0]).map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );

  // Map common CSV column names to lead fields
  function pickCol(candidates) {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h === c || h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const nameIdx = pickCol([
    "name",
    "full_name",
    "fullname",
    "contact_name",
    "first_name",
  ]);
  const firstIdx = pickCol(["first_name", "firstname", "first"]);
  const lastIdx = pickCol(["last_name", "lastname", "last", "surname"]);
  const titleIdx = pickCol([
    "title",
    "job_title",
    "jobtitle",
    "position",
    "role",
    "headline",
  ]);
  const companyIdx = pickCol([
    "company",
    "company_name",
    "organization",
    "employer",
  ]);
  const locationIdx = pickCol(["location", "city", "country", "region", "geo"]);
  const linkedinIdx = pickCol([
    "linkedin",
    "linkedin_url",
    "linkedinurl",
    "profile_url",
    "linkedin_profile",
  ]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells.every((c) => !c)) continue;

    const get = (idx) =>
      idx !== -1 && cells[idx] ? cells[idx].replace(/^"|"$/g, "").trim() : "";

    let name = get(nameIdx);
    if (!name && (firstIdx !== -1 || lastIdx !== -1)) {
      name = [get(firstIdx), get(lastIdx)].filter(Boolean).join(" ").trim();
    }
    if (!name) name = `Row ${i}`;

    rows.push({
      id: `csv_${i}`,
      name,
      title: get(titleIdx),
      company: get(companyIdx),
      location: get(locationIdx),
      linkedinUrl: get(linkedinIdx),
      status: "Not contacted",
    });
  }
  return rows;
}

function CsvImportModal({ open, onClose, campaignId, onImported }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = React.useRef();

  function reset() {
    setRows([]);
    setError("");
    setFileName("");
  }
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCsv(e.target.result);
        if (!parsed.length) {
          setError("No valid rows found. Make sure the CSV has a header row.");
          setRows([]);
        } else {
          setRows(parsed);
          setError("");
        }
      } catch {
        setError("Could not parse CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    try {
      await campaignsApi.importLeads(campaignId, {
        leads: rows,
        source: "csv",
      });
      onImported();
      onClose();
    } catch (e) {
      setError(e.message || "Import failed");
    }
    setImporting(false);
  }

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-box animate-fade-in"
        style={{
          maxWidth: 620,
          display: "flex",
          flexDirection: "column",
          maxHeight: "85vh",
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title">⬆ Import from CSV</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: "auto" }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 16,
            }}
          >
            Upload a CSV with columns like <strong>name</strong>,{" "}
            <strong>linkedin_url</strong>, <strong>title</strong>,{" "}
            <strong>company</strong>, <strong>location</strong>.
          </p>

          <div
            style={{
              border: "2px dashed var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "28px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--surface)",
              marginBottom: 16,
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {fileName ? (
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  📄 {fileName}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  {rows.length} rows detected
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 24, marginBottom: 6 }}>⬆</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  Click to choose a CSV file
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  or drag and drop here
                </div>
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                fontSize: 13,
                color: "var(--danger, #e55)",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {rows.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Preview ({Math.min(rows.length, 5)} of {rows.length})
              </div>
              <div
                className="table-wrap"
                style={{ maxHeight: 220, overflowY: "auto" }}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Company</th>
                      <th>LinkedIn URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>
                          {r.name || "—"}
                        </td>
                        <td
                          style={{
                            fontSize: 13,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {r.title || "—"}
                        </td>
                        <td style={{ fontSize: 13 }}>{r.company || "—"}</td>
                        <td
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.linkedinUrl || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginTop: 6,
                  }}
                >
                  + {rows.length - 5} more rows
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={rows.length === 0 || importing}
            onClick={handleImport}
          >
            {importing
              ? "Importing…"
              : `Import ${rows.length > 0 ? rows.length : ""} Contacts →`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────
function LeadsTab({
  campaignId,
  leads,
  onImport,
  showImport,
  onCloseImport,
  onOpenLeadFinder,
  onSendInvites,
  sendingInvites,
  onSendMessage,
  sendingMessageFor,
  onDeleteLead,
  onSync,
  syncing,
  onRefreshLeads,
  onSetupImportDone,
  isSetup = false,
  onSetupNext,
  linkedinAccounts = [],
  campaign,
  onSaveCampaign,
}) {
  const { toast } = useToast();
  const invitedCount = leads.filter((l) => l.status === "invited").length;
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [myLeadsOpen, setMyLeadsOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [retryingFor, setRetryingFor] = useState(null);

  // Setup mode CSV wizard state
  const [csvPhase, setCsvPhase] = useState(() => leads.length > 0 ? 'done' : 'select');
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvSampleData, setCsvSampleData] = useState([]);
  const [csvAllRows, setCsvAllRows] = useState([]);
  const [csvMapping, setCsvMapping] = useState({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportError, setCsvImportError] = useState('');

  // (always declared — hooks must not be conditional)
  const [showSaveList, setShowSaveList] = useState(false);
  const [listName, setListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [savedListId, setSavedListId] = useState(null);
  const [nextLoading, setNextLoading] = useState(false);

  // Advance past wizard once leads are loaded (e.g. on page refresh after import)
  React.useEffect(() => {
    if (leads.length > 0 && csvPhase !== 'done') setCsvPhase('done');
  }, [leads.length]);

  // Setup mode: show CSV wizard phases inline (not the old list/import-panel flow)
  if (isSetup && csvPhase !== 'done') {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900 }}>
        <MyLeadsPickerModal
          open={myLeadsOpen}
          onClose={() => setMyLeadsOpen(false)}
          campaignId={campaignId}
          onImported={() => { setMyLeadsOpen(false); onSetupImportDone?.(); }}
        />
        {csvPhase === 'select' && (
          <CsvSourceStep
            onSelectCsv={() => setCsvPhase('upload')}
            onSelectMyLeads={() => setMyLeadsOpen(true)}
          />
        )}
        {csvPhase === 'upload' && (
          <CsvUploadStep
            onFile={(file, headers, sampleRows, allRows) => {
              setCsvFile(file);
              setCsvHeaders(headers);
              setCsvSampleData(sampleRows);
              setCsvAllRows(allRows);
              const autoMap = {};
              headers.forEach(h => { autoMap[h] = detectFieldType(h); });
              setCsvMapping(autoMap);
              setCsvPhase('map');
            }}
            onBack={() => setCsvPhase('select')}
          />
        )}
        {csvPhase === 'map' && (
          <CsvMappingStep
            file={csvFile}
            headers={csvHeaders}
            sampleData={csvSampleData}
            allRows={csvAllRows}
            mapping={csvMapping}
            onMappingChange={setCsvMapping}
            importing={csvImporting}
            error={csvImportError}
            onBack={() => setCsvPhase('upload')}
            onImport={async () => {
              setCsvImporting(true);
              setCsvImportError('');
              try {
                const mappedLeads = applyColumnMapping(csvAllRows, csvHeaders, csvMapping);
                await campaignsApi.importLeads(campaignId, { leads: mappedLeads, source: 'csv' });
                await onRefreshLeads?.();
                setCsvPhase('done');
              } catch (e) {
                setCsvImportError(e.message || 'Import failed');
              } finally {
                setCsvImporting(false);
              }
            }}
          />
        )}
      </div>
    );
  }

  async function handleSaveAsMyList() {
    if (!listName.trim()) return;
    setSavingList(true);
    try {
      const list = await leadListsApi.create(listName.trim());
      const leadsToAdd = leads.map((l) => ({
        name: l.name,
        title: l.title,
        company: l.company,
        location: l.location,
        linkedinUrl: l.linkedinUrl,
        providerId: l.providerId,
      }));
      await leadsApi.bulkCreate(leadsToAdd, list.id);
      setSavedListId(list.id);
      setShowSaveList(false);
      setListName("");
    } catch {
      /* silent */
    } finally {
      setSavingList(false);
    }
  }

  const handleRetry = async (leadId) => {
    setRetryingFor(leadId);
    try {
      await campaignsApi.updateLeadStatus(campaignId, leadId, "pending");
      await onRefreshLeads?.();
    } finally {
      setRetryingFor(null);
    }
  };

  const visibleLeads = leadsSearch
    ? leads.filter((l) => {
        const q = leadsSearch.toLowerCase();
        return (
          (l.name || "").toLowerCase().includes(q) ||
          (l.title || l.jobTitle || "").toLowerCase().includes(q) ||
          (l.company || "").toLowerCase().includes(q)
        );
      })
    : leads;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{ color: "var(--text-muted)", fontSize: 13, flexShrink: 0 }}
          >
            {leadsSearch
              ? `${visibleLeads.length} of ${leads.length} leads`
              : `${leads.length} leads in campaign`}
          </span>
          {leads.length > 0 && (
            <input
              className="input"
              style={{
                fontSize: 12,
                padding: "5px 10px",
                height: "auto",
                width: 200,
              }}
              placeholder="Search leads…"
              value={leadsSearch}
              onChange={(e) => setLeadsSearch(e.target.value)}
            />
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {invitedCount > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onSync}
              disabled={syncing}
              title="Check Unipile for accepted connections"
            >
              {syncing ? "↻ Syncing…" : `↻ Sync (${invitedCount} invited)`}
            </button>
          )}
          {/* {pendingCount > 0 && (
            <button
              className="btn btn-primary btn-sm"
              onClick={onSendInvites}
              disabled={sendingInvites}
            >
              {sendingInvites ? "Sending…" : `▶ Send Invites (${pendingCount})`}
            </button>
          )} */}
          {/* <button className="btn btn-secondary btn-sm" onClick={onImport}>
            + Import Contacts
          </button> */}
        </div>
      </div>

      {leads.length === 0 ? (
        <div
          style={{
            padding: "40px 0",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 10 }}>◎</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No leads yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>
            Import contacts to start your outreach.
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 15, padding: "10px 24px" }}
            onClick={onImport}
          >
            + Import Contacts
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleLeads.map((l) => (
                <tr key={l.id || l.name}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {l.name || l.firstName + " " + l.lastName || "—"}
                      {l.profileSummary && (
                        <span title={l.profileSummary} style={{ fontSize: 10, color: "var(--signal)", cursor: "help", flexShrink: 0 }}>◆</span>
                      )}
                      {l.linkedinUrl && (
                        <a
                          href={l.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cl-li-btn"
                          onClick={(e) => e.stopPropagation()}
                          title="View LinkedIn profile"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11">
                            <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H6.477v-7H9v7zM7.694 8.717c-.771 0-1.286-.514-1.286-1.2s.514-1.2 1.371-1.2c.771 0 1.286.514 1.286 1.2s-.514 1.2-1.371 1.2zM18 17h-2.442v-3.826c0-1.058-.651-1.302-.895-1.302s-1.058.163-1.058 1.302V17h-2.523v-7h2.523v.977C13.93 10.407 14.581 10 15.802 10 17.023 10 18 10.977 18 13.174V17z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {l.title || l.jobTitle || "—"}
                  </td>
                  <td>{l.company || "—"}</td>
                  <td>
                    <span
                      className={`badge ${STATUS_COLORS[l.status] || "badge-muted"}`}
                    >
                      {l.status || "pending"}
                    </span>
                    {l.lastError && (
                      <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 3, maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={l.lastError}>
                        {l.lastError}
                      </div>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {l.addedAt
                      ? new Date(l.addedAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td>
                    {l.status === "invited" && (
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                        title="Auto-detects acceptance every 30s"
                      >
                        ↻ Checking…
                      </span>
                    )}
                    {l.status === "connected" && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={sendingMessageFor === l.id}
                        onClick={() => onSendMessage(l.id)}
                        title="Generate and send AI opening message"
                      >
                        {sendingMessageFor === l.id ? "…" : "◆ Send AI Message"}
                      </button>
                    )}
                    {(l.status === "failed" || l.status === "skipped") && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={retryingFor === l.id}
                        onClick={() => handleRetry(l.id)}
                        title="Move back to pending so the next invite run retries this lead"
                      >
                        {retryingFor === l.id ? "…" : "↻ Retry"}
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)", marginLeft: 4 }}
                      onClick={() => setConfirmDelete(l)}
                      title="Remove lead from campaign"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isSetup && (
        <div className="setup-leads-footer">
          {leads.length > 0 && (
            savedListId ? (
              <span className="setup-saved-badge">✓ Saved to My Lists</span>
            ) : showSaveList ? (
              <div className="setup-save-list-row">
                <input
                  className="input"
                  style={{ width: 220 }}
                  placeholder="List name…"
                  value={listName}
                  onChange={e => setListName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && listName.trim() && handleSaveAsMyList()}
                  autoFocus
                />
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!listName.trim() || savingList}
                  onClick={handleSaveAsMyList}
                >
                  {savingList ? 'Saving…' : 'Save List'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowSaveList(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSaveList(true)}>
                + Save as My List
              </button>
            )
          )}
          <button
            className="btn btn-primary"
            disabled={leads.length === 0}
            onClick={onSetupNext}
            style={{ marginLeft: 'auto' }}
          >
            Next: LinkedIn Accounts →
          </button>
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove Lead"
        width={400}
      >
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginBottom: 20,
          }}
        >
          Remove <strong>{confirmDelete?.name || "this lead"}</strong> from the
          campaign? This cannot be undone.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmDelete(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: "var(--danger)",
              color: "#fff",
              borderColor: "var(--danger)",
            }}
            onClick={() => {
              onDeleteLead(confirmDelete.id);
              setConfirmDelete(null);
            }}
          >
            Remove Lead
          </button>
        </div>
      </Modal>

      <MyLeadsPickerModal
        open={myLeadsOpen}
        onClose={() => setMyLeadsOpen(false)}
        campaignId={campaignId}
        onImported={onSetupImportDone || onRefreshLeads}
      />

      <CsvImportModal
        open={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        campaignId={campaignId}
        onImported={onSetupImportDone || onRefreshLeads}
      />

      {showImport && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && onCloseImport()}
        >
          <div className="modal-box animate-fade-in" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2 className="modal-title">Import Contacts</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={onCloseImport}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                Choose a source to import leads into this campaign.
              </p>
              <div className="import-sources-grid">
                {IMPORT_SOURCES.map((s) => (
                  <div
                    key={s.id}
                    className="import-source-card"
                    onClick={() => {
                      if (s.id === "finder") {
                        onOpenLeadFinder("finder");
                      } else if (s.id === "url") {
                        onOpenLeadFinder("url");
                      } else if (s.id === "post") {
                        onOpenLeadFinder("post");
                      } else if (s.id === "profile") {
                        onOpenLeadFinder("profile");
                      } else if (s.id === "list") {
                        onCloseImport();
                        setMyLeadsOpen(true);
                      } else if (s.id === "csv") {
                        onCloseImport();
                        setCsvImportOpen(true);
                      } else {
                        toast(`${s.label} — coming soon`, 'info');
                      }
                    }}
                  >
                    <div className="import-source-icon">{s.icon}</div>
                    <div className="import-source-label">{s.label}</div>
                    <div className="import-source-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Builder Tab ───────────────────────────────────────────────
function BuilderTab({
  campaignId,
  initialNodes,
  linkedinAccounts,
  leads,
  onSaved,
  toast,
  campaignStatus,
  onToggleStatus,
  isSetup = false,
  onSetupNext,
}) {
  const [nodes, setNodes] = useState(() => {
    const expanded = [];
    (initialNodes || []).forEach((n, i) => {
      const parentId = n.id || `n_${i}`;
      const { noBranch, yesBranch, ...restConfig } = n.config || {};
      expanded.push({ ...n, _id: parentId, config: restConfig });
      if (noBranch?.length) {
        noBranch.forEach((nb, j) => {
          expanded.push({ ...nb, _id: nb.id || `nb_${parentId}_${j}`, _nobranchOf: parentId });
        });
      }
      if (yesBranch?.length) {
        yesBranch.forEach((yb, j) => {
          expanded.push({ ...yb, _id: yb.id || `yb_${parentId}_${j}`, _yesbranchOf: parentId });
        });
      }
    });
    return expanded;
  });
  // Pick a random campaign lead to use for message previews (falls back to
  // the static placeholder values when there are no leads yet). Memoised on
  // the lead set so it stays stable while typing.
  const sampleLead = React.useMemo(() => {
    if (!Array.isArray(leads) || leads.length === 0) return null;
    return leads[Math.floor(Math.random() * leads.length)];
  }, [leads]);
  const [selectedId, setSelectedId] = useState(null);
  const [addingAt, setAddingAt] = useState(null); // index to insert after (-1 = beginning)
  const [addingToNoBranch, setAddingToNoBranch] = useState(null); // condNode._id
  const [addingToYesBranch, setAddingToYesBranch] = useState(null); // condNode._id
  const [pickerTab, setPickerTab] = useState("action");
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const isDraggingRef = React.useRef(false);
  const [openStatsId, setOpenStatsId] = useState(null);
  const [transform, setTransform] = useState({ zoom: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startPx: 0, startPy: 0, moved: false });

  // Close stats popup on outside click
  React.useEffect(() => {
    if (!openStatsId) return;
    const handler = () => setOpenStatsId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openStatsId]);

  // Non-passive wheel listener so preventDefault() works for zoom
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleCanvasWheel);
  });

  function getNodeLeadStats(nodeType) {
    if (!leads?.length) return { inProgress: 0, finished: 0, failed: 0 };
    const failedSt = ["failed", "rejected", "skipped"];
    let inProgressSt, finishedSt;
    if (["visit_profile", "like_post", "follow", "comment_post"].includes(nodeType)) {
      inProgressSt = ["pending"]; finishedSt = ["invited", "connected", "replied", "booked"];
    } else if (nodeType === "connection_request") {
      inProgressSt = ["invited"]; finishedSt = ["connected", "replied", "booked"];
    } else if (["message", "message_open", "inmail"].includes(nodeType)) {
      inProgressSt = ["connected"]; finishedSt = ["replied", "booked"];
    } else {
      inProgressSt = ["pending", "invited"]; finishedSt = ["connected", "replied", "booked"];
    }
    return {
      inProgress: leads.filter(l => inProgressSt.includes(l.status)).length,
      finished:   leads.filter(l => finishedSt.includes(l.status)).length,
      failed:     leads.filter(l => failedSt.includes(l.status)).length,
    };
  }

  const selectedNode = nodes.find((n) => n._id === selectedId) || null;

  function handleDragStart(e, index) {
    isDraggingRef.current = true;
    e.dataTransfer.effectAllowed = "move";
    // Delay so browser screenshots node before opacity change
    setTimeout(() => setDragIndex(index), 0);
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) setDragOverIndex(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (from === null || from === index) return;
    setNodes((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(index > from ? index - 1 : index, 0, item);
      return next;
    });
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
  }

  async function saveSequence(updatedNodes) {
    setSaving(true);
    try {
      // Collect noBranch / yesBranch nodes back into their parent's config
      const nobranchMap = {};
      const yesbranchMap = {};
      updatedNodes.forEach((n) => {
        if (n._nobranchOf) {
          if (!nobranchMap[n._nobranchOf]) nobranchMap[n._nobranchOf] = [];
          nobranchMap[n._nobranchOf].push(n);
        }
        if (n._yesbranchOf) {
          if (!yesbranchMap[n._yesbranchOf]) yesbranchMap[n._yesbranchOf] = [];
          yesbranchMap[n._yesbranchOf].push(n);
        }
      });
      const payload = {
        nodes: updatedNodes
          .filter((n) => !n._nobranchOf && !n._yesbranchOf)
          .map(({ _id, _new, ...rest }) => ({
            ...rest,
            config: {
              ...rest.config,
              ...(nobranchMap[_id]?.length
                ? { noBranch: nobranchMap[_id].map(({ _id: _nbId, _nobranchOf, _new: _nbNew, ...nbRest }) => nbRest) }
                : {}),
              ...(yesbranchMap[_id]?.length
                ? { yesBranch: yesbranchMap[_id].map(({ _id: _ybId, _yesbranchOf, _new: _ybNew, ...ybRest }) => ybRest) }
                : {}),
            },
          })),
      };
      const result = await campaignsApi.updateSequence(campaignId, payload);
      onSaved(result);
      toast?.("Sequence saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save sequence", "danger");
    } finally {
      setSaving(false);
    }
  }

  function addNode(type, insertAfterIndex, noBranchOfId = null, yesBranchOfId = null) {
    const branchTag = noBranchOfId
      ? { _nobranchOf: noBranchOfId }
      : yesBranchOfId
        ? { _yesbranchOf: yesBranchOfId }
        : {};
    const newNode = {
      _id: `n_${Date.now()}`,
      type,
      config: type === "wait" ? { days: 1, unit: "days" } : {},
      _new: true,
      ...branchTag,
    };
    setNodes((prev) => {
      const next = [...prev];
      if (noBranchOfId || yesBranchOfId) {
        const parentId = noBranchOfId || yesBranchOfId;
        const tagKey = noBranchOfId ? "_nobranchOf" : "_yesbranchOf";
        const condIdx = prev.findIndex((n) => n._id === parentId);
        let insertIdx = condIdx;
        for (let k = condIdx + 1; k < next.length; k++) {
          if (next[k][tagKey] === parentId) insertIdx = k;
          else if (!next[k]._nobranchOf && !next[k]._yesbranchOf) break;
        }
        next.splice(insertIdx + 1, 0, newNode);
      } else {
        next.splice(insertAfterIndex + 1, 0, newNode);
      }
      return next;
    });
    setAddingAt(null);
    setAddingToNoBranch(null);
    setAddingToYesBranch(null);
    setSelectedId(newNode._id);
  }

  function updateNode(id, config) {
    setNodes((prev) =>
      prev.map((n) =>
        n._id === id ? { ...n, config: { ...n.config, ...config } } : n,
      ),
    );
  }

  function deleteNode(id) {
    setNodes((prev) => prev.filter((n) => n._id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleCanvasMouseDown(e) {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startPx: transform.x, startPy: transform.y, moved: false };
    setPanning(true);
  }
  function handleCanvasMouseMove(e) {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
      setTransform(t => ({ ...t, x: dragRef.current.startPx + dx, y: dragRef.current.startPy + dy }));
    }
  }
  function handleCanvasMouseUp() {
    if (!dragRef.current.active) return;
    if (!dragRef.current.moved) setSelectedId(null);
    dragRef.current.active = false;
    setPanning(false);
  }
  function handleCanvasWheel(e) {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTransform(t => {
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(2.5, Math.max(0.2, t.zoom * factor));
      const scale = newZoom / t.zoom;
      return { zoom: newZoom, x: mx - scale * (mx - t.x), y: my - scale * (my - t.y) };
    });
  }
  function zoomIn() { setTransform(t => ({ ...t, zoom: Math.min(2.5, parseFloat((t.zoom + 0.1).toFixed(1))) })); }
  function zoomOut() { setTransform(t => ({ ...t, zoom: Math.max(0.2, parseFloat((t.zoom - 0.1).toFixed(1))) })); }
  function resetView() { setTransform({ zoom: 1, x: 0, y: 0 }); }

  return (
    <div className="builder-wrap">
      {/* Canvas */}
      <div
        className="builder-canvas"
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        style={{ cursor: panning ? 'grabbing' : 'grab' }}
      >
        <div
          className="builder-inner"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`, transformOrigin: '0 0' }}
        >
        {/* Start node */}
        <div
          className={`builder-entry-node ${isSetup ? "builder-entry-node--setup" : campaignStatus === "active" ? "builder-entry-node--active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isSetup) onSetupNext?.();
            else onToggleStatus?.();
          }}
          title={isSetup ? "Save & continue to Schedule" : campaignStatus === "active" ? "Pause campaign" : "Start campaign"}
          style={{ cursor: "pointer" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
          <span>
            {isSetup ? "Next: Schedule" : campaignStatus === "active" ? "Running" : "Start"}
          </span>
          {!isSetup && leads?.length > 0 && (
            <span style={{ fontSize: 11, color: "inherit", opacity: 0.65, fontWeight: 400 }}>
              · {leads.length.toLocaleString()}
            </span>
          )}
        </div>

        {/* Add first node */}
        <div className="builder-connector-wrap">
          <div className="builder-connector" />
          <button
            className="add-node-btn"
            onClick={(e) => {
              e.stopPropagation();
              setAddingAt(-1);
            }}
            title="Add first step"
          >
            +
          </button>
          {nodes.length > 0 && <div className="builder-connector" />}
        </div>

        {nodes.map((node, i) => {
          // Branch nodes are rendered inside the condition fork, not in the main flow
          if (node._nobranchOf || node._yesbranchOf) return null;
          const meta = stepMeta(node.type);
          const ok = nodeConfigured(node);
          const sub =
            node.type === "wait"
              ? null // day count is shown in the title via nodeLabel
              : node.config?.text
                ? node.config.text.slice(0, 42) +
                  (node.config.text.length > 42 ? "…" : "")
                : node.config?.note
                  ? node.config.note.slice(0, 42) +
                    (node.config.note.length > 42 ? "…" : "")
                  : null;
          const nodeStats = getNodeLeadStats(node.type);
          const statsTotal = nodeStats.inProgress + nodeStats.finished + nodeStats.failed;
          return (
            <div
              key={node._id}
              className={`builder-node-wrap${dragOverIndex === i && dragIndex !== i ? " builder-drop-target" : ""}`}
              style={{ position: "relative" }}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget))
                  setDragOverIndex(null);
              }}
            >
              <div
                draggable
                className={`builder-node${node._new ? " builder-node--new" : ""}${meta.isCondition ? " condition" : ""}${!ok ? " missing" : ""}${selectedId === node._id ? " selected" : ""}${dragIndex === i ? " dragging" : ""}`}
                style={{ animationDelay: node._new ? "0ms" : `${i * 45}ms` }}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDraggingRef.current) setSelectedId(node._id);
                }}
              >
                <div className="node-icon">{meta.icon}</div>
                <div className="node-content">
                  <div className="node-label">{nodeLabel(node)}</div>
                  {!ok ? (
                    <div className="node-error">Configure required</div>
                  ) : (
                    sub && <div className="node-sub">{sub}</div>
                  )}
                </div>
                <div
                  className="node-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  {leads?.length > 0 && (
                    <button
                      className="btn btn-icon btn-ghost node-contacts-btn"
                      title="Contact statuses"
                      onClick={(e) => { e.stopPropagation(); setOpenStatsId(openStatsId === node._id ? null : node._id); }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1z"/></svg>
                      <span>{statsTotal}</span>
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-disabled)",
                      cursor: "grab",
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                    title="Drag to reorder"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    ⠿
                  </span>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ fontSize: 11, color: "var(--danger)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node._id);
                    }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Contact statuses popup */}
              {openStatsId === node._id && (
                <div className="node-stats-popup" onClick={(e) => e.stopPropagation()}>
                  <div className="node-stats-popup-header">
                    <span>CONTACT'S STATUSES</span><span>COUNT</span>
                  </div>
                  <div className="node-stats-popup-row">
                    <span><span className="node-stats-dot node-stats-dot--yellow" />In Progress</span>
                    <span>{nodeStats.inProgress}</span>
                  </div>
                  <div className="node-stats-popup-row">
                    <span><span className="node-stats-dot node-stats-dot--green" />Finished</span>
                    <span>{nodeStats.finished}</span>
                  </div>
                  <div className="node-stats-popup-row">
                    <span><span className="node-stats-dot node-stats-dot--red" />Failed</span>
                    <span>{nodeStats.failed}</span>
                  </div>
                </div>
              )}

              {/* Connector + add button between nodes */}
              {meta.isCondition ? (() => {
                const noBranchNodes = nodes.filter((n) => n._nobranchOf === node._id);
                const yesBranchNodes = nodes.filter((n) => n._yesbranchOf === node._id);
                const mainNodesAfter = nodes.filter((n) => !n._nobranchOf && !n._yesbranchOf);
                const condMainIdx = mainNodesAfter.findIndex((n) => n._id === node._id);
                const hasNextMain = condMainIdx < mainNodesAfter.length - 1;
                const labels = getBranchLabels(node.type);
                const StopNode = () => (
                  <div className="builder-stop-node">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
                    </svg>
                    Stop
                  </div>
                );
                return (
                  <div className="builder-branch-wrap">
                    <div className="builder-connector" />
                    <div className="builder-dot" />
                    <div className="builder-branch-fork">
                      {/* ── No column (left) ── */}
                      <div className="builder-branch-col branch-col-no">
                        {noBranchNodes.map((nb) => {
                          const nbMeta = stepMeta(nb.type);
                          const nbOk = nodeConfigured(nb);
                          return (
                            <React.Fragment key={nb._id}>
                              <div className="branch-nb-connector" />
                              <div
                                className={`builder-node builder-node-nb${selectedId === nb._id ? " selected" : ""}${!nbOk ? " missing" : ""}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(nb._id); }}
                              >
                                <div className="node-icon">{nbMeta.icon}</div>
                                <div className="node-content">
                                  <div className="node-label">{nodeLabel(nb)}</div>
                                  {!nbOk && <div className="node-error">Action required</div>}
                                </div>
                                <button className="btn btn-icon btn-ghost" style={{ fontSize: 11, color: "var(--danger)", flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); deleteNode(nb._id); }} title="Remove">✕</button>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div className="branch-nb-connector" />
                        <span className="branch-label branch-label-no">{labels.no}</span>
                        <div className="branch-nb-connector" />
                        <button className="add-node-btn" onClick={(e) => { e.stopPropagation(); setAddingToNoBranch(node._id); setAddingToYesBranch(null); setAddingAt(null); }} title="Add step to No branch">+</button>
                        <div className="branch-nb-connector" />
                        <StopNode />
                        <div className="branch-col-fill" />
                      </div>

                      {/* ── Yes column (right) ── */}
                      <div className="builder-branch-col branch-col-yes">
                        <span className="branch-label branch-label-yes">{labels.yes}</span>
                        {yesBranchNodes.map((yb) => {
                          const ybMeta = stepMeta(yb.type);
                          const ybOk = nodeConfigured(yb);
                          return (
                            <React.Fragment key={yb._id}>
                              <div className="branch-nb-connector branch-nb-connector-yes" />
                              <div
                                className={`builder-node builder-node-nb builder-node-yb${selectedId === yb._id ? " selected" : ""}${!ybOk ? " missing" : ""}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(yb._id); }}
                              >
                                <div className="node-icon">{ybMeta.icon}</div>
                                <div className="node-content">
                                  <div className="node-label">{nodeLabel(yb)}</div>
                                  {!ybOk && <div className="node-error">Action required</div>}
                                </div>
                                <button className="btn btn-icon btn-ghost" style={{ fontSize: 11, color: "var(--danger)", flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); deleteNode(yb._id); }} title="Remove">✕</button>
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div className="branch-nb-connector branch-nb-connector-yes" />
                        <button className="add-node-btn" onClick={(e) => { e.stopPropagation(); setAddingToYesBranch(node._id); setAddingToNoBranch(null); setAddingAt(null); }} title="Add step to Yes branch">+</button>
                        <div className="branch-nb-connector branch-nb-connector-yes" />
                        <StopNode />
                        <div className="branch-col-fill" />
                      </div>
                    </div>

                    <div className="builder-dot" />
                    <div className="builder-connector" />
                    <button
                      className="add-node-btn"
                      onClick={(e) => { e.stopPropagation(); setAddingAt(i); setAddingToNoBranch(null); setAddingToYesBranch(null); }}
                      title="Add step after branch"
                    >+</button>
                    {hasNextMain && <div className="builder-connector" />}
                  </div>
                );
              })() : (
                <div className="builder-connector-wrap">
                  <div className="builder-connector" />
                  <button
                    className="add-node-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingAt(i);
                    }}
                    title="Add step here"
                  >
                    +
                  </button>
                  {i < nodes.length - 1 && <div className="builder-connector" />}
                </div>
              )}
            </div>
          );
        })}

        {/* Save button */}
        <button
          className="btn btn-primary btn-sm"
          style={{ marginTop: 20, fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            saveSequence(nodes);
          }}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Sequence"}
        </button>
        </div>{/* /builder-inner */}

        {/* Zoom controls */}
        <div className="builder-zoom-controls" onMouseDown={e => e.stopPropagation()}>
          <button className="builder-zoom-btn" onClick={zoomOut} title="Zoom out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <span className="builder-zoom-pct">{Math.round(transform.zoom * 100)}%</span>
          <button className="builder-zoom-btn" onClick={zoomIn} title="Zoom in">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <div className="builder-zoom-divider" />
          <button className="builder-zoom-btn" onClick={resetView} title="Reset view (100%)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
      </div>

      {/* Right: step config panel */}
      {selectedNode && (
        <div
          className="node-config-panel animate-slide-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="node-config-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {["message", "message_open", "inmail"].includes(
                selectedNode.type,
              ) ? (
                <div className="msg-step-icon">
                  <span style={{ fontSize: 11 }}>in</span>
                </div>
              ) : (
                <span
                  style={{
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  {stepMeta(selectedNode.type).icon}
                </span>
              )}
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>
                {stepMeta(selectedNode.type).label}
              </h3>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["message", "message_open", "inmail"].includes(
                selectedNode.type,
              ) && (
                <button
                  className="btn btn-sm btn-ghost"
                  style={{
                    fontSize: 12,
                    color: "var(--signal)",
                    border: "1px solid var(--signal)",
                    padding: "3px 10px",
                  }}
                  onClick={() => {
                    deleteNode(selectedNode._id);
                    setAddingAt(nodes.indexOf(selectedNode) - 1);
                  }}
                >
                  Change
                </button>
              )}
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setSelectedId(null)}
              >
                ✕
              </button>
            </div>
          </div>

          <div
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              flex: 1,
            }}
          >
            {selectedNode.type === "wait" && (
              <div className="input-group">
                <label className="input-label">Wait Duration</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={selectedNode.config?.days || 1}
                    onChange={(e) =>
                      updateNode(selectedNode._id, {
                        days: Math.max(1, Number(e.target.value)),
                      })
                    }
                    style={{ width: 80 }}
                  />
                  <select
                    className="input"
                    value={selectedNode.config?.unit || "days"}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { unit: e.target.value })
                    }
                    style={{ width: 110 }}
                  >
                    <option value="minutes">MINS</option>
                    <option value="hours">HOURS</option>
                    <option value="days">DAYS</option>
                  </select>
                </div>
              </div>
            )}

            {selectedNode.type === "connection_request" && (
              <>
                {linkedinAccounts.length > 0 && (
                  <div className="input-group">
                    <label className="input-label">Send From</label>
                    <select
                      className="input"
                      value={selectedNode.config?.accountId || ""}
                      onChange={(e) => {
                        const acc = linkedinAccounts.find(
                          (a) => a.id === e.target.value,
                        );
                        updateNode(selectedNode._id, {
                          accountId: e.target.value,
                          accountName: acc?.name || "",
                        });
                      }}
                    >
                      <option value="">Select account…</option>
                      {linkedinAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name || a.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="input-group">
                  <label className="input-label">
                    Connection Note{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      (optional)
                    </span>
                  </label>
                  <ConnectionNoteEditor
                    node={selectedNode}
                    updateNode={updateNode}
                    sampleLead={sampleLead}
                    toast={toast}
                  />
                </div>
              </>
            )}

            {selectedNode.type === "message" && (
              <MessageStepEditor
                node={selectedNode}
                updateNode={updateNode}
                sampleLead={sampleLead}
                toast={toast}
              />
            )}

            {/* voice_note / comment_post / reply_comment — simple text */}
            {["voice_note", "comment_post", "reply_comment"].includes(
              selectedNode.type,
            ) && (
              <div className="input-group">
                <label className="input-label">
                  {selectedNode.type === "voice_note" && "Voice Note Script"}
                  {selectedNode.type === "comment_post" && "Comment Text"}
                  {selectedNode.type === "reply_comment" && "Reply Text"}
                </label>
                <textarea
                  className="input"
                  rows={5}
                  placeholder={
                    selectedNode.type === "voice_note"
                      ? "Hi {firstName}, I wanted to reach out because…"
                      : selectedNode.type === "comment_post"
                        ? "Great post! {firstName}, I completely agree with…"
                        : "Thanks for your comment, {firstName}!"
                  }
                  value={selectedNode.config?.text || ""}
                  onChange={(e) =>
                    updateNode(selectedNode._id, { text: e.target.value })
                  }
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  Variables: {"{firstName}"} {"{lastName}"} {"{company}"}{" "}
                  {"{jobTitle}"}
                </div>
              </div>
            )}

            {/* message_open — same composer as message */}
            {selectedNode.type === "message_open" && (
              <MessageStepEditor
                node={selectedNode}
                updateNode={updateNode}
                sampleLead={sampleLead}
                toast={toast}
              />
            )}

            {/* inmail — subject + body */}
            {selectedNode.type === "inmail" && (
              <>
                <div className="input-group">
                  <label className="input-label">Subject</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Quick question, {firstName}"
                    value={selectedNode.config?.subject || ""}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { subject: e.target.value })
                    }
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Message Body</label>
                  <textarea
                    className="input"
                    rows={6}
                    placeholder="Hi {firstName}, I noticed you work at {company}…"
                    value={selectedNode.config?.body || ""}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { body: e.target.value })
                    }
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    Variables: {"{firstName}"} {"{lastName}"} {"{company}"}{" "}
                    {"{jobTitle}"} {"{location}"}
                  </div>
                </div>
              </>
            )}

            {/* add_tag */}
            {selectedNode.type === "add_tag" && (
              <div className="input-group">
                <label className="input-label">Tag Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. hot-lead, follow-up, interested"
                  value={selectedNode.config?.tag || ""}
                  onChange={(e) =>
                    updateNode(selectedNode._id, { tag: e.target.value })
                  }
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  This tag will be saved to the lead's profile in the campaign.
                </div>
              </div>
            )}

            {/* Conditions */}
            {selectedNode.type?.startsWith("cond_") && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(255, 193, 7, 0.08)",
                  border: "1px solid rgba(255, 193, 7, 0.3)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {selectedNode.type === "cond_has_linkedin" &&
                  "Continues only if the lead has a LinkedIn URL. Leads without a LinkedIn URL are skipped."}
                {selectedNode.type === "cond_1st_level" &&
                  "Continues only if the lead is already a 1st-level connection. Others are skipped."}
                {selectedNode.type === "cond_opened_message" &&
                  "Continues only if the lead has opened a previous LinkedIn message. Others are skipped."}
                {selectedNode.type === "cond_open_profile" &&
                  "Continues only if the lead is an Open Profile (can receive InMail). Others are skipped."}
              </div>
            )}

            {selectedNode.type === "cond_check_column" && (
              <>
                <div
                  style={{
                    padding: "12px 16px",
                    background: "rgba(255, 193, 7, 0.08)",
                    border: "1px solid rgba(255, 193, 7, 0.3)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    marginBottom: 4,
                  }}
                >
                  Checks a field on the lead record. Leads that don't match the
                  expected value are skipped.
                </div>
                <div className="input-group">
                  <label className="input-label">Field Name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. company, jobTitle, location"
                    value={selectedNode.config?.field || ""}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { field: e.target.value })
                    }
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">
                    Expected Value (contains)
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. CEO, New York, SaaS"
                    value={selectedNode.config?.value || ""}
                    onChange={(e) =>
                      updateNode(selectedNode._id, { value: e.target.value })
                    }
                  />
                </div>
              </>
            )}

            {!stepMeta(selectedNode.type).hasConfig &&
              !selectedNode.type?.startsWith("cond_") && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    padding: "16px 0",
                  }}
                >
                  This step has no configuration.
                </div>
              )}

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)", fontSize: 12 }}
                onClick={() => deleteNode(selectedNode._id)}
              >
                Remove Step
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, fontSize: 12 }}
                onClick={() => saveSequence(nodes)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add step picker modal */}
      {(addingAt !== null || addingToNoBranch !== null || addingToYesBranch !== null) && (
        <div className="modal-overlay" onClick={() => { setAddingAt(null); setAddingToNoBranch(null); setAddingToYesBranch(null); }}>
          <div
            className="step-picker-modal animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="step-picker-header">
              <div className="step-picker-tabs">
                <button
                  className={`step-picker-tab${pickerTab === "action" ? " active" : ""}`}
                  onClick={() => setPickerTab("action")}
                >
                  Add an action
                </button>
                <button
                  className={`step-picker-tab${pickerTab === "condition" ? " active" : ""}`}
                  onClick={() => setPickerTab("condition")}
                >
                  Add a condition
                </button>
              </div>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => { setAddingAt(null); setAddingToNoBranch(null); setAddingToYesBranch(null); }}
                style={{ marginLeft: "auto" }}
              >
                ✕
              </button>
            </div>

            {/* Grid */}
            <div className="step-picker-body">
              {pickerTab === "action" ? (
                <div className="step-picker-grid">
                  {ACTION_STEPS.map((s) => (
                    <button
                      key={s.type}
                      className="step-picker-card"
                      onClick={() => addingToNoBranch ? addNode(s.type, null, addingToNoBranch) : addingToYesBranch ? addNode(s.type, null, null, addingToYesBranch) : addNode(s.type, addingAt)}
                    >
                      <div className="step-picker-icon">
                        <span className="spi-action">{s.icon}</span>
                        <span className="spi-linkedin">in</span>
                      </div>
                      <span className="step-picker-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="step-picker-grid">
                  {CONDITION_STEPS.map((s) => (
                    <button
                      key={s.type}
                      className="step-picker-card"
                      onClick={() => addingToNoBranch ? addNode(s.type, null, addingToNoBranch) : addingToYesBranch ? addNode(s.type, null, null, addingToYesBranch) : addNode(s.type, addingAt)}
                    >
                      <div className="step-picker-icon">
                        <span className="spi-action">{s.icon}</span>
                        <span className="spi-linkedin">in</span>
                      </div>
                      <span className="step-picker-label">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Persona Tab ───────────────────────────────────────────────
function PersonaTab({ campaignId, campaign, agents, onSaved, toast, isSetup = false }) {
  const [agentId, setAgentId] = useState(campaign.settings?.agentId || "");
  const [persona, setPersona] = useState(campaign.settings?.persona || {});
  const [saving, setSaving] = useState(false);

  // When agentId changes, pre-fill persona from that agent's persona
  function loadFromAgent(id) {
    setAgentId(id);
    if (!id) {
      setPersona({});
      return;
    }
    const agent = agents.find((a) => a.id === id);
    if (agent?.persona) {
      setPersona({ ...agent.persona });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await campaignsApi.update(campaignId, {
        settings: {
          ...campaign.settings,
          agentId,
          agentName: agents.find((a) => a.id === agentId)?.name || "",
          persona: Object.keys(persona).length > 0 ? persona : undefined,
        },
      });
      onSaved(updated);
      toast?.("Persona saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save persona", "danger");
    } finally {
      setSaving(false);
    }
  }

  const selectedAgent = agents.find((a) => a.id === agentId) || null;

  return (
    <div
      style={{
        maxWidth: 680,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 4 }}>AI Persona</h3>
        <p
          style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}
        >
          Configure how the AI Assistant behaves for this specific campaign. You
          can start from an existing Agent or write a custom persona.
        </p>

        <div className="input-group">
          <label className="input-label">Start from Agent</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              className="input"
              value={agentId}
              onChange={(e) => loadFromAgent(e.target.value)}
            >
              <option value="">— Custom / none —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {selectedAgent?.persona && (
              <button
                className="btn btn-secondary"
                onClick={() => loadFromAgent(agentId)}
                type="button"
              >
                ↺ Reload
              </button>
            )}
          </div>
          {agents.length === 0 && (
            <div
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
            >
              No agents yet —{" "}
              <a href="/agents" style={{ color: "var(--signal)" }}>
                create one in AI Agents
              </a>{" "}
              first, or write a custom persona below.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Persona Fields</h3>
        {PERSONA_FIELDS.map((f) => (
          <div className="input-group" key={f.key}>
            <label className="input-label">{f.label}</label>
            <textarea
              className="input"
              rows={f.rows}
              placeholder={f.placeholder}
              value={persona[f.key] || ""}
              onChange={(e) =>
                setPersona((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : isSetup ? "Save & Continue to Settings →" : "Save Persona"}
          </button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) === 1 ? "" : "s"} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? "" : "s"} ago`;
}

function LeadAvatar({ name }) {
  const initials = (name || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const hue = [...(name || "")].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
      background: `hsl(${hue},40%,45%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 600, color: "#fff",
    }}>{initials}</div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────
function AnalyticsTab({ campaignId }) {
  const [range, setRange] = useState("30d");
  const [metric, setMetric] = useState("sent");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actPage, setActPage] = useState(1);
  const [actData, setActData] = useState(null);
  const [actLoading, setActLoading] = useState(true);
  const ACT_LIMIT = 10;

  useEffect(() => {
    campaignsApi
      .getAnalytics(campaignId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    setActLoading(true);
    campaignsApi
      .getActivity(campaignId, actPage, ACT_LIMIT)
      .then(setActData)
      .catch(() => setActData(null))
      .finally(() => setActLoading(false));
  }, [campaignId, actPage]);

  const totals = data || {
    sent: 0,
    accepted: 0,
    replied: 0,
    booked: 0,
    acceptanceRate: 0,
    replyRate: 0,
  };
  const allSeries = data?.timeSeries || [];

  // Filter by range
  const rangeDays =
    range === "7d"
      ? 7
      : range === "14d"
        ? 14
        : range === "30d"
          ? 30
          : allSeries.length;
  const series = allSeries.slice(-rangeDays);

  // Pick metric key
  const metricKey = metric === "responses" ? "replied" : metric;
  const values = series.map((d) => d[metricKey] || 0);
  const maxVal = Math.max(...values, 1);

  const METRIC_COLOR = {
    sent: "var(--signal-subtle)",
    accepted: "rgba(99,102,241,0.25)",
    replied: "rgba(249,115,22,0.25)",
  };
  const METRIC_BORDER = {
    sent: "rgba(57,255,135,0.35)",
    accepted: "rgba(99,102,241,0.5)",
    replied: "rgba(249,115,22,0.5)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI row */}
      <div className="analytics-stats">
        <div className="cstat">
          <div className="stat-value">{totals.acceptanceRate ?? 0}%</div>
          <div className="stat-label">Acceptance Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value">{totals.replyRate ?? 0}%</div>
          <div className="stat-label">Reply Rate</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.sent || 0}</div>
          <div className="stat-label">Requests Sent</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.accepted || 0}</div>
          <div className="stat-label">Accepted</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.replied || 0}</div>
          <div className="stat-label">Replies</div>
        </div>
        <div className="cstat-divider" />
        <div className="cstat">
          <div className="stat-value mono">{totals.booked || 0}</div>
          <div className="stat-label">Booked</div>
        </div>
      </div>

      {/* Chart card */}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { id: "sent", label: "Sent" },
              { id: "accepted", label: "Accepted" },
              { id: "responses", label: "Responses" },
            ].map((m) => (
              <button
                key={m.id}
                className={`filter-tab ${metric === m.id ? "active" : ""}`}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["7d", "14d", "30d", "All"].map((r) => (
              <button
                key={r}
                className={`filter-tab ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "16px 0",
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  opacity: 1 - i * 0.15,
                }}
              >
                <Sk w="18%" h={14} r={4} />
                <Sk w={`${55 - i * 6}%`} h={22} r={4} />
              </div>
            ))}
          </div>
        ) : values.every((v) => v === 0) ? (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No data yet. Run the campaign to see analytics.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 4,
                height: 160,
                minWidth: values.length * 20,
                paddingBottom: 24,
                position: "relative",
              }}
            >
              {/* Y-axis guideline */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 24,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  pointerEvents: "none",
                }}
              >
                {[1, 0.5, 0].map((f) => (
                  <div
                    key={f}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--text-disabled)",
                        width: 20,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(maxVal * f)}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        borderTop: "1px dashed var(--border)",
                        opacity: 0.5,
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* Bars */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 4,
                  height: "100%",
                  flex: 1,
                  paddingLeft: 28,
                }}
              >
                {values.map((v, i) => {
                  const barH = Math.max(2, Math.round((v / maxVal) * 120));
                  const d = series[i];
                  const label = d?.date
                    ? new Date(d.date + "T00:00:00").toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })
                    : `D${d?.day ?? i + 1}`;
                  const showLabel =
                    values.length <= 14 ||
                    i % Math.ceil(values.length / 10) === 0;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        flex: 1,
                        minWidth: 12,
                      }}
                    >
                      <div
                        title={`Day ${series[i]?.day ?? i + 1}: ${v}`}
                        style={{
                          width: "100%",
                          maxWidth: 28,
                          height: barH,
                          background:
                            METRIC_COLOR[metricKey] || METRIC_COLOR.sent,
                          borderRadius: "3px 3px 0 0",
                          border: `1px solid ${METRIC_BORDER[metricKey] || METRIC_BORDER.sent}`,
                          transition: "height 0.2s",
                        }}
                      />
                      {showLabel && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--text-disabled)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13 }}>
          Past Actions
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "8px 18px", textAlign: "left", fontWeight: 500, color: "var(--text-muted)", width: 160 }}>Time</th>
              <th style={{ padding: "8px 18px", textAlign: "left", fontWeight: 500, color: "var(--text-muted)" }}>Past Actions</th>
            </tr>
          </thead>
          <tbody>
            {actLoading ? (
              Array.from({ length: ACT_LIMIT }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 18px" }}><Sk w={90} h={12} r={4} /></td>
                  <td style={{ padding: "12px 18px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Sk w={28} h={28} r="50%" /><Sk w={260} h={12} r={4} /></div></td>
                </tr>
              ))
            ) : !actData?.items?.length ? (
              <tr><td colSpan={2} style={{ padding: "32px 18px", textAlign: "center", color: "var(--text-muted)" }}>No actions yet.</td></tr>
            ) : (
              actData.items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 18px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{timeAgo(item.timestamp)}</td>
                  <td style={{ padding: "12px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <LeadAvatar name={item.name} />
                      <span>
                        {item.action}{" "}
                        {item.linkedinUrl ? (
                          <a href={item.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>{item.name}</a>
                        ) : (
                          <strong>{item.name}</strong>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {/* Pagination */}
        {actData?.total > ACT_LIMIT && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "10px 18px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>
            <span>{(actPage - 1) * ACT_LIMIT + 1}–{Math.min(actPage * ACT_LIMIT, actData.total)} of {actData.total.toLocaleString()} items</span>
            <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} disabled={actPage === 1} onClick={() => setActPage(p => p - 1)}>‹</button>
            {Array.from({ length: Math.min(5, Math.ceil(actData.total / ACT_LIMIT)) }, (_, i) => i + 1).map(p => (
              <button key={p} className={`btn-ghost${actPage === p ? " active" : ""}`} style={{ padding: "3px 8px", fontSize: 12, fontWeight: actPage === p ? 600 : 400 }} onClick={() => setActPage(p)}>{p}</button>
            ))}
            {Math.ceil(actData.total / ACT_LIMIT) > 5 && <span>…</span>}
            <button className="btn-ghost" style={{ padding: "3px 8px", fontSize: 12 }} disabled={actPage * ACT_LIMIT >= actData.total} onClick={() => setActPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────
const DEFAULT_SCHEDULE = [
  { day: "Monday", enabled: true, start: "08:00", end: "18:00" },
  { day: "Tuesday", enabled: true, start: "08:00", end: "18:00" },
  { day: "Wednesday", enabled: true, start: "08:00", end: "18:00" },
  { day: "Thursday", enabled: true, start: "08:00", end: "18:00" },
  { day: "Friday", enabled: true, start: "08:00", end: "18:00" },
  { day: "Saturday", enabled: false, start: "00:00", end: "00:00" },
  { day: "Sunday", enabled: false, start: "00:00", end: "00:00" },
];

// Full IANA timezone list from the browser, with each zone's current UTC
// offset in the label. Falls back to a small set on older browsers that
// don't support Intl.supportedValuesOf.
const FALLBACK_TIMEZONES = [
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

function tzOffsetLabel(value) {
  try {
    const part = new Intl.DateTimeFormat("en-GB", {
      timeZone: value,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    const offset = part?.value?.replace("GMT", "UTC") || "";
    return offset ? `${value.replace(/_/g, " ")} (${offset})` : value;
  } catch {
    return value.replace(/_/g, " ");
  }
}

const TIMEZONES = (typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("timeZone")
  : FALLBACK_TIMEZONES
).map((value) => ({ value, label: tzOffsetLabel(value) }));

const DEFAULT_FREQUENCY = {
  messages: 20,
  inmails: 5,
  connectionRequests: 18,
  aiComments: 30,
  likesToPosts: 30,
  profileVisits: 30,
  followLead: 30,
};

const FREQUENCY_ITEMS = [
  {
    key: "messages",
    label: "Messages",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "inmails",
    label: "InMails",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
  },
  {
    key: "connectionRequests",
    label: "Connection Requests",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="16" y1="11" x2="22" y2="11" />
      </svg>
    ),
  },
  {
    key: "aiComments",
    label: "AI Comments",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    key: "likesToPosts",
    label: "Likes to posts",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
  {
    key: "profileVisits",
    label: "Profile visits",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    key: "followLead",
    label: "Follow Lead",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
      </svg>
    ),
  },
];

function SettingsTab({ campaign, agents, linkedinAccounts, onSaved, toast, isSetup = false }) {
  const [form, setForm] = useState({
    linkedinAccountId: campaign.settings?.linkedinAccountId || "",
    linkedinAccountName: campaign.settings?.linkedinAccountName || "",
    agentId: campaign.settings?.agentId || "",
    timezone: campaign.settings?.timezone || "Europe/London",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [schedule, setSchedule] = useState(
    campaign.settings?.schedule || DEFAULT_SCHEDULE,
  );
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Live clock so the Schedule card can show the current time in the
  // selected timezone (the schedule hours are interpreted in that zone).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  let tzClock = "";
  try {
    tzClock = new Intl.DateTimeFormat("en-GB", {
      timeZone: form.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
  } catch {
    tzClock = ""; // invalid/unknown timezone — hide the clock
  }

  const [frequency, setFrequency] = useState(
    campaign.settings?.frequency || {
      ...DEFAULT_FREQUENCY,
      connectionRequests:
        campaign.settings?.dailyConnectionLimit ??
        DEFAULT_FREQUENCY.connectionRequests,
      messages:
        campaign.settings?.dailyMessageLimit ?? DEFAULT_FREQUENCY.messages,
    },
  );
  const [savingFrequency, setSavingFrequency] = useState(false);

  function updateScheduleDay(idx, patch) {
    setSchedule((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }

  function resetSchedule() {
    setSchedule(DEFAULT_SCHEDULE);
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: { ...campaign.settings, ...form, schedule },
      });
      onSaved(updated);
      toast?.("Schedule saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save schedule", "danger");
    } finally {
      setSavingSchedule(false);
    }
  }

  function adjustFreq(key, delta) {
    setFrequency((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] ?? 0) + delta),
    }));
  }

  async function handleSaveFrequency() {
    setSavingFrequency(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: {
          ...campaign.settings,
          ...form,
          frequency,
          dailyConnectionLimit: frequency.connectionRequests,
          dailyMessageLimit: frequency.messages,
        },
      });
      onSaved(updated);
      toast?.("Frequency saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save frequency", "danger");
    } finally {
      setSavingFrequency(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: { ...campaign.settings, ...form },
      });
      onSaved(updated);
      toast?.("Settings saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save settings", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    // eslint-disable-next-line no-alert
    if (
      !window.confirm(
        `Delete campaign "${campaign.name}"? This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await campaignsApi.delete(campaign.id);
      window.location.href = "/campaigns";
    } catch (err) {
      toast?.(err.message || "Could not delete campaign", "danger");
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 640,
      }}
    >
      {/* ── General ── */}
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Campaign Settings</h3>

        <div className="input-group">
          <label className="input-label">LinkedIn Account</label>
          <select
            className="input"
            value={form.linkedinAccountId}
            onChange={(e) => {
              const acc = linkedinAccounts.find((a) => a.id === e.target.value);
              setForm((f) => ({
                ...f,
                linkedinAccountId: e.target.value,
                linkedinAccountName: acc?.name || "",
              }));
            }}
          >
            <option value="">Select account…</option>
            {linkedinAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.id}
              </option>
            ))}
            {linkedinAccounts.length === 0 && (
              <option disabled>No accounts connected — add in Settings</option>
            )}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label">AI Assistant (Persona)</label>
          <select
            className="input"
            value={form.agentId}
            onChange={(e) =>
              setForm((f) => ({ ...f, agentId: e.target.value }))
            }
          >
            <option value="">No agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div
            style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}
          >
            Configure persona details in the Persona tab.
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : isSetup ? "Finish Setup →" : "Save Settings"}
        </button>
      </div>

      {/* ── Schedule ── */}
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Schedule</h3>
        <p
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}
        >
          Set which days and hours your campaign is active. All times below are
          in the selected timezone.
        </p>

        {/* Timezone — the schedule hours are interpreted in this zone */}
        <div className="input-group">
          <label className="input-label">Timezone</label>
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            <select
              className="input"
              value={form.timezone}
              onChange={(e) =>
                setForm((f) => ({ ...f, timezone: e.target.value }))
              }
              style={{ flex: 1, minWidth: 220 }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            {tzClock && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                Current time:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {tzClock}
                </strong>
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginTop: 16,
          }}
        >
          {schedule.map((row, idx) => (
            <div
              key={row.day}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 56px 16px 1fr auto auto",
                alignItems: "center",
                gap: 10,
                opacity: row.enabled ? 1 : 0.45,
              }}
            >
              {/* Day label */}
              <span
                style={{ fontSize: 13, fontWeight: row.enabled ? 600 : 400 }}
              >
                {row.day}
              </span>

              {/* Toggle */}
              <label className="toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) =>
                    updateScheduleDay(idx, { enabled: e.target.checked })
                  }
                />
                <span className="toggle-track" />
              </label>

              {/* Divider */}
              <span
                style={{ borderTop: "1px solid var(--border)", width: "100%" }}
              />

              {/* Time range */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  className="input time-picker"
                  type="time"
                  value={row.start}
                  disabled={!row.enabled}
                  onChange={(e) =>
                    updateScheduleDay(idx, { start: e.target.value })
                  }
                  onClick={(e) => e.currentTarget.showPicker?.()}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  to
                </span>
                <input
                  className="input time-picker"
                  type="time"
                  value={row.end}
                  disabled={!row.enabled}
                  onChange={(e) =>
                    updateScheduleDay(idx, { end: e.target.value })
                  }
                  onClick={(e) => e.currentTarget.showPicker?.()}
                />
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button className="btn btn-secondary" onClick={resetSchedule}>
            Reset Schedule
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
          >
            {savingSchedule ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>

      {/* ── Frequency ── */}
      <div className="card">
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* Left description */}
          <div style={{ flex: "0 0 200px" }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Frequency</h3>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              Set how many times you want your campaign to run per day. We
              recommend leaving these as default to avoid LinkedIn restrictions.
            </p>
          </div>

          {/* Right counters */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {FREQUENCY_ITEMS.map(({ key, label, icon }) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  marginBottom: 6,
                  background: "var(--surface-2, #1a1f2e)",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {React.cloneElement(icon, {
                    style: { width: 20, height: 20 },
                  })}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                  {label}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                    onClick={() => adjustFreq(key, -1)}
                  >
                    −
                  </button>
                  <span
                    style={{
                      width: 32,
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    {frequency[key] ?? DEFAULT_FREQUENCY[key]}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                    onClick={() => adjustFreq(key, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}
        >
          <button
            className="btn btn-primary"
            onClick={handleSaveFrequency}
            disabled={savingFrequency}
          >
            {savingFrequency ? "Saving…" : "Save Frequency"}
          </button>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="card">
        <h3
          style={{ fontWeight: 700, marginBottom: 12, color: "var(--danger)" }}
        >
          Danger Zone
        </h3>
        <button
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete Campaign"}
        </button>
      </div>
    </div>
  );
}

// ── AccountsSetupTab (wizard step 2) ─────────────────────────
function AccountsSetupTab({ campaignId, campaign, linkedinAccounts, agents, onSaved, toast }) {
  const [accountId, setAccountId] = useState(campaign.settings?.linkedinAccountId || '')
  const [agentId, setAgentId] = useState(campaign.settings?.agentId || '')
  const [saving, setSaving] = useState(false)

  async function handleNext() {
    if (!accountId) { toast?.('Please select a LinkedIn account', 'danger'); return }
    setSaving(true)
    try {
      const acc = linkedinAccounts.find(a => a.id === accountId)
      const updated = await campaignsApi.update(campaignId, {
        settings: {
          ...campaign.settings,
          linkedinAccountId: accountId,
          linkedinAccountName: acc?.name || acc?.email || '',
          agentId: agentId || campaign.settings?.agentId || '',
        }
      })
      onSaved(updated)
    } catch (err) {
      toast?.(err.message || 'Could not save', 'danger')
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>LinkedIn Account</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>Select the LinkedIn account to use for outreach on this campaign.</p>

      {linkedinAccounts.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>◎</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No LinkedIn accounts connected</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>Connect a LinkedIn account in Settings → LinkedIn Accounts first.</div>
          <a href="/settings" className="btn btn-secondary btn-sm">Go to Settings →</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {linkedinAccounts.map(acc => (
            <div
              key={acc.id}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', border: `1px solid ${accountId === acc.id ? 'var(--signal)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', background: accountId === acc.id ? 'var(--surface-2)' : 'var(--surface)', transition: 'all 0.15s' }}
              onClick={() => setAccountId(acc.id)}
            >
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                {(acc.name || acc.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.name || acc.email || acc.id}</div>
                {acc.email && acc.name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acc.email}</div>}
              </div>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${accountId === acc.id ? 'var(--signal)' : 'var(--border)'}`, background: accountId === acc.id ? 'var(--signal)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {accountId === acc.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {agents.length > 0 && (
        <div className="input-group" style={{ marginBottom: 32 }}>
          <label className="input-label">AI Assistant (optional)</label>
          <select className="input" value={agentId} onChange={e => setAgentId(e.target.value)}>
            <option value="">No agent — I'll reply manually</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      <button
        className="btn btn-primary"
        disabled={!accountId || saving}
        onClick={handleNext}
      >
        {saving ? 'Saving…' : 'Next: Sequences →'}
      </button>
    </div>
  )
}

// ── ScheduleSetupTab (wizard step 4) ─────────────────────────
function ScheduleSetupTab({ campaign, onSaved, toast }) {
  const [schedule, setSchedule] = useState(campaign.settings?.schedule || DEFAULT_SCHEDULE)
  const [timezone, setTimezone] = useState(campaign.settings?.timezone || 'Europe/London')
  const [frequency, setFrequency] = useState({
    ...DEFAULT_FREQUENCY,
    ...(campaign.settings?.frequency || {}),
    connectionRequests: campaign.settings?.frequency?.connectionRequests ?? campaign.settings?.dailyConnectionLimit ?? DEFAULT_FREQUENCY.connectionRequests,
    messages: campaign.settings?.frequency?.messages ?? campaign.settings?.dailyMessageLimit ?? DEFAULT_FREQUENCY.messages,
  })
  const [saving, setSaving] = useState(false)

  const [now, setNow] = useState(() => new Date())
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  let tzClock = ''
  try { tzClock = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(now) } catch {}

  function updateDay(idx, patch) {
    setSchedule(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  function adjustFreq(key, delta) {
    setFrequency(prev => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }))
  }

  async function handleFinish() {
    setSaving(true)
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: {
          ...campaign.settings,
          timezone,
          schedule,
          frequency,
          dailyConnectionLimit: frequency.connectionRequests,
          dailyMessageLimit: frequency.messages,
        }
      })
      onSaved(updated)
    } catch (err) {
      toast?.(err.message || 'Could not save schedule', 'danger')
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Schedule</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Set which days and hours your campaign is active. All times are in the selected timezone.</p>

        <div className="input-group">
          <label className="input-label">Timezone</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)} style={{ flex: 1, minWidth: 220 }}>
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
            {tzClock && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Current time: <strong style={{ color: 'var(--text-primary)' }}>{tzClock}</strong></span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {schedule.map((row, idx) => (
            <div key={row.day} style={{ display: 'grid', gridTemplateColumns: '120px 56px 16px 1fr', alignItems: 'center', gap: 10, opacity: row.enabled ? 1 : 0.45 }}>
              <span style={{ fontSize: 13, fontWeight: row.enabled ? 600 : 400 }}>{row.day}</span>
              <label className="toggle" style={{ margin: 0 }}>
                <input type="checkbox" checked={row.enabled} onChange={e => updateDay(idx, { enabled: e.target.checked })} />
                <span className="toggle-track" />
              </label>
              <span style={{ borderTop: '1px solid var(--border)', width: '100%' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input className="input time-picker" type="time" value={row.start} disabled={!row.enabled} onChange={e => updateDay(idx, { start: e.target.value })} onClick={e => e.currentTarget.showPicker?.()} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
                <input className="input time-picker" type="time" value={row.end} disabled={!row.enabled} onChange={e => updateDay(idx, { end: e.target.value })} onClick={e => e.currentTarget.showPicker?.()} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 200px' }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Frequency</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Daily limits per action. Leave as default to stay within LinkedIn limits.</p>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FREQUENCY_ITEMS.map(({ key, label, icon }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 6, background: 'var(--surface-2, #1a1f2e)' }}>
                <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {React.cloneElement(icon, { style: { width: 20, height: 20 } })}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, fontWeight: 700, fontSize: 16 }} onClick={() => adjustFreq(key, -1)}>−</button>
                  <span style={{ width: 32, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{frequency[key] ?? DEFAULT_FREQUENCY[key]}</span>
                  <button className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, fontWeight: 700, fontSize: 16 }} onClick={() => adjustFreq(key, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 32 }}>
        <button className="btn btn-primary" style={{ fontSize: 15, padding: '10px 28px' }} onClick={handleFinish} disabled={saving}>
          {saving ? 'Saving…' : 'Launch Campaign →'}
        </button>
      </div>
    </div>
  )
}

// ── Connection Note Editor ─────────────────────────────────────
const NOTE_CHAR_LIMIT = 300;

// Resolve a {variable} to a real lead's value for message previews.
// Returns null when the lead doesn't have that field, so callers can fall
// back to the static placeholder.
function leadVarValue(varValue, lead) {
  if (!lead) return null;
  const fullName =
    lead.name ||
    [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  switch (varValue) {
    case "{firstName}":
      return lead.firstName || parts[0] || null;
    case "{lastName}":
      return (
        lead.lastName || (parts.length > 1 ? parts.slice(1).join(" ") : null)
      );
    case "{fullName}":
      return fullName || null;
    case "{jobTitle}":
      return lead.title || lead.jobTitle || null;
    case "{company}":
      return lead.company || null;
    case "{location}":
      return lead.location || null;
    default:
      return null; // sender vars aren't lead-specific
  }
}

function ConnectionNoteEditor({ node, updateNode, sampleLead, toast }) {
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef(null);

  const noteText = node.config?.note || "";
  const charsLeft = NOTE_CHAR_LIMIT - noteText.length;

  function insertVar(v) {
    const ta = textareaRef.current;
    if (!ta) {
      updateNode(node._id, { note: noteText + v });
      setShowVarMenu(false);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = noteText.slice(0, start) + v + noteText.slice(end);
    if (next.length > NOTE_CHAR_LIMIT) return;
    updateNode(node._id, { note: next });
    setShowVarMenu(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  }

  async function handleGenerateAI() {
    if (!aiPrompt.trim()) return;
    setGeneratingAI(true);
    try {
      const result = await campaignsApi.generateMessage({
        prompt: aiPrompt + " Keep it under 300 characters.",
      });
      const truncated = result.message.slice(0, NOTE_CHAR_LIMIT);
      updateNode(node._id, { note: truncated });
      setShowAiPrompt(false);
      setAiPrompt("");
    } catch (err) {
      toast?.(err.message || "AI generation failed", "danger");
    } finally {
      setGeneratingAI(false);
    }
  }

  function previewText() {
    let t = noteText;
    CONTACT_VARS.filter((v) => v.value).forEach((v) => {
      const val = leadVarValue(v.value, sampleLead) || v.preview;
      t = t.replace(new RegExp(v.value.replace(/[{}]/g, "\\$&"), "g"), val);
    });
    return t;
  }

  return (
    <>
      <div className="msg-composer">
        {/* Toolbar */}
        <div className="msg-toolbar">
          <button
            className={`msg-toolbar-btn${showAiPrompt ? " active" : ""}`}
            onClick={() => {
              setShowAiPrompt((v) => !v);
              setShowPreview(false);
            }}
          >
            ✦ AI Prompt
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="msg-toolbar-btn"
              onClick={() => setShowVarMenu((v) => !v)}
            >
              + Contact Variables
            </button>
            {showVarMenu && (
              <div
                className="var-dropdown"
                onMouseLeave={() => setShowVarMenu(false)}
              >
                {CONTACT_VARS.map((v, i) =>
                  v.group ? (
                    <div key={i} className="var-dropdown-group">
                      {v.group}
                    </div>
                  ) : (
                    <button
                      key={v.value}
                      className="var-dropdown-item"
                      onClick={() => insertVar(v.value)}
                    >
                      <span className="var-tag">{v.value}</span>
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                      >
                        {v.label}
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <button
            className={`msg-toolbar-btn${showPreview ? " active" : ""}`}
            onClick={() => {
              setShowPreview((v) => !v);
              setShowAiPrompt(false);
            }}
          >
            ◉ Preview
          </button>
        </div>

        {/* AI Prompt bar */}
        {showAiPrompt && (
          <div className="ai-prompt-bar">
            <input
              className="input"
              style={{ fontSize: 12, flex: 1 }}
              placeholder="Describe the connection note… e.g. Mention shared interest in SaaS, keep it friendly"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleGenerateAI()
              }
              autoFocus
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!aiPrompt.trim() || generatingAI}
              onClick={handleGenerateAI}
              style={{ whiteSpace: "nowrap" }}
            >
              {generatingAI ? "Generating…" : "✦ Generate"}
            </button>
          </div>
        )}

        {/* Note body */}
        {showPreview ? (
          <div className="msg-preview-body">
            {previewText() || (
              <span style={{ color: "var(--text-disabled)" }}>
                Nothing to preview yet.
              </span>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="msg-textarea"
            rows={4}
            placeholder="Hi {firstName}, I came across your profile and thought it would be great to connect…"
            value={noteText}
            maxLength={NOTE_CHAR_LIMIT}
            onChange={(e) => updateNode(node._id, { note: e.target.value })}
          />
        )}
      </div>

      {/* Char counter */}
      <div
        style={{
          fontSize: 11,
          color: charsLeft < 30 ? "var(--danger)" : "var(--text-muted)",
          textAlign: "right",
          marginTop: 4,
        }}
      >
        {charsLeft} / {NOTE_CHAR_LIMIT} characters remaining
      </div>
    </>
  );
}

// ── Message Step Editor ────────────────────────────────────────
const CONTACT_VARS = [
  { group: "Contact" },
  { label: "First Name", value: "{firstName}", preview: "John" },
  { label: "Last Name", value: "{lastName}", preview: "Smith" },
  { label: "Full Name", value: "{fullName}", preview: "John Smith" },
  { label: "Job Title", value: "{jobTitle}", preview: "Head of Sales" },
  { label: "Company", value: "{company}", preview: "Acme Corp" },
  { label: "Location", value: "{location}", preview: "London, UK" },
  { group: "Sender" },
  {
    label: "Calendar Link",
    value: "{calendarLink}",
    preview: "https://cal.com/you",
  },
  { label: "Your Company", value: "{senderCompany}", preview: "ReachFlow" },
  {
    label: "Your Website",
    value: "{senderWebsite}",
    preview: "https://reachflow.io",
  },
];

const SEND_CONDITIONS = [
  { value: "always", label: "Always send" },
  { value: "if_accepted", label: "Only if connection accepted" },
  {
    value: "if_no_reply",
    label: "Send only if the recipient has never sent a message",
  },
];

function MessageStepEditor({
  node,
  updateNode,
  sampleLead,
  toast,
}) {
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const current = node.config?.attachments || [];
        updateNode(node._id, {
          attachments: [
            ...current,
            { name: file.name, type: file.type, size: file.size, data: base64 },
          ],
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function removeAttachment(idx) {
    const attachments = (node.config?.attachments || []).filter(
      (_, i) => i !== idx,
    );
    updateNode(node._id, { attachments });
  }

  const config = node.config || {};
  const msgText = config.text || "";
  const isEmpty = !msgText.trim();


  function insertVar(v) {
    const ta = textareaRef.current;
    if (!ta) {
      updateNode(node._id, { text: msgText + v });
      setShowVarMenu(false);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = msgText.slice(0, start) + v + msgText.slice(end);
    updateNode(node._id, { text: next });
    setShowVarMenu(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  }

  async function handleGenerateAI() {
    if (!aiPrompt.trim()) return;
    setGeneratingAI(true);
    try {
      const result = await campaignsApi.generateMessage({ prompt: aiPrompt });
      updateNode(node._id, { text: result.message });
      setShowAiPrompt(false);
      setAiPrompt("");
    } catch (err) {
      toast?.(err.message || "AI generation failed", "danger");
    } finally {
      setGeneratingAI(false);
    }
  }

  function previewText() {
    let t = msgText;
    CONTACT_VARS.filter((v) => v.value).forEach((v) => {
      const val = leadVarValue(v.value, sampleLead) || v.preview;
      t = t.replace(new RegExp(v.value.replace(/[{}]/g, "\\$&"), "g"), val);
    });
    return t;
  }

  return (
    <>
      {/* Message composer */}
      <div className="msg-composer">
        {/* Toolbar */}
        <div className="msg-toolbar">
          <button
            className={`msg-toolbar-btn${showAiPrompt ? " active" : ""}`}
            onClick={() => {
              setShowAiPrompt((v) => !v);
              setShowPreview(false);
            }}
          >
            ✦ AI Prompt
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="msg-toolbar-btn"
              onClick={() => setShowVarMenu((v) => !v)}
            >
              + Contact Variables
            </button>
            {showVarMenu && (
              <div
                className="var-dropdown"
                onMouseLeave={() => setShowVarMenu(false)}
              >
                {CONTACT_VARS.map((v, i) =>
                  v.group ? (
                    <div key={i} className="var-dropdown-group">
                      {v.group}
                    </div>
                  ) : (
                    <button
                      key={v.value}
                      className="var-dropdown-item"
                      onClick={() => insertVar(v.value)}
                    >
                      <span className="var-tag">{v.value}</span>
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                      >
                        {v.label}
                      </span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <button
            className="msg-toolbar-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            📎 Add
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.ppt,.pptx"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <button
            className={`msg-toolbar-btn${showPreview ? " active" : ""}`}
            onClick={() => {
              setShowPreview((v) => !v);
              setShowAiPrompt(false);
            }}
          >
            ◉ Preview
          </button>
        </div>

        {/* AI Prompt bar */}
        {showAiPrompt && (
          <div className="ai-prompt-bar">
            <input
              className="input"
              style={{ fontSize: 12, flex: 1 }}
              placeholder="Describe the message you want… e.g. Follow up after connection, mention their company"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleGenerateAI()
              }
              autoFocus
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!aiPrompt.trim() || generatingAI}
              onClick={handleGenerateAI}
              style={{ whiteSpace: "nowrap" }}
            >
              {generatingAI ? "Generating…" : "✦ Generate"}
            </button>
          </div>
        )}

        {/* Message body */}
        {showPreview ? (
          <div className="msg-preview-body">
            {previewText() || (
              <span style={{ color: "var(--text-disabled)" }}>
                Nothing to preview yet.
              </span>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="msg-textarea"
            rows={9}
            placeholder=""
            value={msgText}
            onChange={(e) => updateNode(node._id, { text: e.target.value })}
          />
        )}

        {/* Attachment chips */}
        {(node.config?.attachments || []).length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            {node.config.attachments.map((att, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  background: "var(--surface-3, #252a3a)",
                  borderRadius: 5,
                  padding: "3px 8px",
                  fontSize: 12,
                  maxWidth: 220,
                }}
              >
                <span>📎</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {att.name}
                </span>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  {att.size > 1024 * 1024
                    ? `${(att.size / 1024 / 1024).toFixed(1)}MB`
                    : `${Math.round(att.size / 1024)}KB`}
                </span>
                <button
                  onClick={() => removeAttachment(i)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: "0 2px",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Validation */}
      {isEmpty && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--danger)",
          }}
        >
          <span>⊙</span> Type your message
        </div>
      )}

      {/* Send condition */}
      <div className="input-group" style={{ margin: 0 }}>
        <select
          className="input msg-condition-select"
          value={config.condition || "if_no_reply"}
          onChange={(e) => updateNode(node._id, { condition: e.target.value })}
        >
          {SEND_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
