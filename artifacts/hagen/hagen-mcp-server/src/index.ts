#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MCP_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(MCP_ROOT, "..");

// Load state configuration
function loadState() {
  const statePath = path.join(MCP_ROOT, "hagen-state.json");
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return { current_phase: "step_1", phases: {}, constraints: {} };
  }
}

// Load ground truth document
function loadGroundTruth(): string {
  const groundTruthPath = path.join(PROJECT_ROOT, "planning_docs/hagen-ground-truth.md");
  try {
    return fs.readFileSync(groundTruthPath, "utf-8");
  } catch {
    return "Ground truth document not found at planning_docs/hagen-ground-truth.md";
  }
}

// Get training data statistics
function getTrainingStats() {
  const goldStandardPath = path.join(PROJECT_ROOT, "datasets/fine-tuning/gold_standard.jsonl");
  try {
    const content = fs.readFileSync(goldStandardPath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());
    const entries = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    // Count TikTok videos: check URL or known video sources
    const tiktokCount = entries.filter((e: any) =>
      e.url?.includes("tiktok.com") ||
      e.source?.includes("fine-tuning") ||
      e.source?.includes("legacy-review") ||
      e.source?.includes("question-battery")
    ).length;
    // Count Simpsons text entries
    const simpsonsCount = entries.filter((e: any) =>
      e.source?.toLowerCase().includes("simpsons")
    ).length;
    const otherCount = entries.length - tiktokCount - simpsonsCount;

    const stats = fs.statSync(goldStandardPath);

    return {
      total_entries: entries.length,
      tiktok_clips: tiktokCount,
      simpsons_entries: simpsonsCount,
      other_entries: otherCount,
      file_size_kb: Math.round(stats.size / 1024),
      last_modified: stats.mtime.toISOString()
    };
  } catch (e) {
    return { error: `Could not read training data: ${e}` };
  }
}

// Validate if a task aligns with current phase
function validateTask(taskDescription: string, state: any) {
  const task = taskDescription.toLowerCase();
  const currentPhase = state.phases[state.current_phase];

  // Keywords that indicate Step 2 work
  const step2Keywords = [
    "brand fingerprint", "brand matching", "matching engine",
    "concept generation", "generate concept", "create concept",
    "relationality", "brand profile"
  ];

  // Keywords that indicate Step 1 work
  const step1Keywords = [
    "humor model", "humor analysis", "fine-tuning", "training data",
    "replicability", "analyze-rate", "reliability", "gold_standard"
  ];

  const isStep2Work = step2Keywords.some(kw => task.includes(kw));
  const isStep1Work = step1Keywords.some(kw => task.includes(kw));

  if (isStep2Work && state.current_phase === "step_1") {
    return {
      allowed: false,
      reason: "This is Step 2 work (brand/matching features)",
      current_phase: currentPhase?.name || state.current_phase,
      suggestion: `Current focus is Step 1: ${currentPhase?.goal}. Focus on: ${currentPhase?.focus?.join(", ")}`
    };
  }

  if (isStep1Work || !isStep2Work) {
    return {
      allowed: true,
      reason: "This aligns with current phase focus",
      current_phase: currentPhase?.name || state.current_phase,
      suggestion: "Proceed with this work"
    };
  }

  return {
    allowed: true,
    reason: "Task seems general, proceeding",
    current_phase: currentPhase?.name || state.current_phase,
    suggestion: "If this involves brand features, consider if Step 1 reliability goals are met first"
  };
}

// Create the MCP server
const server = new Server(
  {
    name: "hagen",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "hagen_current_phase",
      description: "Returns current project phase, allowed focus areas, and blocked work. Call this at the start of any session.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "hagen_get_ground_truth",
      description: "Returns the full ground truth document with verified project state. Use when you need detailed context about what Hagen is and does.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "hagen_training_stats",
      description: "Returns live statistics about training data (entry counts, last modified). Use to understand current dataset size.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "hagen_validate_task",
      description: "Checks if proposed work aligns with current project phase. Use before starting new work to ensure focus.",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_description: {
            type: "string",
            description: "Description of the work you plan to do",
          },
        },
        required: ["task_description"],
      },
    },
    {
      name: "hagen_constraints",
      description: "Returns what Hagen does and does NOT do. Use to avoid building wrong features.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "hagen_reliability_status",
      description: "Returns current reliability estimates for each model component.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "hagen_set_phase",
      description: "Updates the current project phase. Use when transitioning between phases.",
      inputSchema: {
        type: "object" as const,
        properties: {
          phase: {
            type: "string",
            description: "Phase to set: step_1, step_2a, or step_2b",
            enum: ["step_1", "step_2a", "step_2b"],
          },
        },
        required: ["phase"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const state = loadState();

  switch (name) {
    case "hagen_current_phase": {
      const currentPhase = state.phases[state.current_phase];
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              phase_id: state.current_phase,
              phase_name: currentPhase?.name,
              focus: currentPhase?.focus,
              blocked: currentPhase?.blocked,
              goal: currentPhase?.goal,
              last_updated: state.last_updated,
            }, null, 2),
          },
        ],
      };
    }

    case "hagen_get_ground_truth": {
      return {
        content: [
          {
            type: "text" as const,
            text: loadGroundTruth(),
          },
        ],
      };
    }

    case "hagen_training_stats": {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(getTrainingStats(), null, 2),
          },
        ],
      };
    }

    case "hagen_validate_task": {
      const taskDescription = (args as { task_description?: string })?.task_description || "";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(validateTask(taskDescription, state), null, 2),
          },
        ],
      };
    }

    case "hagen_constraints": {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              hagen_does: state.constraints.does,
              hagen_does_not: state.constraints.does_not,
              key_principle: "Hagen ANALYZES content, it does NOT generate creative content",
            }, null, 2),
          },
        ],
      };
    }

    case "hagen_reliability_status": {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(state.reliability_targets, null, 2),
          },
        ],
      };
    }

    case "hagen_set_phase": {
      const newPhase = (args as { phase?: string })?.phase;
      if (!newPhase || !state.phases[newPhase]) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Invalid phase: ${newPhase}. Valid phases: step_1, step_2a, step_2b`,
              }),
            },
          ],
        };
      }

      // Update state file
      state.current_phase = newPhase;
      state.last_updated = new Date().toISOString().split("T")[0];
      const statePath = path.join(MCP_ROOT, "hagen-state.json");
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              new_phase: newPhase,
              phase_name: state.phases[newPhase].name,
              focus: state.phases[newPhase].focus,
              goal: state.phases[newPhase].goal,
            }, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hagen MCP server running");
}

main().catch(console.error);
