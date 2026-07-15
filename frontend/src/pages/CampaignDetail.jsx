import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useLocation, useParams } from "react-router-dom";
import LeadFinderModal from "../components/LeadFinderModal";
import ProfileUrlModal from "../components/ProfileUrlModal";
import PostEngagersModal from "../components/PostEngagersModal";
import LinkedInProfileModal from "../components/LinkedInProfileModal";
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
    hasConfig: true,
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
    hasConfig: true,
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
    label: "Is Connected",
    hasConfig: false,
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
  },
  {
    type: "stop",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    label: "Stop",
    hasConfig: false,
  },
];

// Simplified builder menu — only these actions are shown in the + dropdown
const BUILDER_MENU_ACTIONS = [
  {
    type: "connection_request",
    label: "Send Connection",
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
  },
  {
    type: "cond_1st_level",
    label: "If Connected",
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
  },
  {
    type: "like_post",
    label: "Like Post",
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
  },
  {
    type: "visit_profile",
    label: "View Profile",
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
  },
  {
    type: "message",
    label: "Send Message",
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
  },
];

// Actions available in the No branch (pre-connection: warmup steps)
const NO_BRANCH_ACTIONS = [
  {
    type: "connection_request",
    label: "Send Connection",
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
  },
  {
    type: "like_post",
    label: "Like Post",
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
  },
  {
    type: "visit_profile",
    label: "View Profile",
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
  },
  {
    type: "message",
    label: "Send Message",
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
  },
];

// Actions available in the Yes branch (post-connection: messaging steps)
const YES_BRANCH_ACTIONS = [
  {
    type: "message",
    label: "Send Message",
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
  },
  {
    type: "like_post",
    label: "Like Post",
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
  },
  {
    type: "visit_profile",
    label: "View Profile",
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

// Every node type gets a positive/negative branch fork by default, except
// wait/stop (no outcome to branch on), voice_note (no real API support,
// so there's no meaningful success/failure signal to fork on), and
// visit_profile (only "Success" is a real outcome worth branching on, so
// it just continues in a straight line instead of forking).
function nodeHasBranches(type) {
  return (
    type !== "wait" &&
    type !== "stop" &&
    type !== "voice_note" &&
    type !== "visit_profile"
  );
}

// Legacy saved sequences may still have a visit_profile node with a real
// Yes/No fork (from before it stopped branching). Keep the Success
// (yesBranch) continuation flattened back into the flow and drop the
// Failed (noBranch) path entirely, so old data renders the same as newly
// authored sequences.
function flattenVisitProfileForks(list) {
  const out = [];
  for (const node of list || []) {
    const { noBranch, yesBranch, ...restConfig } = node.config || {};
    if (node.type === "visit_profile" && (noBranch || yesBranch)) {
      out.push({ ...node, config: restConfig });
      if (yesBranch?.length) out.push(...flattenVisitProfileForks(yesBranch));
      continue;
    }
    if (noBranch || yesBranch) {
      out.push({
        ...node,
        config: {
          ...node.config,
          ...(noBranch ? { noBranch: flattenVisitProfileForks(noBranch) } : {}),
          ...(yesBranch
            ? { yesBranch: flattenVisitProfileForks(yesBranch) }
            : {}),
        },
      });
      continue;
    }
    out.push(node);
  }
  return out;
}

// Sequences saved before the branch-tree schema existed are a flat array —
// e.g. [cond_1st_level, connection_request, message, wait]. Every node in
// that list now renders as a Yes/No fork, so without this repair the
// "next" flat sibling renders as an orphaned node floating below an empty
// fork instead of continuing it. This walks a flat (or partially-flat)
// list once and nests whatever follows a forking node into the branch
// that means "keep going" for that node type — idempotent, so a node that
// already has a noBranch/yesBranch (real authored trees) passes through
// untouched.
const LEGACY_CONTINUE_BRANCH = {
  cond_1st_level: "noBranch", // "Not Connected" is what used to just fall through
  // message/message_open/inmail have no "Replied" branch anymore (a reply
  // always hard-stops the sequence) — legacy flat data that just continued
  // to the next step regardless of a reply maps onto "Not Replied" instead.
  message: "noBranch",
  message_open: "noBranch",
  inmail: "noBranch",
};
function normalizeLegacyFlatSequence(list) {
  const arr = list || [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const node = { ...arr[i] };
    const alreadyTree = !!(node.config?.noBranch || node.config?.yesBranch);
    if (nodeHasBranches(node.type) && !alreadyTree && i < arr.length - 1) {
      const rest = normalizeLegacyFlatSequence(arr.slice(i + 1));
      const continueBranch = LEGACY_CONTINUE_BRANCH[node.type] || "yesBranch";
      const giveUpBranch =
        continueBranch === "yesBranch" ? "noBranch" : "yesBranch";
      // The give-up branch never existed in flat data — give it a default
      // wait (same as any freshly-added node gets on both branches, see
      // addNode) rather than an immediate, wait-less Stop.
      node.config = {
        ...node.config,
        [continueBranch]: rest,
        [giveUpBranch]: [{ type: "wait", config: { days: 1, unit: "days" } }],
      };
      out.push(node);
      break; // `rest` has been absorbed — nothing left to iterate
    }
    if (node.config?.noBranch)
      node.config = {
        ...node.config,
        noBranch: normalizeLegacyFlatSequence(node.config.noBranch),
      };
    if (node.config?.yesBranch)
      node.config = {
        ...node.config,
        yesBranch: normalizeLegacyFlatSequence(node.config.yesBranch),
      };
    out.push(node);
  }
  return out;
}

function getBranchLabels(nodeType) {
  switch (nodeType) {
    case "connection_request":
      return { no: "Not Accepted Yet", yes: "Accepted" };
    case "message":
    case "message_open":
    case "inmail":
      return { no: "Not Replied", yes: "Replied" };
    case "cond_has_linkedin":
      return { no: "No LinkedIn", yes: "Has LinkedIn" };
    case "cond_1st_level":
      return { no: "Not Connected", yes: "Already Connected" };
    case "cond_opened_message":
      return { no: "Not Opened", yes: "Opened" };
    case "cond_check_column":
      return { no: "No Match", yes: "Matches" };
    case "cond_open_profile":
      return { no: "Not Open Profile", yes: "Open Profile" };
    case "visit_profile":
    case "like_post":
    case "follow":
    case "comment_post":
    case "add_tag":
    case "reply_comment":
      return { no: "Failed", yes: "Success" };
    default:
      return { no: "No", yes: "Yes" };
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

// ── Sequence tree helpers ────────────────────────────────────────
// Nodes form a real tree: a node's children live at node.config.noBranch /
// node.config.yesBranch (arrays of nodes, which may themselves have their
// own noBranch/yesBranch — arbitrary depth). These helpers operate on that
// tree by node id, immutably, and work at any depth.

function mapBranch(children, fn) {
  return (children || []).map(fn);
}

function findNodeById(tree, id) {
  for (const node of tree || []) {
    if (node.id === id) return node;
    const inNo = findNodeById(node.config?.noBranch, id);
    if (inNo) return inNo;
    const inYes = findNodeById(node.config?.yesBranch, id);
    if (inYes) return inYes;
  }
  return null;
}

// Returns a new tree with the node matching `id` replaced by `updater(node)`.
function mapNodeById(tree, id, updater) {
  return mapBranch(tree, (node) => {
    if (node.id === id) return updater(node);
    if (!node.config?.noBranch && !node.config?.yesBranch) return node;
    return {
      ...node,
      config: {
        ...node.config,
        ...(node.config?.noBranch
          ? { noBranch: mapNodeById(node.config.noBranch, id, updater) }
          : {}),
        ...(node.config?.yesBranch
          ? { yesBranch: mapNodeById(node.config.yesBranch, id, updater) }
          : {}),
      },
    };
  });
}

// Returns a new tree with the node matching `id` (and its whole subtree) removed.
function deleteNodeById(tree, id) {
  return (tree || [])
    .filter((node) => node.id !== id)
    .map((node) => {
      if (!node.config?.noBranch && !node.config?.yesBranch) return node;
      return {
        ...node,
        config: {
          ...node.config,
          ...(node.config?.noBranch
            ? { noBranch: deleteNodeById(node.config.noBranch, id) }
            : {}),
          ...(node.config?.yesBranch
            ? { yesBranch: deleteNodeById(node.config.yesBranch, id) }
            : {}),
        },
      };
    });
}

// Appends newNode to parentId's `branch` ('noBranch' | 'yesBranch') array,
// creating the array if it doesn't exist yet.
function insertChildNode(tree, parentId, branch, newNode) {
  return mapNodeById(tree, parentId, (parent) => ({
    ...parent,
    config: {
      ...parent.config,
      [branch]: [...(parent.config?.[branch] || []), newNode],
    },
  }));
}

// Inserts newNode immediately after the node matching siblingId, in whichever
// list (root or a branch array) that node currently lives in.
function insertSiblingAfter(tree, siblingId, newNode) {
  const idx = (tree || []).findIndex((n) => n.id === siblingId);
  if (idx !== -1) {
    const next = [...tree];
    next.splice(idx + 1, 0, newNode);
    return next;
  }
  return mapBranch(tree, (node) => {
    if (!node.config?.noBranch && !node.config?.yesBranch) return node;
    return {
      ...node,
      config: {
        ...node.config,
        ...(node.config?.noBranch
          ? {
              noBranch: insertSiblingAfter(
                node.config.noBranch,
                siblingId,
                newNode,
              ),
            }
          : {}),
        ...(node.config?.yesBranch
          ? {
              yesBranch: insertSiblingAfter(
                node.config.yesBranch,
                siblingId,
                newNode,
              ),
            }
          : {}),
      },
    };
  });
}

// True if `id` is the given node or lives anywhere in its subtree — used to
// clear selection when deleting a node that contains the selected one.
function isNodeOrDescendant(node, id) {
  if (!node) return false;
  if (node.id === id) return true;
  return (
    !!findNodeById(node.config?.noBranch, id) ||
    !!findNodeById(node.config?.yesBranch, id)
  );
}

// Locates where a node lives in the tree: which sibling list it's in, its
// index there, and (if it's a branch child) its parent id + which branch.
// Returns null if not found; parentId/branch are null for a root-level node.
function findNodeLocation(tree, id, parentId = null, branch = null) {
  const idx = (tree || []).findIndex((n) => n.id === id);
  if (idx !== -1) return { list: tree, index: idx, parentId, branch };
  for (const n of tree || []) {
    const inNo = findNodeLocation(n.config?.noBranch, id, n.id, "noBranch");
    if (inNo) return inNo;
    const inYes = findNodeLocation(n.config?.yesBranch, id, n.id, "yesBranch");
    if (inYes) return inYes;
  }
  return null;
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

// Buying-intent classification, computed by the signal scoring engine
// (backend/src/services/signalScoring.js) — attached per lead by
// GET /campaigns/:id/leads when the campaign has an agent set.
const CLASSIFICATION_COLORS = {
  high_intent: "badge-signal",
  warm: "badge-warning",
  low_intent: "badge-muted",
};
const CLASSIFICATION_LABELS = {
  high_intent: "High intent",
  warm: "Warm",
  low_intent: "Low intent",
};

// Manual, user-set "Lead Status" — separate from the automated pipeline
// status above. Order here is also the order shown in the dropdown/filter.
const LEAD_STATUS_META = {
  lead: {
    label: "Lead",
    color: "#6366f1",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
  },
  interested: {
    label: "Interested",
    color: "#16a34a",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    ),
  },
  meeting_booked: {
    label: "Meeting booked",
    color: "#7c3aed",
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
  },
  meeting_complete: {
    label: "Meeting complete",
    color: "#2563eb",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  closed: {
    label: "Closed",
    color: "#16a34a",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="7" />
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </svg>
    ),
  },
  wrong_person: {
    label: "Wrong person",
    color: "#d97706",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="18" y1="8" x2="23" y2="13" />
        <line x1="23" y1="8" x2="18" y2="13" />
      </svg>
    ),
  },
  not_interested: {
    label: "Not Interested",
    color: "#ef4444",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
      </svg>
    ),
  },
  no_response: {
    label: "No Response",
    color: "#9ca3af",
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
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    ),
  },
};

// Activity-log action → { label, icon } shown in the per-lead Activity popover.
const LEAD_ACTIVITY_META = {
  added: { label: "Added to campaign" },
  visited_profile: { label: "Visited profile" },
  liked_post: { label: "Liked a post" },
  followed: { label: "Followed" },
  commented: { label: "Commented on a post" },
  invite_sent: { label: "Connection request sent" },
  connected: { label: "Connection accepted" },
  message_sent: { label: "Message sent" },
  inmail_sent: { label: "InMail sent" },
  replied: { label: "Replied" },
  booked: { label: "Meeting booked" },
  failed: { label: "Failed" },
  rejected: { label: "Connection request declined" },
  skipped: { label: "Skipped" },
  lead_status_changed: { label: "Lead status changed" },
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

  // Setup-only tabs ("accounts", "schedule") don't exist once setup mode ends —
  // fall back to "leads" so the tab bar never lands on nothing selected.
  useEffect(() => {
    if (!isSetup && (tab === "accounts" || tab === "schedule")) setTab("leads");
  }, [isSetup, tab]);

  const [showImport, setShowImport] = useState(false);
  const [lfOpen, setLfOpen] = useState(false);
  const [profileUrlOpen, setProfileUrlOpen] = useState(false);
  const [linkedInProfileOpen, setLinkedInProfileOpen] = useState(false);
  const [postEngagersOpen, setPostEngagersOpen] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);

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

  async function syncStatuses() {
    try {
      const result = await campaignsApi.syncStatuses(id);
      if (result.connected > 0) {
        toast?.(
          `${result.connected} new connection${result.connected !== 1 ? "s" : ""} detected — messages sent`,
          "success",
        );
        refreshLeads();
      }
    } catch {
      /* silent — this runs on an automatic 30s poll */
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
      if (hasInvited) syncStatuses();
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

  async function refreshLeads() {
    try {
      const data = await campaignsApi.getLeads(id);
      setLeads(Array.isArray(data) ? data : []);
    } catch {}
  }

  // Called after any import modal completes in setup mode — the LinkedIn
  // account is chosen in its own wizard step (AccountsSetupTab) and leads
  // can be saved to a list right from the Leads tab's own footer, so
  // there's nothing further to ask here.
  async function handleSetupImportDone() {
    await refreshLeads();
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
        if (hasInvited) syncStatuses();
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
        <div
          style={{
            padding: "20px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sk w={80} h={14} r={4} />
            <Sk w={180} h={20} r={6} />
            <Sk w={64} h={22} r={99} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Sk key={i} w={80} h={28} r={6} />
            ))}
          </div>
          <div className="table-wrap" style={{ marginTop: 4 }}>
            <table>
              <tbody>
                <SkeletonTableRows rows={6} cols={6} />
              </tbody>
            </table>
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Campaigns
          </Link>
          <div style={{ marginTop: 24, color: "#9ca3af", fontSize: 13 }}>
            Campaign not found.
          </div>
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Campaigns
          </Link>
          <span className="detail-breadcrumb-sep">/</span>
          <span className="detail-campaign-name">{campaign.name}</span>
          <span
            className={`detail-status-pill ${campaign.status === "active" ? "active" : "paused"}`}
          >
            <span className="detail-status-dot" />
            {campaign.status === "active" ? "Active" : "Paused"}
          </span>
        </div>

        <div className="detail-topbar-right">
          {!isSetup && selectedAgent && (
            <span className="detail-chip">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="10" r="3" />
                <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
              </svg>
              {selectedAgent.name}
            </span>
          )}
          {!isSetup && campaign.settings?.linkedinAccountName && (
            <span className="detail-chip">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ width: 12, height: 12, color: "#0a66c2" }}
              >
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
              </svg>
              {campaign.settings.linkedinAccountName}
            </span>
          )}
          {isSetup && campaign.status !== "active" ? (
            <span className="detail-setup-hint">
              Complete each step to launch
            </span>
          ) : (
            <button
              className={`detail-run-btn ${campaign.status === "active" ? "pausing" : ""}`}
              onClick={handleToggleStatus}
            >
              {campaign.status === "active" ? (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
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
              { key: "leads", label: "Leads" },
              { key: "accounts", label: "LinkedIn Accounts" },
              { key: "builder", label: "Sequences" },
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
          : ["leads", "builder", "persona", "analytics", "settings"].map(
              (t) => (
                <button
                  key={t}
                  className={`detail-tab ${tab === t ? "active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ),
            )}
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
        agentId={campaign?.settings?.agentId || ""}
      />

      <LinkedInProfileModal
        open={linkedInProfileOpen}
        onClose={() => setLinkedInProfileOpen(false)}
        onImport={isSetup ? handleSetupImportDone : refreshLeads}
        campaignId={id}
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
            onDeleteLead={handleDeleteLead}
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
            onSaved={(updated, { advanceSetup = true } = {}) => {
              setCampaign((prev) => ({ ...prev, sequence: updated }));
              if (isSetup && advanceSetup) setTab("schedule");
            }}
            toast={toast}
            campaignStatus={campaign.status}
            onToggleStatus={handleToggleStatus}
            isSetup={isSetup}
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
            onSaved={(updated) => {
              setCampaign(updated);
            }}
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
            onSaved={(updated) => {
              setCampaign(updated);
            }}
            toast={toast}
            isSetup={false}
          />
        )}
        {tab === "schedule" && isSetup && (
          <ScheduleSetupTab
            campaign={campaign}
            onSaved={(updated, { advanceSetup = true } = {}) => {
              setCampaign(updated);
              if (advanceSetup) {
                setTab("leads");
                navigate(`/campaigns/${id}`, { replace: true });
              }
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
  const [search, setSearch] = useState("");
  const [importError, setImportError] = useState("");

  // Load lists on open
  useEffect(() => {
    if (!open) {
      setSelected([]);
      setActiveListId(null);
      setLeadsMap({});
      setSearch("");
      setImportError("");
      return;
    }
    setLoadingLists(true);
    leadListsApi
      .list()
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
    leadsApi
      .list(activeListId)
      .then((data) =>
        setLeadsMap((prev) => ({
          ...prev,
          [activeListId]: Array.isArray(data) ? data : [],
        })),
      )
      .catch(() => setLeadsMap((prev) => ({ ...prev, [activeListId]: [] })))
      .finally(() => setLoadingLeads(false));
  }, [activeListId]);

  const activeLeads = (leadsMap[activeListId] || []).filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.name || "").toLowerCase().includes(q) ||
      (l.company || "").toLowerCase().includes(q) ||
      (l.title || "").toLowerCase().includes(q)
    );
  });

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    const ids = activeLeads.map((l) => l.id);
    const allChecked = ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allChecked
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])],
    );
  }

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  }

  async function handleImport() {
    const allLeads = Object.values(leadsMap).flat();
    const toAdd = allLeads.filter((l) => selected.includes(l.id));
    if (!toAdd.length) return;
    setImporting(true);
    setImportError("");
    try {
      await campaignsApi.importLeads(campaignId, {
        leads: toAdd,
        source: "list",
      });
      onImported();
      onClose();
    } catch (err) {
      setImportError(err.message || "Import failed");
    }
    setImporting(false);
  }

  if (!open) return null;

  const allActiveIds = activeLeads.map((l) => l.id);
  const allActiveChecked =
    allActiveIds.length > 0 &&
    allActiveIds.every((id) => selected.includes(id));

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box animate-fade-in mlp-modal">
        {/* Header */}
        <div className="mlp-header">
          <div>
            <div className="mlp-title">Add from My Leads</div>
            <div className="mlp-subtitle">
              Select a list, then choose leads to add to this campaign
            </div>
          </div>
          <button className="mlp-close" onClick={onClose}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body: two-pane */}
        <div className="mlp-body">
          {/* Left: list sidebar */}
          <div className="mlp-sidebar">
            <div className="mlp-sidebar-label">Lists</div>
            {loadingLists ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "4px 0",
                }}
              >
                {[1, 2, 3].map((i) => (
                  <Sk key={i} w="90%" h={36} r={8} />
                ))}
              </div>
            ) : lists.length === 0 ? (
              <div className="mlp-empty-sidebar">No lists yet</div>
            ) : (
              lists.map((lst) => {
                const lstLeads = leadsMap[lst.id] || [];
                const selCount = lstLeads.filter((l) =>
                  selected.includes(l.id),
                ).length;
                return (
                  <button
                    key={lst.id}
                    className={`mlp-list-item ${activeListId === lst.id ? "active" : ""}`}
                    onClick={() => {
                      setActiveListId(lst.id);
                      setSearch("");
                    }}
                  >
                    <div className="mlp-list-icon">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                    <div className="mlp-list-info">
                      <span className="mlp-list-name">{lst.name}</span>
                      {selCount > 0 && (
                        <span className="mlp-list-sel-badge">{selCount}</span>
                      )}
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
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="mlp-search"
                    placeholder="Search leads…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="mlp-leads-list">
              {!loadingLeads && activeLeads.length > 0 && (
                <div
                  className={`mlp-lead-row mlp-select-all-row ${allActiveChecked ? "checked" : ""}`}
                  onClick={toggleAll}
                >
                  <div
                    className={`mlp-checkbox ${allActiveChecked ? "checked" : ""}`}
                  >
                    {allActiveChecked && (
                      <svg viewBox="0 0 12 12" fill="none">
                        <polyline
                          points="2,6 5,9 10,3"
                          stroke="#fff"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="mlp-select-all-label">
                    {allActiveChecked
                      ? "Deselect all"
                      : `Select all (${activeLeads.length})`}
                  </span>
                </div>
              )}
              {loadingLeads ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "8px 0",
                  }}
                >
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Sk w={36} h={36} r={999} />
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                        }}
                      >
                        <Sk w="45%" h={13} />
                        <Sk w="65%" h={11} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : lists.length === 0 ? (
                <div className="mlp-empty-pane">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
                    />
                  </svg>
                  <div className="mlp-empty-title">No lists yet</div>
                  <div className="mlp-empty-desc">
                    Go to My Leads and save leads to a list first.
                  </div>
                </div>
              ) : activeLeads.length === 0 && search ? (
                <div className="mlp-empty-pane">
                  <div className="mlp-empty-title">No matches</div>
                  <div className="mlp-empty-desc">
                    Try a different search term.
                  </div>
                </div>
              ) : activeLeads.length === 0 ? (
                <div className="mlp-empty-pane">
                  <div className="mlp-empty-title">This list is empty</div>
                  <div className="mlp-empty-desc">
                    Add leads to this list from Lead Finder or My Leads.
                  </div>
                </div>
              ) : (
                activeLeads.map((lead) => {
                  const isChecked = selected.includes(lead.id);
                  return (
                    <div
                      key={lead.id}
                      className={`mlp-lead-row ${isChecked ? "checked" : ""}`}
                      onClick={() => toggle(lead.id)}
                    >
                      <div
                        className={`mlp-checkbox ${isChecked ? "checked" : ""}`}
                      >
                        {isChecked && (
                          <svg viewBox="0 0 12 12" fill="none">
                            <polyline
                              points="2,6 5,9 10,3"
                              stroke="#fff"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="mlp-avatar">
                        {initials(lead.name).toUpperCase()}
                      </div>
                      <div className="mlp-lead-info">
                        <div className="mlp-lead-name">{lead.name || "—"}</div>
                        <div className="mlp-lead-meta">
                          {[lead.title, lead.company]
                            .filter(Boolean)
                            .join(" · ") || (
                            <span style={{ color: "#d1d5db" }}>No details</span>
                          )}
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
                            <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H6.477v-7H9v7zM7.694 8.717c-.771 0-1.286-.514-1.286-1.2s.514-1.2 1.371-1.2c.771 0 1.286.514 1.286 1.2s-.514 1.2-1.371 1.2zM18 17h-2.442v-3.826c0-1.058-.651-1.302-.895-1.302s-1.058.163-1.058 1.302V17h-2.523v-7h2.523v.977C13.93 10.407 14.581 10 15.802 10 17.023 10 18 10.977 18 13.174V17z" />
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
          <div>
            {importError && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--danger, #e55)",
                  marginBottom: 4,
                }}
              >
                {importError}
              </div>
            )}
            <span className="mlp-footer-count">
              {selected.length > 0
                ? `${selected.length} lead${selected.length !== 1 ? "s" : ""} selected`
                : "No leads selected"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mlp-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="mlp-btn-primary"
              disabled={selected.length === 0 || importing}
              onClick={handleImport}
            >
              {importing
                ? "Adding…"
                : `Add ${selected.length > 0 ? selected.length : ""} to Campaign`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CSV field-type definitions for column mapping ─────────────
const CSV_FIELD_TYPES = [
  { value: "", label: "Skip this column" },
  { value: "linkedin_url", label: "LinkedIn URL (Required)" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "full_name", label: "Full Name" },
  { value: "job_title", label: "Job Title" },
  { value: "company", label: "Company" },
  { value: "location", label: "Location" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
  { value: "headline", label: "Headline" },
  { value: "summary", label: "Summary" },
  { value: "industry", label: "Industry" },
];

function detectFieldType(header) {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, "_");
  if (h.includes("linkedin") || h === "profile_url") return "linkedin_url";
  if (h === "first_name" || h === "firstname" || h === "first")
    return "first_name";
  if (h === "last_name" || h === "lastname" || h === "last" || h === "surname")
    return "last_name";
  if (
    h === "full_name" ||
    h === "fullname" ||
    h === "name" ||
    h === "contact_name"
  )
    return "full_name";
  if (
    h.includes("job_title") ||
    h === "title" ||
    h.includes("jobtitle") ||
    h.includes("position") ||
    h === "role"
  )
    return "job_title";
  if (h.includes("company") || h.includes("organization") || h === "employer")
    return "company";
  if (
    h.includes("location") ||
    h === "city" ||
    h === "country" ||
    h === "region"
  )
    return "location";
  if (h.includes("email") || h.includes("mail")) return "email";
  if (h === "website" || h === "web" || h === "url") return "website";
  if (h.includes("headline") || h === "bio") return "headline";
  if (h.includes("summary") || h.includes("about")) return "summary";
  if (h.includes("industry") || h.includes("sector")) return "industry";
  return "";
}

function parseCsvRaw(text) {
  function splitRow(row) {
    const cells = [];
    let cur = "",
      inQ = false;
    for (const ch of row) {
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
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], sampleRows: [], allRows: [] };
  const rawHeaders = splitRow(lines[0]);
  const headers = rawHeaders.map((h) => h.replace(/^"|"$/g, "").trim());
  const allRows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]).map((c) => c.replace(/^"|"$/g, "").trim());
    if (cells.every((c) => !c)) continue;
    allRows.push(cells);
  }
  return { headers, sampleRows: allRows.slice(0, 3), allRows };
}

function applyColumnMapping(allRows, headers, mapping) {
  return allRows.map((cells, i) => {
    const lead = { id: `csv_${i}` };
    let firstName = "",
      lastName = "";
    headers.forEach((h, colIdx) => {
      const type = mapping[h] || "";
      const val = cells[colIdx] || "";
      if (type === "linkedin_url") lead.linkedinUrl = val;
      else if (type === "first_name") firstName = val;
      else if (type === "last_name") lastName = val;
      else if (type === "full_name") lead.name = val;
      else if (type === "job_title") lead.title = val;
      else if (type === "company") lead.company = val;
      else if (type === "location") lead.location = val;
    });
    if (!lead.name && (firstName || lastName))
      lead.name = [firstName, lastName].filter(Boolean).join(" ");
    if (!lead.name) lead.name = `Row ${i + 1}`;
    return lead;
  });
}

// ── CSV Setup Wizard steps ─────────────────────────────────────
function CsvSourceStep({ onSelectCsv, onSelectMyLeads }) {
  const cardStyle = {
    width: 320,
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 28,
    cursor: "pointer",
    background: "var(--surface)",
    transition: "border-color 0.15s",
  };
  const hover = (e) => (e.currentTarget.style.borderColor = "var(--signal)");
  const unhover = (e) => (e.currentTarget.style.borderColor = "var(--border)");
  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        Select Leads Source
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}>
        Choose where you want to get your leads from
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div
          style={cardStyle}
          onClick={onSelectMyLeads}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{
              width: 32,
              height: 32,
              marginBottom: 14,
              color: "var(--signal)",
            }}
          >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12c0 1.657-4.03 3-9 3s-9-1.343-9-3"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 5v14c0 1.657 4.03 3 9 3s9-1.343 9-3V5"
            />
          </svg>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            My Leads
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Add leads from your saved lead database. Pick and choose who to
            include in this campaign.
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectMyLeads();
            }}
          >
            Select →
          </button>
        </div>
        <div
          style={cardStyle}
          onClick={onSelectCsv}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{
              width: 32,
              height: 32,
              marginBottom: 14,
              color: "var(--signal)",
            }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            Upload CSV
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            Import leads from a CSV file. The file should include LinkedIn URLs
            and other optional information.
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectCsv();
            }}
          >
            Select →
          </button>
        </div>
      </div>
    </div>
  );
}

function CsvUploadStep({ onFile, onBack }) {
  const fileRef = React.useRef();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  function processFile(file) {
    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, sampleRows, allRows } = parseCsvRaw(e.target.result);
      if (!headers.length) {
        setError("No columns detected — check your CSV format");
        return;
      }
      if (!allRows.length) {
        setError(
          "No data rows found — CSV must have at least one row after the header",
        );
        return;
      }
      onFile(file, headers, sampleRows, allRows);
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 20 }}
        onClick={onBack}
      >
        ← Back
      </button>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        Upload CSV File
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
        LinkedIn URL is required. LinkedIn URLs and other optional information.
      </p>
      <div
        style={{
          border: `2px dashed ${dragOver ? "var(--signal)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "var(--surface-2)" : "var(--surface)",
          transition: "all 0.15s",
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          processFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => processFile(e.target.files[0])}
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{
            width: 40,
            height: 40,
            color: "var(--text-muted)",
            margin: "0 auto 14px",
          }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
          Click to choose a CSV file
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          or drag and drop here
        </div>
      </div>
      {error && (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function CsvMappingStep({
  file,
  headers,
  sampleData,
  allRows,
  mapping,
  onMappingChange,
  onImport,
  importing,
  error,
  onBack,
}) {
  const fileSizeKb = file ? Math.round(file.size / 1024) : 0;

  function setFieldType(header, value) {
    // If assigning a unique field (like linkedin_url), clear it from other headers first
    const unique = ["linkedin_url", "full_name"];
    const updated = { ...mapping };
    if (unique.includes(value)) {
      Object.keys(updated).forEach((k) => {
        if (updated[k] === value) updated[k] = "";
      });
    }
    updated[header] = value;
    onMappingChange(updated);
  }

  const hasLinkedinUrl = Object.values(mapping).includes("linkedin_url");

  return (
    <div>
      <button
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 20 }}
        onClick={onBack}
      >
        ← Back
      </button>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
        Match your CSV columns to the appropriate fields.{" "}
        <strong>LinkedIn URL is required.</strong>
      </p>

      {file && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginBottom: 24,
            width: "fit-content",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{
              width: 20,
              height: 20,
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{file.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              ({fileSizeKb} KB) · {headers.length} columns detected ·{" "}
              {allRows.length} rows
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: "28%" }}>CSV Column</th>
              <th style={{ width: "36%" }}>Select Type</th>
              <th>Sample Data</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, hi) => {
              const sample = sampleData
                .map((row) => row[hi] || "")
                .filter(Boolean)
                .slice(0, 3)
                .join(", ");
              return (
                <tr key={header}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{header}</td>
                  <td>
                    <select
                      className="input"
                      style={{
                        fontSize: 13,
                        padding: "5px 10px",
                        height: "auto",
                      }}
                      value={mapping[header] || ""}
                      onChange={(e) => setFieldType(header, e.target.value)}
                    >
                      {CSV_FIELD_TYPES.map((ft) => (
                        <option key={ft.value} value={ft.value}>
                          {ft.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={sample}
                  >
                    {sample || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasLinkedinUrl && (
        <div
          style={{
            fontSize: 13,
            color: "var(--warning, #f59e0b)",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ⚠ Please map a column to "LinkedIn URL (Required)" before importing
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button
        className="btn btn-primary"
        disabled={!hasLinkedinUrl || importing}
        onClick={onImport}
      >
        {importing ? "Importing…" : `Import ${allRows.length} Contacts →`}
      </button>
    </div>
  );
}

// ── CSV Import Modal ─────────────────────────────────────────
function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], hasLinkedinColumn: false };

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
  return { rows, hasLinkedinColumn: linkedinIdx !== -1 };
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
        const { rows: parsed, hasLinkedinColumn } = parseCsv(e.target.result);
        if (!parsed.length) {
          setError("No valid rows found. Make sure the CSV has a header row.");
          setRows([]);
          return;
        }
        if (!hasLinkedinColumn) {
          setError(
            'LinkedIn URL is required for leads. Your CSV needs a "linkedin_url" column (or similar) with a profile URL for every lead.',
          );
          setRows([]);
          return;
        }
        const missing = parsed.filter((r) => !r.linkedinUrl);
        if (missing.length) {
          const names = missing
            .slice(0, 3)
            .map((r) => r.name)
            .join(", ");
          setError(
            `LinkedIn URL is required for leads. ${missing.length} of ${parsed.length} rows are missing one (e.g. ${names}${missing.length > 3 ? ", …" : ""}) — fill it in and re-upload.`,
          );
          setRows([]);
          return;
        }
        setRows(parsed);
        setError("");
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
            <strong>linkedin_url (required)</strong>, <strong>title</strong>,{" "}
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
  onDeleteLead,
  onRefreshLeads,
  onSetupImportDone,
  isSetup = false,
  onSetupNext,
  linkedinAccounts = [],
  campaign,
  onSaveCampaign,
}) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [myLeadsOpen, setMyLeadsOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [retryingFor, setRetryingFor] = useState(null);
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadStatusFilter, setLeadStatusFilter] = useState([]); // empty = show all
  const [popover, setPopover] = useState(null); // { type: 'status'|'activity'|'filter', leadId?, top, left }
  const [savingLeadStatusFor, setSavingLeadStatusFor] = useState(null);
  const [activityItems, setActivityItems] = useState({}); // leadId -> items[] | 'loading' | 'error'
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!popover) return;
    function onDocClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target))
        setPopover(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [popover]);

  // Setup mode CSV wizard state
  const [csvPhase, setCsvPhase] = useState(() =>
    leads.length > 0 ? "done" : "select",
  );
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvSampleData, setCsvSampleData] = useState([]);
  const [csvAllRows, setCsvAllRows] = useState([]);
  const [csvMapping, setCsvMapping] = useState({});
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportError, setCsvImportError] = useState("");

  // (always declared — hooks must not be conditional)
  const [showSaveList, setShowSaveList] = useState(false);
  const [listName, setListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [savedListId, setSavedListId] = useState(null);
  const [nextLoading, setNextLoading] = useState(false);

  // Advance past wizard once leads are loaded (e.g. on page refresh after import)
  React.useEffect(() => {
    if (leads.length > 0 && csvPhase !== "done") setCsvPhase("done");
  }, [leads.length]);

  const LEADS_PER_PAGE = 20;

  const visibleLeads = leads
    .filter(
      (l) =>
        leadStatusFilter.length === 0 ||
        leadStatusFilter.includes(l.leadStatus || "lead"),
    )
    .filter((l) => {
      if (!leadsSearch) return true;
      const q = leadsSearch.toLowerCase();
      return (
        (l.name || "").toLowerCase().includes(q) ||
        (l.title || l.jobTitle || "").toLowerCase().includes(q) ||
        (l.company || "").toLowerCase().includes(q)
      );
    });

  const leadsTotalPages = Math.max(
    1,
    Math.ceil(visibleLeads.length / LEADS_PER_PAGE),
  );

  // Clamp the current page if filtering/search shrinks the result set
  React.useEffect(() => {
    if (leadsPage > leadsTotalPages) setLeadsPage(leadsTotalPages);
  }, [leadsTotalPages, leadsPage]);

  // Setup mode: show CSV wizard phases inline (not the old list/import-panel flow)
  if (isSetup && csvPhase !== "done") {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 900 }}>
        <MyLeadsPickerModal
          open={myLeadsOpen}
          onClose={() => setMyLeadsOpen(false)}
          campaignId={campaignId}
          onImported={() => {
            setMyLeadsOpen(false);
            onSetupImportDone?.();
          }}
        />
        {csvPhase === "select" && (
          <CsvSourceStep
            onSelectCsv={() => setCsvPhase("upload")}
            onSelectMyLeads={() => setMyLeadsOpen(true)}
          />
        )}
        {csvPhase === "upload" && (
          <CsvUploadStep
            onFile={(file, headers, sampleRows, allRows) => {
              setCsvFile(file);
              setCsvHeaders(headers);
              setCsvSampleData(sampleRows);
              setCsvAllRows(allRows);
              const autoMap = {};
              headers.forEach((h) => {
                autoMap[h] = detectFieldType(h);
              });
              setCsvMapping(autoMap);
              setCsvPhase("map");
            }}
            onBack={() => setCsvPhase("select")}
          />
        )}
        {csvPhase === "map" && (
          <CsvMappingStep
            file={csvFile}
            headers={csvHeaders}
            sampleData={csvSampleData}
            allRows={csvAllRows}
            mapping={csvMapping}
            onMappingChange={setCsvMapping}
            importing={csvImporting}
            error={csvImportError}
            onBack={() => setCsvPhase("upload")}
            onImport={async () => {
              setCsvImporting(true);
              setCsvImportError("");
              try {
                const mappedLeads = applyColumnMapping(
                  csvAllRows,
                  csvHeaders,
                  csvMapping,
                );
                await campaignsApi.importLeads(campaignId, {
                  leads: mappedLeads,
                  source: "csv",
                });
                await onRefreshLeads?.();
                setCsvPhase("done");
              } catch (e) {
                setCsvImportError(e.message || "Import failed");
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

  function openPopoverAt(e, type, leadId = null) {
    e.stopPropagation();
    if (popover?.type === type && popover?.leadId === leadId) {
      setPopover(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ type, leadId, top: rect.bottom + 4, left: rect.left });
    if (type === "activity" && leadId && !activityItems[leadId]) {
      setActivityItems((prev) => ({ ...prev, [leadId]: "loading" }));
      campaignsApi
        .getLeadActivity(campaignId, leadId)
        .then((data) =>
          setActivityItems((prev) => ({
            ...prev,
            [leadId]: data?.items || [],
          })),
        )
        .catch(() =>
          setActivityItems((prev) => ({ ...prev, [leadId]: "error" })),
        );
    }
  }

  async function handleSetLeadStatus(lead, slug) {
    setPopover(null);
    setSavingLeadStatusFor(lead.id);
    try {
      await campaignsApi.updateLeadQualification(campaignId, lead.id, slug);
      await onRefreshLeads?.();
    } finally {
      setSavingLeadStatusFor(null);
    }
  }

  function toggleLeadStatusFilter(slug) {
    setLeadsPage(1);
    setLeadStatusFilter((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  const pagedLeads = visibleLeads.slice(
    (leadsPage - 1) * LEADS_PER_PAGE,
    leadsPage * LEADS_PER_PAGE,
  );

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
            {leadsSearch || leadStatusFilter.length > 0
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
              onChange={(e) => {
                setLeadsSearch(e.target.value);
                setLeadsPage(1);
              }}
            />
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
                <th>Intent</th>
                <th>Activity</th>
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Lead Status
                    <button
                      onClick={(e) => openPopoverAt(e, "filter")}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Filter by lead status"
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 2,
                        cursor: "pointer",
                        color:
                          leadStatusFilter.length > 0
                            ? "var(--signal)"
                            : "var(--text-muted)",
                        display: "inline-flex",
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ width: 12, height: 12 }}
                      >
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                    </button>
                  </span>
                </th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedLeads.map((l) => (
                <tr key={l.id || l.name}>
                  <td style={{ fontWeight: 600 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {l.name || l.firstName + " " + l.lastName || "—"}
                      {l.profileSummary && (
                        <span
                          title={l.profileSummary}
                          style={{
                            fontSize: 10,
                            color: "var(--signal)",
                            cursor: "help",
                            flexShrink: 0,
                          }}
                        >
                          ◆
                        </span>
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
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            width="11"
                            height="11"
                          >
                            <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H6.477v-7H9v7zM7.694 8.717c-.771 0-1.286-.514-1.286-1.2s.514-1.2 1.371-1.2c.771 0 1.286.514 1.286 1.2s-.514 1.2-1.371 1.2zM18 17h-2.442v-3.826c0-1.058-.651-1.302-.895-1.302s-1.058.163-1.058 1.302V17h-2.523v-7h2.523v.977C13.93 10.407 14.581 10 15.802 10 17.023 10 18 10.977 18 13.174V17z" />
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
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--danger)",
                          marginTop: 3,
                          maxWidth: 180,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={l.lastError}
                      >
                        {l.lastError}
                      </div>
                    )}
                  </td>
                  <td>
                    {l.classification ? (
                      <span
                        className={`badge ${CLASSIFICATION_COLORS[l.classification] || "badge-muted"}`}
                        title={l.scoreReason || undefined}
                      >
                        {CLASSIFICATION_LABELS[l.classification] ||
                          l.classification}{" "}
                        · {l.score}
                      </span>
                    ) : (
                      <span
                        style={{ color: "var(--text-muted)", fontSize: 12 }}
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={(e) => openPopoverAt(e, "activity", l.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="View activity"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ width: 11, height: 11 }}
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Activity
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={(e) => openPopoverAt(e, "status", l.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      disabled={savingLeadStatusFor === l.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        borderRadius: 6,
                        padding: "4px 9px",
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          LEAD_STATUS_META[l.leadStatus || "lead"]?.color ||
                          "#6366f1",
                        cursor:
                          savingLeadStatusFor === l.id ? "wait" : "pointer",
                        opacity: savingLeadStatusFor === l.id ? 0.6 : 1,
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          display: "inline-flex",
                        }}
                      >
                        {LEAD_STATUS_META[l.leadStatus || "lead"]?.icon}
                      </span>
                      {LEAD_STATUS_META[l.leadStatus || "lead"]?.label ||
                        "Lead"}
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ width: 10, height: 10, flexShrink: 0 }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {l.addedAt
                      ? new Date(l.addedAt).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td>
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

      {leadsTotalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            padding: "10px 14px",
            marginTop: 10,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <span style={{ marginRight: 8 }}>
            {(leadsPage - 1) * LEADS_PER_PAGE + 1}–
            {Math.min(leadsPage * LEADS_PER_PAGE, visibleLeads.length)} of{" "}
            {visibleLeads.length.toLocaleString()} leads
          </span>
          <button
            className="btn btn-ghost btn-icon"
            style={{
              width: 26,
              height: 26,
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            disabled={leadsPage === 1}
            onClick={() => setLeadsPage((p) => p - 1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          {Array.from(
            { length: Math.min(5, leadsTotalPages) },
            (_, i) => i + 1,
          ).map((p) => (
            <button
              key={p}
              className={`btn btn-icon${leadsPage === p ? "" : " btn-ghost"}`}
              style={{
                width: 26,
                height: 26,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                lineHeight: 1,
                fontWeight: leadsPage === p ? 700 : 500,
                ...(leadsPage === p && {
                  background: "var(--signal-subtle)",
                  color: "var(--signal)",
                  border: "1px solid rgba(99,102,241,0.25)",
                }),
              }}
              onClick={() => setLeadsPage(p)}
            >
              {p}
            </button>
          ))}
          {leadsTotalPages > 5 && <span>…</span>}
          <button
            className="btn btn-ghost btn-icon"
            style={{
              width: 26,
              height: 26,
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            disabled={leadsPage >= leadsTotalPages}
            onClick={() => setLeadsPage((p) => p + 1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {isSetup && (
        <div className="setup-leads-footer">
          {leads.length > 0 &&
            (savedListId ? (
              <span className="setup-saved-badge">✓ Saved to My Lists</span>
            ) : showSaveList ? (
              <div className="setup-save-list-row">
                <input
                  className="input"
                  style={{ width: 220 }}
                  placeholder="List name…"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && listName.trim() && handleSaveAsMyList()
                  }
                  autoFocus
                />
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!listName.trim() || savingList}
                  onClick={handleSaveAsMyList}
                >
                  {savingList ? "Saving…" : "Save List"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowSaveList(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSaveList(true)}
              >
                + Save as My List
              </button>
            ))}
          <button
            className="btn btn-primary"
            disabled={leads.length === 0}
            onClick={onSetupNext}
            style={{ marginLeft: "auto" }}
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
                        toast(`${s.label} — coming soon`, "info");
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

      {popover &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popover.top,
              left: popover.left,
              zIndex: 9999,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              minWidth: popover.type === "activity" ? 260 : 190,
              maxWidth: 300,
              padding: popover.type === "activity" ? "10px 12px" : 4,
            }}
          >
            {popover.type === "status" &&
              (() => {
                const lead = leads.find((l) => l.id === popover.leadId);
                return Object.entries(LEAD_STATUS_META).map(([slug, meta]) => (
                  <button
                    key={slug}
                    onClick={() => handleSetLeadStatus(lead, slug)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background:
                        (lead?.leadStatus || "lead") === slug
                          ? "var(--surface-2)"
                          : "transparent",
                      color: meta.color,
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        display: "inline-flex",
                        flexShrink: 0,
                      }}
                    >
                      {meta.icon}
                    </span>
                    {meta.label}
                  </button>
                ));
              })()}

            {popover.type === "filter" && (
              <>
                {leadStatusFilter.length > 0 && (
                  <button
                    onClick={() => {
                      setLeadsPage(1);
                      setLeadStatusFilter([]);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    Clear filter
                  </button>
                )}
                {Object.entries(LEAD_STATUS_META).map(([slug, meta]) => (
                  <button
                    key={slug}
                    onClick={() => toggleLeadStatusFilter(slug)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: leadStatusFilter.includes(slug)
                        ? "var(--surface-2)"
                        : "transparent",
                      color: meta.color,
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        flexShrink: 0,
                        border: `1.5px solid ${leadStatusFilter.includes(slug) ? meta.color : "var(--border)"}`,
                        background: leadStatusFilter.includes(slug)
                          ? meta.color
                          : "transparent",
                      }}
                    />
                    {meta.label}
                  </button>
                ))}
              </>
            )}

            {popover.type === "activity" &&
              (() => {
                const items = activityItems[popover.leadId];
                if (items === "loading") {
                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        padding: "6px 2px",
                      }}
                    >
                      Loading…
                    </div>
                  );
                }
                if (items === "error") {
                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--danger)",
                        padding: "6px 2px",
                      }}
                    >
                      Failed to load activity.
                    </div>
                  );
                }
                if (!items?.length) {
                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        padding: "6px 2px",
                      }}
                    >
                      No activity yet.
                    </div>
                  );
                }
                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {items.map((item) => (
                      <div key={item.id} style={{ display: "flex", gap: 8 }}>
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--signal)",
                            marginTop: 5,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {LEAD_ACTIVITY_META[item.action]?.label ||
                              item.action}
                          </div>
                          {item.detail && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                              }}
                            >
                              {item.detail}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--text-muted)",
                            }}
                          >
                            {timeAgo(item.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </div>,
          document.body,
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
}) {
  // nodes is a real tree — a node's children live at config.noBranch /
  // config.yesBranch, at any depth. This matches the persisted JSON shape
  // exactly, so no flatten/reconstruct step is needed. Nodes loaded from
  // older data that predates stable ids (see addNode) get one generated
  // here in memory; it persists next time the sequence is saved.
  const [nodes, setNodes] = useState(() => {
    function ensureIds(list) {
      return (list || []).map((n) => ({
        ...n,
        id: n.id || `n_${Math.random().toString(36).slice(2)}`,
        config: {
          ...n.config,
          ...(n.config?.noBranch
            ? { noBranch: ensureIds(n.config.noBranch) }
            : {}),
          ...(n.config?.yesBranch
            ? { yesBranch: ensureIds(n.config.yesBranch) }
            : {}),
        },
      }));
    }
    return ensureIds(
      flattenVisitProfileForks(normalizeLegacyFlatSequence(initialNodes)),
    );
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
  const [addingToNoBranch, setAddingToNoBranch] = useState(null); // condNode.id
  const [addingToYesBranch, setAddingToYesBranch] = useState(null); // condNode.id

  // Close the step-picker dropdown on an outside click. Doesn't use a
  // full-screen overlay div — .builder-inner has a CSS transform (for pan/
  // zoom), which creates its own stacking context, so an overlay with a
  // higher z-index than .builder-canvas would paint above the dropdown and
  // swallow clicks meant for it. A document listener sidesteps that.
  useEffect(() => {
    if (
      addingAt === null &&
      addingToNoBranch === null &&
      addingToYesBranch === null
    )
      return;
    function handleOutsideClick(e) {
      if (
        e.target.closest(".node-action-menu") ||
        e.target.closest(".add-node-btn")
      )
        return;
      setAddingAt(null);
      setAddingToNoBranch(null);
      setAddingToYesBranch(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [addingAt, addingToNoBranch, addingToYesBranch]);

  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const isDraggingRef = React.useRef(false);
  const [openStatsId, setOpenStatsId] = useState(null);
  const [transform, setTransform] = useState({ zoom: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const canvasRef = useRef(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startPx: 0,
    startPy: 0,
    moved: false,
  });

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

  // Keeps every fork's dashed connector lines pointing at the actual
  // incoming trunk dot, which CSS alone can't do: the No/Yes columns are
  // only as wide as their own direct content (a nested fork further down a
  // branch no longer widens its ancestor column — see the `.builder-
  // branch-col > .builder-branch-wrap` rule in the CSS), but the two
  // columns still aren't always exactly equal width (e.g. one has an extra
  // label), so a fixed 50% would still drift off center occasionally. Runs
  // after every layout-affecting change (nodes added/removed/
  // reconfigured) and writes plain CSS custom properties directly onto the
  // DOM nodes — no React state, since this is a pure visual sync that
  // would otherwise cause a render loop.
  // Deliberately NOT re-run on zoom: .builder-inner scales everything
  // (dot, columns, and the gap between them) by the same factor, so the
  // ratio this measures is zoom-invariant — dividing by the zoom at
  // measurement time already cancels it out. Re-running on every wheel
  // tick bought nothing but a pile of synchronous layout reads on the
  // main thread during a scroll gesture, which is exactly what made
  // zooming feel janky.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoom = transform.zoom || 1;
    canvas.querySelectorAll(".builder-branch-wrap").forEach((wrap) => {
      const dot = wrap.querySelector(":scope > .builder-dot");
      const fork = wrap.querySelector(":scope > .builder-branch-fork");
      const noCol = fork?.querySelector(":scope > .branch-col-no");
      const yesCol = fork?.querySelector(":scope > .branch-col-yes");
      if (!dot || !noCol || !yesCol) return;
      const dotRect = dot.getBoundingClientRect();
      const dotX = dotRect.left + dotRect.width / 2;
      [noCol, yesCol].forEach((col) => {
        const rect = col.getBoundingClientRect();
        const dotXLocal = (dotX - rect.left) / zoom;
        const center = rect.width / zoom / 2;
        const tieLeft = Math.min(center, dotXLocal);
        const tieWidth = Math.abs(dotXLocal - center);
        col.style.setProperty("--dot-x", `${dotXLocal}px`);
        col.style.setProperty("--tie-left", `${tieLeft}px`);
        col.style.setProperty("--tie-width", `${tieWidth}px`);
      });
    });
  }, [nodes]);

  function getNodeLeadStats(nodeType) {
    if (!leads?.length) return { inProgress: 0, finished: 0, failed: 0 };
    const failedSt = ["failed", "rejected", "skipped"];
    let inProgressSt, finishedSt;
    if (
      ["visit_profile", "like_post", "follow", "comment_post"].includes(
        nodeType,
      )
    ) {
      inProgressSt = ["pending"];
      finishedSt = ["invited", "connected", "replied", "booked"];
    } else if (nodeType === "connection_request") {
      inProgressSt = ["invited"];
      finishedSt = ["connected", "replied", "booked"];
    } else if (["message", "message_open", "inmail"].includes(nodeType)) {
      inProgressSt = ["connected"];
      finishedSt = ["replied", "booked"];
    } else {
      inProgressSt = ["pending", "invited"];
      finishedSt = ["connected", "replied", "booked"];
    }
    return {
      inProgress: leads.filter((l) => inProgressSt.includes(l.status)).length,
      finished: leads.filter((l) => finishedSt.includes(l.status)).length,
      failed: leads.filter((l) => failedSt.includes(l.status)).length,
    };
  }

  const selectedNode = findNodeById(nodes, selectedId);

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

  async function saveSequence(updatedNodes, { advanceSetup = true } = {}) {
    // The tree already matches the persisted shape 1:1 — just strip the
    // UI-only `_new` flag (used for the entrance animation) recursively.
    function stripUiFields(list) {
      return (list || []).map(({ _new, ...rest }) => ({
        ...rest,
        config: {
          ...rest.config,
          ...(rest.config?.noBranch
            ? { noBranch: stripUiFields(rest.config.noBranch) }
            : {}),
          ...(rest.config?.yesBranch
            ? { yesBranch: stripUiFields(rest.config.yesBranch) }
            : {}),
        },
      }));
    }
    function countConnectionRequests(list) {
      return (list || []).reduce(
        (sum, n) =>
          sum +
          (n.type === "connection_request" ? 1 : 0) +
          countConnectionRequests(n.config?.noBranch) +
          countConnectionRequests(n.config?.yesBranch),
        0,
      );
    }
    if (countConnectionRequests(updatedNodes) > 1) {
      toast?.("A sequence can only have one Send Connection step", "danger");
      return;
    }
    setSaving(true);
    try {
      const payload = { nodes: stripUiFields(updatedNodes) };
      const result = await campaignsApi.updateSequence(campaignId, payload);
      onSaved(result, { advanceSetup });
      toast?.("Sequence saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save sequence", "danger");
    } finally {
      setSaving(false);
    }
  }

  // target: { kind: 'root', afterId: string | null } — afterId null means
  //   "insert as the very first node" (used by the empty-state "+")
  // target: { kind: 'branch', parentId: string, branch: 'noBranch' | 'yesBranch' }
  function addNode(type, target) {
    const makeWaitNode = () => ({
      id: crypto.randomUUID(),
      type: "wait",
      config: { days: 1, unit: "days" },
      _new: true,
    });
    const newNode = {
      id: crypto.randomUUID(),
      type,
      config: type === "wait" ? { days: 1, unit: "days" } : {},
      _new: true,
    };
    // A node that forks into a Yes/No branch renders as that fork, not a
    // plain connector — so its default "next step" has to live inside each
    // branch, not as a flat sibling after it (which would render as a
    // disconnected orphan below an empty fork). Give both branches their own
    // default wait. Non-forking types (wait/stop/voice_note) have nowhere to
    // put a branch wait, so voice_note and visit_profile keep the old
    // flat-sibling insert — visit_profile always gets a default "Wait 1d"
    // right after it, same as voice_note.
    // cond_1st_level ("Is Connected") checks current connection state
    // instantly — there's no outcome to wait out, so unlike other branching
    // nodes its Yes/No branches start empty instead of pre-filled with a wait.
    // message/message_open/inmail have no "Replied" branch at all — a reply
    // always hard-stops the sequence for that lead (see backend), so only
    // their "Not Replied" follow-up path exists.
    const isReplyNode = ["message", "message_open", "inmail"].includes(type);
    if (isReplyNode) {
      newNode.config = { ...newNode.config, noBranch: [makeWaitNode()] };
    } else if (nodeHasBranches(type) && type !== "cond_1st_level") {
      newNode.config = {
        ...newNode.config,
        yesBranch: [makeWaitNode()],
        noBranch: [makeWaitNode()],
      };
    }
    const autoWaitSibling =
      type === "voice_note" || type === "visit_profile" ? makeWaitNode() : null;
    setNodes((prev) => {
      let next;
      if (target.kind === "branch") {
        next = insertChildNode(prev, target.parentId, target.branch, newNode);
      } else if (target.afterId == null) {
        next = [newNode, ...prev];
      } else {
        next = insertSiblingAfter(prev, target.afterId, newNode);
      }
      if (autoWaitSibling)
        next = insertSiblingAfter(next, newNode.id, autoWaitSibling);
      return next;
    });
    setAddingAt(null);
    setAddingToNoBranch(null);
    setAddingToYesBranch(null);
    setSelectedId(newNode.id);
  }

  function updateNode(id, config) {
    setNodes((prev) =>
      mapNodeById(prev, id, (n) => ({
        ...n,
        config: { ...n.config, ...config },
      })),
    );
  }

  function deleteNode(id) {
    setNodes((prev) => deleteNodeById(prev, id));
    if (selectedId && isNodeOrDescendant(findNodeById(nodes, id), selectedId))
      setSelectedId(null);
  }

  // Anchored step-picker dropdown — rendered inline right after the "+"
  // button that opened it (inside a position:relative wrapper), so it's
  // always pinned to that exact button regardless of scroll/pan/zoom.
  function renderStepMenu(items, onPick) {
    return (
      <div
        className="node-action-menu animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((s) => (
          <button
            key={s.type}
            className="node-action-item"
            onClick={() => onPick(s.type)}
          >
            <span className="node-action-icon">{s.icon}</span>
            <span className="node-action-label">{s.label}</span>
          </button>
        ))}
      </div>
    );
  }

  function handleCanvasMouseDown(e) {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPx: transform.x,
      startPy: transform.y,
      moved: false,
    };
    setPanning(true);
  }
  function handleCanvasMouseMove(e) {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true;
      setTransform((t) => ({
        ...t,
        x: dragRef.current.startPx + dx,
        y: dragRef.current.startPy + dy,
      }));
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
    setTransform((t) => {
      // Scale continuously with however far this particular tick actually
      // scrolled instead of a flat ±10% per event — a trackpad's small,
      // frequent deltas then zoom in tiny smooth increments, and one
      // notch of a mouse wheel's much larger delta is clamped so it
      // doesn't jump the zoom level too far in one step either way.
      const clampedDelta = Math.max(-100, Math.min(100, e.deltaY));
      const factor = Math.exp(-clampedDelta * 0.0018);
      const newZoom = Math.min(2.5, Math.max(0.2, t.zoom * factor));
      const scale = newZoom / t.zoom;
      return {
        zoom: newZoom,
        x: mx - scale * (mx - t.x),
        y: my - scale * (my - t.y),
      };
    });
  }
  function zoomIn() {
    setTransform((t) => ({
      ...t,
      zoom: Math.min(2.5, parseFloat((t.zoom + 0.1).toFixed(1))),
    }));
  }
  function zoomOut() {
    setTransform((t) => ({
      ...t,
      zoom: Math.max(0.2, parseFloat((t.zoom - 0.1).toFixed(1))),
    }));
  }
  function resetView() {
    setTransform({ zoom: 1, x: 0, y: 0 });
  }

  const StopPill = () => (
    <div className="builder-stop-node">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
      </svg>
      Stop
    </div>
  );

  // Renders a top-level (trunk) node: draggable, full-size card, external
  // stat badges, its own "+" to insert the next trunk node after it (or, if
  // it branches, its whole recursive fork instead).
  function renderRootNode(node, i) {
    if (node.type === "stop") {
      return (
        <div
          key={node.id}
          className="builder-node-wrap"
          style={{ alignItems: "center" }}
        >
          <div className="builder-stop-node builder-stop-node--removable">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
            </svg>
            Stop
            <button
              className="btn btn-icon btn-ghost"
              style={{ fontSize: 11, color: "var(--danger)", marginLeft: 4 }}
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id);
              }}
              title="Remove"
            >
              ✕
            </button>
          </div>
          <div className="builder-connector-wrap">
            <div className="builder-connector" />
            <div className="builder-dot" />
            <div className="builder-connector" />
          </div>
        </div>
      );
    }

    const meta = stepMeta(node.type);
    const ok = nodeConfigured(node);
    const sub =
      node.type === "wait"
        ? null
        : node.config?.text
          ? node.config.text.slice(0, 42) +
            (node.config.text.length > 42 ? "…" : "")
          : node.config?.note
            ? node.config.note.slice(0, 42) +
              (node.config.note.length > 42 ? "…" : "")
            : null;
    const nodeStats = getNodeLeadStats(node.type);
    const statsTotal =
      nodeStats.inProgress + nodeStats.finished + nodeStats.failed;

    return (
      <div
        key={node.id}
        className={`builder-node-wrap${dragOverIndex === i && dragIndex !== i ? " builder-drop-target" : ""}`}
        style={{ position: "relative" }}
        onDragOver={(e) => handleDragOver(e, i)}
        onDrop={(e) => handleDrop(e, i)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget))
            setDragOverIndex(null);
        }}
      >
        <div className="builder-node-row">
          <div
            draggable
            className={`builder-node${node.type === "wait" ? " builder-node-wait" : ""}${node._new ? " builder-node--new" : ""}${nodeHasBranches(node.type) ? " condition" : ""}${!ok ? " missing" : ""}${selectedId === node.id ? " selected" : ""}${dragIndex === i ? " dragging" : ""}`}
            style={{ animationDelay: node._new ? "0ms" : `${i * 45}ms` }}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDraggingRef.current) setSelectedId(node.id);
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
            <div className="node-actions" onClick={(e) => e.stopPropagation()}>
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
                  deleteNode(node.id);
                }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          </div>

          {leads?.length > 0 && statsTotal > 0 && (
            <div className="node-ext-badges">
              {nodeStats.inProgress > 0 && (
                <span className="node-ext-badge node-ext-badge--progress">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1z" />
                  </svg>
                  {nodeStats.inProgress}
                </span>
              )}
              {nodeStats.finished > 0 && (
                <span className="node-ext-badge node-ext-badge--done">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3,8 6,11 13,4" />
                  </svg>
                  {nodeStats.finished}
                </span>
              )}
              {nodeStats.failed > 0 && (
                <span className="node-ext-badge node-ext-badge--failed">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="4" y1="4" x2="12" y2="12" />
                    <line x1="12" y1="4" x2="4" y2="12" />
                  </svg>
                  {nodeStats.failed}
                </span>
              )}
            </div>
          )}
        </div>

        {nodeHasBranches(node.type) ? (
          renderFork(node)
        ) : (node.type === "visit_profile" || node.type === "voice_note") &&
          nodes[i + 1]?.type === "wait" ? (
          // The wait right after an action is its fixed auto-added pair
          // (see addNode's autoWaitSibling) — no "+" to wedge another step
          // in between it and the action it's timeid off of.
          <div className="builder-connector-wrap">
            <div className="builder-connector" />
          </div>
        ) : (
          <div className="builder-connector-wrap">
            <div className="builder-connector" />
            <button
              className="add-node-btn"
              onClick={(e) => {
                e.stopPropagation();
                setAddingAt(node.id);
                setAddingToNoBranch(null);
                setAddingToYesBranch(null);
              }}
              title="Add step"
            >
              +
            </button>
            <div className="builder-connector" />
            {addingAt === node.id &&
              renderStepMenu(BUILDER_MENU_ACTIONS, (type) =>
                addNode(type, { kind: "root", afterId: node.id }),
              )}
          </div>
        )}
      </div>
    );
  }

  // Renders a branching node's fork — the No/Yes columns, each listing its
  // children (recursively rendered, so a child that itself branches shows
  // its own nested fork right below it) plus that column's single append-
  // only "+" and terminal Stop. Reused for both trunk nodes and nested
  // branch children, at any depth — this is what makes nesting recursive.
  function renderFork(node) {
    const noBranchNodes = node.config?.noBranch || [];
    // message/message_open/inmail have no "Replied" branch — replying
    // always hard-stops the sequence for that lead, so there's nothing to
    // build there. Only their "Not Replied" follow-up path renders.
    const isReplyNode = ["message", "message_open", "inmail"].includes(
      node.type,
    );
    const yesBranchNodes = isReplyNode ? [] : node.config?.yesBranch || [];
    const labels = getBranchLabels(node.type);
    // No/"Not Accepted" reads as the outcome of waiting it out, so when the
    // branch leads with a plain, non-forking step (e.g. connection_request's
    // default wait) its tag sits under that step rather than above it.
    // Otherwise — the branch is empty (e.g. a freshly-added cond_1st_level,
    // which has nothing to wait out), or its first child itself forks (e.g.
    // connection_request added straight into an empty No branch, with no
    // wait ahead of it) — there's no plain leading step to sit under, so the
    // tag is anchored on the fork bar instead, mirroring how Yes/"Accepted"
    // always sits on the bar. (A forking first child renders its own nested
    // fork right below it, which would otherwise strand the tag far beneath
    // the whole nested subtree instead of at this branch's own fork point.)
    const [noFirst, ...noRest] = noBranchNodes;
    const noLeadsWithFork = !!noFirst && nodeHasBranches(noFirst.type);
    const noLabelOnBar = !noFirst || noLeadsWithFork;
    // Once a branch's last step itself forks, it already ends in its own
    // real Stop pills one level down — this branch's own "add here" + Stop
    // would just float below that entire nested fork, redundant and
    // disconnected-looking. Only show them while the branch still ends in a
    // plain (non-forking) step, or is empty.
    const noTailForks =
      noBranchNodes.length > 0 &&
      nodeHasBranches(noBranchNodes[noBranchNodes.length - 1].type);
    const yesTailForks =
      yesBranchNodes.length > 0 &&
      nodeHasBranches(yesBranchNodes[yesBranchNodes.length - 1].type);
    return (
      <div className="builder-branch-wrap">
        <div className="builder-connector" />
        <div className="builder-dot" />
        <div className="builder-branch-fork">
          {/* ── No column (left) — tag on the bar unless a plain leading
              step (the wait) precedes it, in which case the tag sits under
              that step instead; then anything added after. ── */}
          <div className="builder-branch-col branch-col-no">
            {noLabelOnBar ? (
              <>
                <span className="branch-label branch-label-no branch-col-no-label">
                  {labels.no}
                </span>
                <div className="branch-nb-connector" />
                {noFirst && renderBranchChild(noFirst, "no")}
              </>
            ) : (
              <>
                {renderBranchChild(noFirst, "no")}
                <div className="branch-nb-connector" />
                <span className="branch-label branch-label-no">
                  {labels.no}
                </span>
              </>
            )}
            {noRest.map((nb) => renderBranchChild(nb, "no"))}
            {!noTailForks && (
              <>
                <div className="branch-nb-connector" />
                <span style={{ position: "relative", display: "inline-block" }}>
                  <button
                    className={`add-node-btn${addingToNoBranch === node.id ? " menu-open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddingToNoBranch(node.id);
                      setAddingToYesBranch(null);
                      setAddingAt(null);
                    }}
                    title="Add step to No branch"
                  >
                    +
                  </button>
                  {addingToNoBranch === node.id &&
                    renderStepMenu(NO_BRANCH_ACTIONS, (type) =>
                      addNode(type, {
                        kind: "branch",
                        parentId: node.id,
                        branch: "noBranch",
                      }),
                    )}
                </span>
                <div className="branch-nb-connector" />
                <StopPill />
              </>
            )}
            <div className="branch-col-fill" />
          </div>

          {/* ── Yes column (right) — mirrors the No column's order.
              For message/message_open/inmail this is a static, non-editable
              indicator instead: a reply always hard-stops the sequence for
              that lead, so there's no branch content to build here. ── */}
          <div className="builder-branch-col branch-col-yes">
            {/* "Accepted" sits right on this column's own dashed line —
                above the wait it precedes — instead of stacked inside the
                column's normal flow. Anchored to the column itself (not
                the whole fork) so it stays centered over the wait even
                when the No column is a very different width. */}
            <span className="branch-label branch-label-yes branch-col-yes-label">
              {labels.yes}
            </span>
            <div className="branch-nb-connector branch-nb-connector-yes" />
            {isReplyNode ? (
              <>
                <span
                  style={{ fontSize: 11, color: "var(--text-muted)" }}
                  title="A reply from the lead ends automation here — no further steps run."
                >
                  Sequence stops
                </span>
                <div className="branch-nb-connector branch-nb-connector-yes" />
                <StopPill />
              </>
            ) : (
              <>
                {yesBranchNodes.map((yb) => renderBranchChild(yb, "yes"))}
                {!yesTailForks && (
                  <>
                    <div className="branch-nb-connector branch-nb-connector-yes" />
                    <span
                      style={{ position: "relative", display: "inline-block" }}
                    >
                      <button
                        className={`add-node-btn${addingToYesBranch === node.id ? " menu-open" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddingToYesBranch(node.id);
                          setAddingToNoBranch(null);
                          setAddingAt(null);
                        }}
                        title="Add step to Yes branch"
                      >
                        +
                      </button>
                      {addingToYesBranch === node.id &&
                        renderStepMenu(YES_BRANCH_ACTIONS, (type) =>
                          addNode(type, {
                            kind: "branch",
                            parentId: node.id,
                            branch: "yesBranch",
                          }),
                        )}
                    </span>
                    <div className="branch-nb-connector branch-nb-connector-yes" />
                    <StopPill />
                  </>
                )}
              </>
            )}
            <div className="branch-col-fill" />
          </div>
        </div>
      </div>
    );
  }

  // Renders one node inside a branch column: the compact pill, and — if
  // this child itself has branches — its own fork recursively underneath.
  function renderBranchChild(child, side) {
    const cMeta = stepMeta(child.type);
    const cOk = nodeConfigured(child);
    const connectorClass =
      side === "yes"
        ? "branch-nb-connector branch-nb-connector-yes"
        : "branch-nb-connector";
    return (
      <React.Fragment key={child.id}>
        <div className={connectorClass} />
        <div
          className={`builder-node builder-node-nb${child.type === "wait" ? " builder-node-wait" : ""}${side === "yes" ? " builder-node-yb" : ""}${selectedId === child.id ? " selected" : ""}${!cOk ? " missing" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(child.id);
          }}
        >
          <div className="node-icon">{cMeta.icon}</div>
          <div className="node-content">
            <div className="node-label">{nodeLabel(child)}</div>
            {!cOk && <div className="node-error">Action required</div>}
          </div>
          <button
            className="btn btn-icon btn-ghost"
            style={{ fontSize: 11, color: "var(--danger)", flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(child.id);
            }}
            title="Remove"
          >
            ✕
          </button>
        </div>
        {nodeHasBranches(child.type) && renderFork(child)}
      </React.Fragment>
    );
  }

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
        style={{ cursor: panning ? "grabbing" : "grab" }}
      >
        <div
          className="builder-inner"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
            transformOrigin: "0 0",
            // Off while actively dragging — panning needs the canvas to
            // track the cursor 1:1, and easing it would make the drag feel
            // like it's lagging behind. On the rest of the time (wheel
            // zoom, the +/- buttons, reset) so each step eases into place
            // instead of snapping, and overlapping wheel ticks blend into
            // one smooth zoom instead of a stutter of hard jumps.
            transition: panning ? "none" : "transform 0.12s ease-out",
          }}
        >
          {/* Start node */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              position: "relative",
            }}
          >
            <div
              className={`builder-entry-node ${campaignStatus === "active" ? "builder-entry-node--active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus?.();
              }}
              title={
                campaignStatus === "active"
                  ? "Pause campaign"
                  : "Start campaign"
              }
              style={{ cursor: "pointer" }}
            >
              {campaignStatus === "active" ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ width: 12, height: 12, flexShrink: 0 }}
                >
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
              <span>{campaignStatus === "active" ? "Running" : "Start"}</span>
            </div>
            {!isSetup && leads?.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#4285f4",
                  background: "#e8f0fe",
                  borderRadius: 20,
                  padding: "3px 9px",
                  position: "absolute",
                  right: "-50px",
                }}
              >
                {leads.length.toLocaleString()}
              </span>
            )}
          </div>

          {/* Connector after Start / empty state prompt */}
          {nodes.length === 0 ? (
            <div className="builder-connector-wrap">
              <div className="builder-connector" />
              <button
                className="add-node-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingAt("start");
                }}
                title="Add first step"
              >
                +
              </button>
              <div className="builder-connector" style={{ opacity: 0.3 }} />
              {addingAt === "start" &&
                renderStepMenu(BUILDER_MENU_ACTIONS, (type) =>
                  addNode(type, { kind: "root", afterId: null }),
                )}
            </div>
          ) : (
            <div className="builder-connector-wrap">
              <div className="builder-connector" />
            </div>
          )}

          {nodes.length === 0 && <StopPill />}

          {nodes.map((node, i) => renderRootNode(node, i))}
        </div>
        {/* /builder-inner */}

        {/* Save button(s) — fixed to the canvas corner, not the pannable/
            zoomable inner content, so they're always reachable regardless
            of scroll position or zoom level. During setup, saving just
            persists the sequence and stays put — "Next: Schedule" is the
            explicit, separate action for moving on to the next step. */}
        <div className="builder-save-btn-group">
          <button
            className="btn btn-primary btn-sm"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              saveSequence(nodes, { advanceSetup: false });
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Sequence"}
          </button>
          {isSetup && (
            <button
              className="btn btn-secondary btn-sm"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                saveSequence(nodes);
              }}
              disabled={saving}
            >
              {saving ? "Saving…" : "Next: Schedule →"}
            </button>
          )}
        </div>

        {/* Zoom controls */}
        <div
          className="builder-zoom-controls"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="builder-zoom-btn"
            onClick={zoomOut}
            title="Zoom out"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <span className="builder-zoom-pct">
            {Math.round(transform.zoom * 100)}%
          </span>
          <button className="builder-zoom-btn" onClick={zoomIn} title="Zoom in">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <div className="builder-zoom-divider" />
          <button
            className="builder-zoom-btn"
            onClick={resetView}
            title="Reset view (100%)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
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
                  onClick={(e) => {
                    const loc = findNodeLocation(nodes, selectedNode.id);
                    deleteNode(selectedNode.id);
                    if (!loc || !loc.parentId) {
                      const prevSibling =
                        loc && loc.index > 0 ? loc.list[loc.index - 1] : null;
                      setAddingAt(prevSibling ? prevSibling.id : "start");
                    } else if (loc.branch === "noBranch") {
                      setAddingToNoBranch(loc.parentId);
                    } else {
                      setAddingToYesBranch(loc.parentId);
                    }
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
                      updateNode(selectedNode.id, {
                        days: Math.max(1, Number(e.target.value)),
                      })
                    }
                    style={{ width: 80 }}
                  />
                  <select
                    className="input"
                    value={selectedNode.config?.unit || "days"}
                    onChange={(e) =>
                      updateNode(selectedNode.id, { unit: e.target.value })
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

            {["visit_profile", "like_post"].includes(selectedNode.type) && (
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
                        updateNode(selectedNode.id, {
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
              </>
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
                        updateNode(selectedNode.id, {
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
                    campaignId={campaignId}
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
                campaignId={campaignId}
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
                    updateNode(selectedNode.id, { text: e.target.value })
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
                campaignId={campaignId}
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
                      updateNode(selectedNode.id, { subject: e.target.value })
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
                      updateNode(selectedNode.id, { body: e.target.value })
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
                    updateNode(selectedNode.id, { tag: e.target.value })
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
                      updateNode(selectedNode.id, { field: e.target.value })
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
                      updateNode(selectedNode.id, { value: e.target.value })
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
                onClick={() => deleteNode(selectedNode.id)}
              >
                Remove Step
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, fontSize: 12 }}
                onClick={() => saveSequence(nodes, { advanceSetup: false })}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Persona Tab ───────────────────────────────────────────────
function PersonaTab({
  campaignId,
  campaign,
  agents,
  onSaved,
  toast,
  isSetup = false,
}) {
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
            {saving
              ? "Saving…"
              : isSetup
                ? "Save & Continue to Settings →"
                : "Save Persona"}
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
  if (diff < 3600)
    return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) === 1 ? "" : "s"} ago`;
  if (diff < 86400)
    return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) === 1 ? "" : "s"} ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) === 1 ? "" : "s"} ago`;
}

function LeadAvatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const hue =
    [...(name || "")].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        flexShrink: 0,
        background: `hsl(${hue},40%,45%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        color: "#fff",
      }}
    >
      {initials}
    </div>
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
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Past Actions
        </div>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th
                style={{
                  padding: "8px 18px",
                  textAlign: "left",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  width: 160,
                }}
              >
                Time
              </th>
              <th
                style={{
                  padding: "8px 18px",
                  textAlign: "left",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                }}
              >
                Past Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {actLoading ? (
              Array.from({ length: ACT_LIMIT }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 18px" }}>
                    <Sk w={90} h={12} r={4} />
                  </td>
                  <td style={{ padding: "12px 18px" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Sk w={28} h={28} r="50%" />
                      <Sk w={260} h={12} r={4} />
                    </div>
                  </td>
                </tr>
              ))
            ) : !actData?.items?.length ? (
              <tr>
                <td
                  colSpan={2}
                  style={{
                    padding: "32px 18px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  No actions yet.
                </td>
              </tr>
            ) : (
              actData.items.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td
                    style={{
                      padding: "12px 18px",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {timeAgo(item.timestamp)}
                  </td>
                  <td style={{ padding: "12px 18px" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <LeadAvatar name={item.name} />
                      <span>
                        {item.action}{" "}
                        {item.linkedinUrl ? (
                          <a
                            href={item.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--accent)",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            {item.name}
                          </a>
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              padding: "10px 18px",
              borderTop: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <span>
              {(actPage - 1) * ACT_LIMIT + 1}–
              {Math.min(actPage * ACT_LIMIT, actData.total)} of{" "}
              {actData.total.toLocaleString()} items
            </span>
            <button
              className="btn-ghost"
              style={{ padding: "3px 8px", fontSize: 12 }}
              disabled={actPage === 1}
              onClick={() => setActPage((p) => p - 1)}
            >
              ‹
            </button>
            {Array.from(
              { length: Math.min(5, Math.ceil(actData.total / ACT_LIMIT)) },
              (_, i) => i + 1,
            ).map((p) => (
              <button
                key={p}
                className={`btn-ghost${actPage === p ? " active" : ""}`}
                style={{
                  padding: "3px 8px",
                  fontSize: 12,
                  fontWeight: actPage === p ? 600 : 400,
                }}
                onClick={() => setActPage(p)}
              >
                {p}
              </button>
            ))}
            {Math.ceil(actData.total / ACT_LIMIT) > 5 && <span>…</span>}
            <button
              className="btn-ghost"
              style={{ padding: "3px 8px", fontSize: 12 }}
              disabled={actPage * ACT_LIMIT >= actData.total}
              onClick={() => setActPage((p) => p + 1)}
            >
              ›
            </button>
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

const TIMEZONES = (
  typeof Intl.supportedValuesOf === "function"
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

// Delay range (whole minutes) between connection requests — randomized
// between each send. Mirrors backend SENDING_DELAY_PRESETS
// (backend/src/routes/campaigns.js) exactly on min/max; the backend never
// needs the label/description, it only reads settings.sendingDelay.{min,max}.
const SENDING_DELAY_PRESETS = {
  warmup: {
    label: "Warm-up",
    min: 30,
    max: 60,
    description:
      "Slowest pace — best for brand-new or recently restricted LinkedIn accounts.",
  },
  normal: {
    label: "Normal",
    min: 15,
    max: 20,
    description: "Balanced default for established accounts in good standing.",
  },
  cautious: {
    label: "Cautious",
    min: 20,
    max: 35,
    description:
      "Extra safety margin above Normal, without going as slow as Warm-up.",
  },
};
const DEFAULT_SENDING_DELAY = {
  mode: "normal",
  min: SENDING_DELAY_PRESETS.normal.min,
  max: SENDING_DELAY_PRESETS.normal.max,
};

// Shared control for the connection-request delay range — preset pills
// (Warm-up / Normal / Cautious) plus a Custom min/max override. Used by both
// the ongoing campaign Settings tab and the campaign-creation wizard so the
// two can't drift from each other.
function SendingDelayFields({ value, onChange }) {
  const v = value || DEFAULT_SENDING_DELAY;
  const mode = v.mode || "custom";
  const activePreset = SENDING_DELAY_PRESETS[mode];

  function selectPreset(key) {
    const preset = SENDING_DELAY_PRESETS[key];
    onChange({ mode: key, min: preset.min, max: preset.max });
  }

  function setMin(raw) {
    const min = Math.max(1, Number(raw) || 1);
    onChange({ mode: "custom", min, max: Math.max(min, v.max ?? min) });
  }

  function setMax(raw) {
    const max = Math.max(1, Number(raw) || 1);
    onChange({ mode: "custom", min: Math.min(v.min ?? max, max), max });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(SENDING_DELAY_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            className={`msg-toolbar-btn${mode === key ? " active" : ""}`}
            onClick={() => selectPreset(key)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`msg-toolbar-btn${mode === "custom" ? " active" : ""}`}
          onClick={() => onChange({ ...v, mode: "custom" })}
        >
          Custom
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        {activePreset?.description ||
          "Custom delay range between connection requests."}
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="input-label">Min minutes</label>
          <input
            type="number"
            className="input"
            min={1}
            value={v.min ?? DEFAULT_SENDING_DELAY.min}
            onChange={(e) => setMin(e.target.value)}
          />
        </div>
        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="input-label">Max minutes</label>
          <input
            type="number"
            className="input"
            min={1}
            value={v.max ?? DEFAULT_SENDING_DELAY.max}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

const FREQUENCY_ITEMS = [
  {
    key: "messages",
    label: "Messages",
    rangeLabel: "Send message limit (per account)",
    min: 1,
    max: 100,
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
    rangeLabel: "InMail limit (per account)",
    min: 1,
    max: 50,
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
    rangeLabel: "Connection request limit (per account)",
    min: 1,
    max: 50,
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
    rangeLabel: "AI comment limit (per account)",
    min: 1,
    max: 100,
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
    rangeLabel: "Like post limit (per account)",
    min: 1,
    max: 100,
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
    rangeLabel: "Profile visit limit (per account)",
    min: 1,
    max: 100,
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
    rangeLabel: "Follow lead limit (per account)",
    min: 1,
    max: 100,
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

function SettingsTab({
  campaign,
  linkedinAccounts,
  onSaved,
  toast,
  isSetup = false,
}) {
  const [form, setForm] = useState({
    agentId: campaign.settings?.agentId || "",
    timezone: campaign.settings?.timezone || "Europe/London",
  });
  const [deleting, setDeleting] = useState(false);
  const [subTab, setSubTab] = useState("accounts");

  // ── Accounts to use ──────────────────────────────────────────
  const [selectedAccountId, setSelectedAccountId] = useState(
    campaign.settings?.linkedinAccountId || "",
  );
  const [savingAccount, setSavingAccount] = useState(false);
  // Active-campaign count per account, for the "N Active Campaigns" badge —
  // fetched once since it spans campaigns beyond this one.
  const [accountCampaignCounts, setAccountCampaignCounts] = useState({});
  useEffect(() => {
    campaignsApi
      .list()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const counts = {};
        for (const c of list) {
          if (c.status !== "active") continue;
          const accId = c.settings?.linkedinAccountId;
          if (!accId) continue;
          counts[accId] = (counts[accId] || 0) + 1;
        }
        setAccountCampaignCounts(counts);
      })
      .catch(() => {});
  }, []);

  async function handleSaveAccount() {
    setSavingAccount(true);
    try {
      const acc = linkedinAccounts.find((a) => a.id === selectedAccountId);
      const updated = await campaignsApi.update(campaign.id, {
        settings: {
          ...campaign.settings,
          linkedinAccountId: selectedAccountId,
          linkedinAccountName: acc?.name || acc?.username || "",
        },
      });
      onSaved(updated);
      toast?.("Accounts saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save accounts", "danger");
    } finally {
      setSavingAccount(false);
    }
  }

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

  const [sendingDelay, setSendingDelay] = useState(
    campaign.settings?.sendingDelay || DEFAULT_SENDING_DELAY,
  );
  const [savingDelay, setSavingDelay] = useState(false);

  async function handleSaveSendingDelay() {
    setSavingDelay(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: { ...campaign.settings, sendingDelay },
      });
      onSaved(updated);
      toast?.("Sending speed saved", "success");
    } catch (err) {
      toast?.(err.message || "Could not save sending speed", "danger");
    } finally {
      setSavingDelay(false);
    }
  }

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

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  async function handleDelete() {
    setConfirmDeleteOpen(false);
    setDeleting(true);
    try {
      await campaignsApi.delete(campaign.id);
      window.location.href = "/campaigns";
    } catch (err) {
      toast?.(err.message || "Could not delete campaign", "danger");
      setDeleting(false);
    }
  }

  const SETTINGS_SUBTABS = [
    { key: "accounts", label: "Accounts" },
    { key: "schedule", label: "Schedule" },
    { key: "limits", label: "Limits" },
    { key: "danger", label: "Danger Zone" },
  ];

  return (
    <div style={{ maxWidth: subTab === "limits" ? "100%" : 640 }}>
      <div className="settings-subtabs">
        {SETTINGS_SUBTABS.map((t) => (
          <button
            key={t.key}
            className={`settings-subtab${subTab === t.key ? " active" : ""}${t.key === "danger" ? " danger" : ""}`}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {subTab === "accounts" && (
          <div className="card">
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <h3 style={{ fontWeight: 700, margin: 0 }}>Accounts to use</h3>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveAccount}
                disabled={savingAccount}
              >
                {savingAccount ? "Saving…" : "Save"}
              </button>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 18,
              }}
            >
              Select LinkedIn accounts to send messages from this campaign
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                Available Accounts
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {selectedAccountId ? "1 selected" : "0 selected"}
              </span>
            </div>

            {linkedinAccounts.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  padding: "14px 0",
                }}
              >
                No accounts connected — add one in Settings → LinkedIn Accounts.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {linkedinAccounts.map((acc) => {
                  const isChecked = selectedAccountId === acc.id;
                  const status = (
                    acc.connection_status ||
                    acc.status ||
                    ""
                  ).toLowerCase();
                  const isActive =
                    status === "ok" ||
                    status === "connected" ||
                    status === "active" ||
                    !status;
                  const type = (
                    acc.type ||
                    acc.plan ||
                    acc.subscription ||
                    ""
                  ).toLowerCase();
                  const planLabel =
                    type.includes("premium") || type.includes("sales")
                      ? "Premium"
                      : "Free";
                  const activeCount = accountCampaignCounts[acc.id] || 0;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `1.5px solid ${isChecked ? "var(--signal)" : "var(--border)"}`,
                        cursor: "pointer",
                        transition: "border-color 0.1s",
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          border: `2px solid ${isChecked ? "var(--signal)" : "var(--border-2)"}`,
                          background: isChecked
                            ? "var(--signal)"
                            : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isChecked && (
                          <svg
                            viewBox="0 0 12 12"
                            fill="none"
                            style={{ width: 10, height: 10 }}
                          >
                            <polyline
                              points="2,6 5,9 10,3"
                              stroke="#fff"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      {acc.picture_url ? (
                        <img
                          src={acc.picture_url}
                          alt={acc.name || acc.username || "LinkedIn account"}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background:
                              "linear-gradient(135deg, #0a66c2, #0077b5)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {(acc.name || acc.username || "L")[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {acc.name || acc.username || acc.id}
                          </span>
                          <span className="badge badge-muted">{planLabel}</span>
                          {activeCount > 0 && (
                            <span
                              className="badge"
                              style={{
                                background: "var(--text-primary)",
                                color: "var(--surface)",
                              }}
                            >
                              {activeCount} Active Campaign
                              {activeCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-muted)",
                            marginTop: 2,
                          }}
                        >
                          {isActive ? "Active" : "Error"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {subTab === "schedule" && (
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Schedule</h3>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 16,
              }}
            >
              Set which days and hours your campaign is active. All times below
              are in the selected timezone.
            </p>

            {/* Timezone — the schedule hours are interpreted in this zone */}
            <div className="input-group">
              <label className="input-label">Timezone</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
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
                    style={{
                      fontSize: 13,
                      fontWeight: row.enabled ? 600 : 400,
                    }}
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
                    style={{
                      borderTop: "1px solid var(--border)",
                      width: "100%",
                    }}
                  />

                  {/* Time range */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
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
        )}

        {subTab === "limits" && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 20,
            }}
          >
            <div className="card" style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 20, height: 20, flexShrink: 0 }}
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <h3 style={{ fontWeight: 700, margin: 0 }}>Limit ranges</h3>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveFrequency}
                  disabled={savingFrequency}
                >
                  {savingFrequency ? "Saving…" : "Save"}
                </button>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 26,
                }}
              >
                Set daily limits for your LinkedIn activities to maintain a
                natural profile behavior. These limits apply per account.
              </p>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 24 }}
              >
                {FREQUENCY_ITEMS.map(({ key, label, rangeLabel, min, max }) => {
                  const value = frequency[key] ?? DEFAULT_FREQUENCY[key];
                  const pct = ((value - min) / (max - min)) * 100;
                  return (
                    <div key={key}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {rangeLabel || label}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>
                          {value}
                        </span>
                      </div>
                      <input
                        type="range"
                        className="range-slider"
                        min={min}
                        max={max}
                        value={value}
                        onChange={(e) =>
                          setFrequency((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value),
                          }))
                        }
                        style={{
                          background: `linear-gradient(to right, var(--text-primary, #111827) 0%, var(--text-primary, #111827) ${pct}%, var(--border-2, #e5e7eb) ${pct}%, var(--border-2, #e5e7eb) 100%)`,
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 4,
                        }}
                      >
                        <span>{min}</span>
                        <span>{max}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card" style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 20, height: 20, flexShrink: 0 }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <h3 style={{ fontWeight: 700, margin: 0 }}>Sending speed</h3>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveSendingDelay}
                  disabled={savingDelay}
                >
                  {savingDelay ? "Saving…" : "Save"}
                </button>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 20,
                }}
              >
                How long to wait between connection requests. A randomized delay
                inside this range is used each time, instead of a fixed
                interval.
              </p>
              <SendingDelayFields
                value={sendingDelay}
                onChange={setSendingDelay}
              />
            </div>
          </div>
        )}

        {subTab === "danger" && (
          <div className="card">
            <h3
              style={{
                fontWeight: 700,
                marginBottom: 12,
                color: "var(--danger)",
              }}
            >
              Danger Zone
            </h3>
            <button
              className="btn btn-danger"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Campaign"}
            </button>
          </div>
        )}
      </div>

      {confirmDeleteOpen && (
        <div
          className="modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setConfirmDeleteOpen(false)
          }
        >
          <div className="modal-box animate-fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Campaign</h2>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => setConfirmDeleteOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                Delete campaign "{campaign.name}"? This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AccountsSetupTab (wizard step 2) ─────────────────────────
function AccountsSetupTab({
  campaignId,
  campaign,
  linkedinAccounts,
  agents,
  onSaved,
  toast,
}) {
  const [accountId, setAccountId] = useState(
    campaign.settings?.linkedinAccountId || "",
  );
  const [agentId, setAgentId] = useState(campaign.settings?.agentId || "");
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (!accountId) {
      toast?.("Please select a LinkedIn account", "danger");
      return;
    }
    setSaving(true);
    try {
      const acc = linkedinAccounts.find((a) => a.id === accountId);
      const updated = await campaignsApi.update(campaignId, {
        settings: {
          ...campaign.settings,
          linkedinAccountId: accountId,
          linkedinAccountName: acc?.name || acc?.email || "",
          agentId: agentId || campaign.settings?.agentId || "",
        },
      });
      onSaved(updated);
    } catch (err) {
      toast?.(err.message || "Could not save", "danger");
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        LinkedIn Account
      </h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 32 }}>
        Select the LinkedIn account to use for outreach on this campaign.
      </p>

      {linkedinAccounts.length === 0 ? (
        <div
          style={{
            padding: "32px 0",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 10 }}>◎</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            No LinkedIn accounts connected
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            Connect a LinkedIn account in Settings → LinkedIn Accounts first.
          </div>
          <a href="/settings" className="btn btn-secondary btn-sm">
            Go to Settings →
          </a>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 32,
          }}
        >
          {linkedinAccounts.map((acc) => (
            <div
              key={acc.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                border: `1px solid ${accountId === acc.id ? "var(--signal)" : "var(--border)"}`,
                borderRadius: 10,
                cursor: "pointer",
                background:
                  accountId === acc.id ? "var(--surface-2)" : "var(--surface)",
                transition: "all 0.15s",
              }}
              onClick={() => setAccountId(acc.id)}
            >
              {acc.picture_url ? (
                <img
                  src={acc.picture_url}
                  alt={acc.name || acc.email || "LinkedIn account"}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {(acc.name || acc.email || "?")[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {acc.name || acc.email || acc.id}
                </div>
                {acc.email && acc.name && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {acc.email}
                  </div>
                )}
              </div>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2px solid ${accountId === acc.id ? "var(--signal)" : "var(--border)"}`,
                  background:
                    accountId === acc.id ? "var(--signal)" : "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {accountId === acc.id && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#fff",
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {agents.length > 0 && (
        <div className="input-group" style={{ marginBottom: 32 }}>
          <label className="input-label">AI Assistant (optional)</label>
          <select
            className="input"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            <option value="">No agent — I'll reply manually</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        className="btn btn-primary"
        disabled={!accountId || saving}
        onClick={handleNext}
      >
        {saving ? "Saving…" : "Next: Sequences →"}
      </button>
    </div>
  );
}

// ── ScheduleSetupTab (wizard step 4) ─────────────────────────
function ScheduleSetupTab({ campaign, onSaved, toast }) {
  const [schedule, setSchedule] = useState(
    campaign.settings?.schedule || DEFAULT_SCHEDULE,
  );
  const [timezone, setTimezone] = useState(
    campaign.settings?.timezone || "Europe/London",
  );
  const [frequency, setFrequency] = useState({
    ...DEFAULT_FREQUENCY,
    ...(campaign.settings?.frequency || {}),
    connectionRequests:
      campaign.settings?.frequency?.connectionRequests ??
      campaign.settings?.dailyConnectionLimit ??
      DEFAULT_FREQUENCY.connectionRequests,
    messages:
      campaign.settings?.frequency?.messages ??
      campaign.settings?.dailyMessageLimit ??
      DEFAULT_FREQUENCY.messages,
  });
  const [sendingDelay, setSendingDelay] = useState(
    campaign.settings?.sendingDelay || DEFAULT_SENDING_DELAY,
  );
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingFrequency, setSavingFrequency] = useState(false);
  const [savingDelay, setSavingDelay] = useState(false);

  const [now, setNow] = useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  let tzClock = "";
  try {
    tzClock = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
  } catch {}

  function updateDay(idx, patch) {
    setSchedule((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }

  function adjustFreq(key, delta) {
    setFrequency((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] ?? 0) + delta),
    }));
  }

  async function handleFinish() {
    setSaving(true);
    try {
      // "Launch Campaign" should actually launch it — save the schedule
      // and activate the campaign in one step, same as the regular "Run
      // Campaign" button does post-setup. runCampaignInvites checks
      // isWithinSchedule itself, so this is a no-op until the configured
      // window opens rather than sending immediately.
      const updated = await campaignsApi.update(campaign.id, {
        status: "active",
        settings: {
          ...campaign.settings,
          timezone,
          schedule,
          frequency,
          dailyConnectionLimit: frequency.connectionRequests,
          dailyMessageLimit: frequency.messages,
          sendingDelay,
        },
      });
      campaignsApi.sendInvites(campaign.id).catch(() => {});
      toast?.("Campaign launched — sending on schedule", "success");
      onSaved(updated);
    } catch (err) {
      toast?.(err.message || "Could not save schedule", "danger");
      setSaving(false);
    }
  }

  // Persists just the schedule (+ timezone) without activating the
  // campaign or leaving setup — lets the user save this section on its own
  // and keep going, same as every earlier setup step already allows.
  async function handleSaveSchedule() {
    setSavingSchedule(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: { ...campaign.settings, timezone, schedule },
      });
      toast?.("Schedule saved", "success");
      onSaved(updated, { advanceSetup: false });
    } catch (err) {
      toast?.(err.message || "Could not save schedule", "danger");
    } finally {
      setSavingSchedule(false);
    }
  }

  // Persists just the frequency limits, same as handleSaveSchedule above.
  async function handleSaveFrequency() {
    setSavingFrequency(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: {
          ...campaign.settings,
          frequency,
          dailyConnectionLimit: frequency.connectionRequests,
          dailyMessageLimit: frequency.messages,
        },
      });
      toast?.("Frequency saved", "success");
      onSaved(updated, { advanceSetup: false });
    } catch (err) {
      toast?.(err.message || "Could not save frequency", "danger");
    } finally {
      setSavingFrequency(false);
    }
  }

  // Persists just the sending delay range, same as handleSaveSchedule above.
  async function handleSaveSendingDelay() {
    setSavingDelay(true);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        settings: { ...campaign.settings, sendingDelay },
      });
      toast?.("Sending speed saved", "success");
      onSaved(updated, { advanceSetup: false });
    } catch (err) {
      toast?.(err.message || "Could not save sending speed", "danger");
    } finally {
      setSavingDelay(false);
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
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 4 }}>Schedule</h3>
        <p
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}
        >
          Set which days and hours your campaign is active. All times are in the
          selected timezone.
        </p>

        <div className="input-group">
          <label className="input-label">Timezone</label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <select
              className="input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
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
                gridTemplateColumns: "120px 56px 16px 1fr",
                alignItems: "center",
                gap: 10,
                opacity: row.enabled ? 1 : 0.45,
              }}
            >
              <span
                style={{ fontSize: 13, fontWeight: row.enabled ? 600 : 400 }}
              >
                {row.day}
              </span>
              <label className="toggle" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) =>
                    updateDay(idx, { enabled: e.target.checked })
                  }
                />
                <span className="toggle-track" />
              </label>
              <span
                style={{ borderTop: "1px solid var(--border)", width: "100%" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  className="input time-picker"
                  type="time"
                  value={row.start}
                  disabled={!row.enabled}
                  onChange={(e) => updateDay(idx, { start: e.target.value })}
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
                  onChange={(e) => updateDay(idx, { end: e.target.value })}
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
            marginTop: 20,
          }}
        >
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
          >
            {savingSchedule ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 200px" }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Frequency</h3>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              Daily limits per action. Leave as default to stay within LinkedIn
              limits.
            </p>
          </div>
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
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveFrequency}
            disabled={savingFrequency}
          >
            {savingFrequency ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ flex: "0 0 200px" }}>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Sending speed</h3>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              How long to wait between connection requests. A randomized delay
              inside this range is used each time.
            </p>
          </div>
          <div style={{ flex: 1 }}>
            <SendingDelayFields
              value={sendingDelay}
              onChange={setSendingDelay}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 20,
          }}
        >
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveSendingDelay}
            disabled={savingDelay}
          >
            {savingDelay ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingBottom: 32,
        }}
      >
        <button
          className="btn btn-primary"
          style={{ fontSize: 15, padding: "10px 28px" }}
          onClick={handleFinish}
          disabled={saving}
        >
          {saving ? "Saving…" : "Launch Campaign →"}
        </button>
      </div>
    </div>
  );
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

function ConnectionNoteEditor({
  node,
  updateNode,
  sampleLead,
  campaignId,
  toast,
}) {
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef(null);
  const { vars: signalVars } = useSignalVars(campaignId, sampleLead?.id);

  const noteText = node.config?.note || "";
  const charsLeft = NOTE_CHAR_LIMIT - noteText.length;

  function insertVar(v) {
    const ta = textareaRef.current;
    if (!ta) {
      updateNode(node.id, { note: noteText + v });
      setShowVarMenu(false);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = noteText.slice(0, start) + v + noteText.slice(end);
    if (next.length > NOTE_CHAR_LIMIT) return;
    updateNode(node.id, { note: next });
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
      updateNode(node.id, { note: truncated });
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
      const val = resolveVarValue(v, sampleLead, signalVars);
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
            onChange={(e) => updateNode(node.id, { note: e.target.value })}
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
  { group: "Signal" },
  { label: "Signal Type", value: "{signalType}", preview: "Job Change" },
  {
    label: "Signal Summary",
    value: "{signalSummary}",
    preview: "High intent: job change into VP Sales, ICP fit 85%.",
  },
  {
    label: "Trigger Reason",
    value: "{triggerReason}",
    preview: "changed jobs to VP Sales",
  },
  {
    label: "Recent Post Topic",
    value: "{recentPostTopic}",
    preview: "outbound sales tooling",
  },
  {
    label: "Pain Point",
    value: "{painPoint}",
    preview: "manual lead research",
  },
  {
    label: "Company Signal",
    value: "{companySignal}",
    preview: "raised a Series A",
  },
  {
    label: "Source URL",
    value: "{sourceUrl}",
    preview: "https://linkedin.com/in/…",
  },
];

// Signal vars come from signal_scores (DB), not the lead object already in
// memory, so they need a server round-trip — see useSignalVars() below.
// Falls back to null so resolveVarValue() can fall through to the static
// CONTACT_VARS preview string while the fetch is in flight or absent.
const SIGNAL_VAR_KEYS = {
  "{signalType}": "signalType",
  "{signalSummary}": "signalSummary",
  "{triggerReason}": "triggerReason",
  "{recentPostTopic}": "recentPostTopic",
  "{painPoint}": "painPoint",
  "{companySignal}": "companySignal",
  "{sourceUrl}": "sourceUrl",
};

// Fetches the 7 signal-based variables for the current preview lead — the
// exact same resolver (buildSignalVars) a real send uses, via
// GET /campaigns/:id/leads/:leadId/preview-vars, so the preview can't lie
// about what will actually be sent. Refetches when the sample lead changes.
function useSignalVars(campaignId, leadId) {
  const [vars, setVars] = useState(null);
  const [hasSignalContext, setHasSignalContext] = useState(false);

  const load = React.useCallback(() => {
    if (!campaignId || !leadId) {
      setVars(null);
      setHasSignalContext(false);
      return;
    }
    campaignsApi
      .previewLeadVars(campaignId, leadId)
      .then((data) => {
        const { hasSignalContext: hsc, ...rest } = data || {};
        setVars(rest);
        setHasSignalContext(!!hsc);
      })
      .catch(() => {
        setVars(null);
        setHasSignalContext(false);
      });
  }, [campaignId, leadId]);

  useEffect(() => {
    load();
  }, [load]);

  return { vars, hasSignalContext, refetch: load };
}

// Resolves one CONTACT_VARS entry to a real value: lead-derived vars first
// (leadVarValue), then fetched signal vars, then the static preview string.
function resolveVarValue(v, sampleLead, signalVars) {
  const contactVal = leadVarValue(v.value, sampleLead);
  if (contactVal) return contactVal;
  const signalKey = SIGNAL_VAR_KEYS[v.value];
  if (signalKey && signalVars && signalVars[signalKey])
    return signalVars[signalKey];
  return v.preview;
}

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
  campaignId,
  toast,
}) {
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const { vars: signalVars } = useSignalVars(campaignId, sampleLead?.id);

  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const current = node.config?.attachments || [];
        updateNode(node.id, {
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
    updateNode(node.id, { attachments });
  }

  const config = node.config || {};
  const msgText = config.text || "";
  const isEmpty = !msgText.trim();

  function insertVar(v) {
    const ta = textareaRef.current;
    if (!ta) {
      updateNode(node.id, { text: msgText + v });
      setShowVarMenu(false);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = msgText.slice(0, start) + v + msgText.slice(end);
    updateNode(node.id, { text: next });
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
      updateNode(node.id, { text: result.message });
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
      const val = resolveVarValue(v, sampleLead, signalVars);
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
            onChange={(e) => updateNode(node.id, { text: e.target.value })}
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
          onChange={(e) => updateNode(node.id, { condition: e.target.value })}
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
