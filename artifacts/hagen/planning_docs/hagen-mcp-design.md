# Hagen MCP Server Design

**Purpose:** A custom MCP server that provides focused context and tools for Hagen development, narrowing Claude's focus to current priorities.

---

## 1. Why Build This

| Problem | MCP Solution |
|---------|--------------|
| Claude makes assumptions about project | `hagen_get_ground_truth` returns verified facts only |
| Work drifts from current phase | `hagen_current_phase` enforces focus |
| Training data stats unknown | `hagen_training_stats` returns live counts |
| Model reliability unclear | `hagen_reliability_check` returns recent results |

---

## 2. Proposed Tools

### Context Tools (Read-Only)

```typescript
// Returns current project phase and allowed scope
hagen_current_phase()
// → { phase: "Step 1", focus: ["humor_model", "replicability", "analyze_rate_v1"],
//     blocked: ["brand_features", "matching"],
//     goal: "High reliability before brand integration" }

// Returns ground truth document content
hagen_get_ground_truth()
// → Full content of hagen-ground-truth.md

// Returns what Hagen IS and IS NOT
hagen_constraints()
// → { does: ["analyze videos", "explain humor", "match to brands"],
//     does_not: ["generate concepts", "predict virality", "rewrite scripts"] }
```

### Data Tools

```typescript
// Returns current training data statistics
hagen_training_stats()
// → { tiktok_clips: 270, simpsons_entries: 450, total: 720,
//     replicability_entries: 60, mechanisms_covered: 28, mechanisms_sparse: 11 }

// Returns recent model outputs for review
hagen_recent_analyses(count: number)
// → Last N analyses from gold_standard.jsonl with metadata

// Returns known failure modes
hagen_failure_modes()
// → ["audio_visual_disconnect", "editing_as_joke", "layered_jokes", "abstract_inference"]
```

### Workflow Tools

```typescript
// Checks if proposed work aligns with current phase
hagen_validate_task(task_description: string)
// → { allowed: boolean, reason: string,
//     suggestion: "This is Step 2 work. Current focus is Step 1." }

// Returns what to work on next
hagen_next_priority()
// → { task: "Improve humor model reliability",
//     blocker: "Not enough training data + audio-visual understanding",
//     suggested_actions: ["Add more TikTok clips", "Investigate audio analysis"] }

// Logs work done for tracking
hagen_log_progress(work_done: string, outcome: string)
// → Appends to planning_docs/progress-log.md
```

---

## 3. Implementation Sketch

```typescript
// hagen-mcp-server/src/index.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = process.env.HAGEN_PROJECT_ROOT || process.cwd();

const server = new Server({
  name: "hagen",
  version: "1.0.0",
}, {
  capabilities: { tools: {} }
});

// Tool: Get current phase
server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "hagen_current_phase":
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            phase: "Step 1",
            focus: ["humor_model", "replicability_model", "analyze_rate_v1"],
            blocked: ["brand_fingerprint", "matching_engine", "concept_generation"],
            goal: "High reliability: matches human judgment, consistent, low edit rate"
          })
        }]
      };

    case "hagen_training_stats":
      const goldStandard = fs.readFileSync(
        path.join(PROJECT_ROOT, "datasets/fine-tuning/gold_standard.jsonl"),
        "utf-8"
      );
      const lines = goldStandard.trim().split("\n");
      const entries = lines.map(l => JSON.parse(l));

      const tiktokCount = entries.filter(e => e.source?.includes("fine-tuning")).length;
      const simpsonsCount = entries.filter(e => e.source?.includes("simpsons")).length;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            total_entries: entries.length,
            tiktok_clips: tiktokCount,
            simpsons_entries: simpsonsCount,
            last_updated: fs.statSync(
              path.join(PROJECT_ROOT, "datasets/fine-tuning/gold_standard.jsonl")
            ).mtime
          })
        }]
      };

    case "hagen_get_ground_truth":
      const groundTruth = fs.readFileSync(
        path.join(PROJECT_ROOT, "planning_docs/hagen-ground-truth.md"),
        "utf-8"
      );
      return {
        content: [{ type: "text", text: groundTruth }]
      };

    case "hagen_validate_task":
      const taskDesc = args?.task_description?.toLowerCase() || "";
      const step2Keywords = ["brand", "fingerprint", "matching", "generate", "concept"];
      const isStep2Work = step2Keywords.some(kw => taskDesc.includes(kw));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            allowed: !isStep2Work,
            reason: isStep2Work
              ? "This sounds like Step 2 work (brand/matching features)"
              : "This aligns with Step 1 (model reliability)",
            current_phase: "Step 1: Model Reliability",
            suggestion: isStep2Work
              ? "Focus on humor model, replicability, or analyze-rate-v1 first"
              : "Proceed with this work"
          })
        }]
      };

    case "hagen_constraints":
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            hagen_does: [
              "Analyze existing TikTok videos",
              "Explain WHY content is funny",
              "Match videos to brand profiles",
              "Guide recreation (not rewrite)"
            ],
            hagen_does_not: [
              "Generate new concepts",
              "Predict view counts",
              "Chase trends",
              "Rewrite scripts creatively"
            ],
            key_principle: "Hagen ANALYZES, it does NOT generate creative content"
          })
        }]
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// List available tools
server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "hagen_current_phase",
      description: "Returns current project phase, allowed focus areas, and blocked work",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "hagen_training_stats",
      description: "Returns live statistics about training data (counts, last update)",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "hagen_get_ground_truth",
      description: "Returns the full ground truth document with verified project state",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "hagen_validate_task",
      description: "Checks if proposed work aligns with current phase",
      inputSchema: {
        type: "object",
        properties: {
          task_description: { type: "string", description: "Description of work to validate" }
        },
        required: ["task_description"]
      }
    },
    {
      name: "hagen_constraints",
      description: "Returns what Hagen does and does not do",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

---

## 4. Installation (Once Built)

```bash
# Build the MCP server
cd hagen-mcp-server
npm install
npm run build

# Add to Claude Code
claude mcp add hagen -- node /path/to/hagen-mcp-server/dist/index.js
```

---

## 5. Usage in Sessions

When Claude starts a session with Hagen MCP:

```
Claude: Let me check the current project phase.
[Calls hagen_current_phase]
→ Phase: Step 1, Focus: humor_model, replicability, analyze_rate_v1

User: Let's work on the brand fingerprint

Claude: Let me validate this task.
[Calls hagen_validate_task("brand fingerprint")]
→ { allowed: false, reason: "Step 2 work", suggestion: "Focus on model reliability first" }

Claude: That's Step 2 work. Current focus is Step 1 (model reliability).
Should we work on humor model improvements instead?
```

---

## 6. Future Enhancements

| Enhancement | Purpose |
|-------------|---------|
| `hagen_log_progress` | Track work done across sessions |
| `hagen_recent_analyses` | Review model outputs without reading files |
| `hagen_model_comparison` | Compare v7.B vs v7.X outputs |
| `hagen_failure_examples` | Return examples of known failure modes |
| `hagen_suggest_training_data` | Recommend what type of clips to add |

---

## 7. Configuration

The MCP could read from a `hagen-config.json`:

```json
{
  "current_phase": "step_1",
  "phase_config": {
    "step_1": {
      "focus": ["humor_model", "replicability_model", "analyze_rate_v1"],
      "blocked": ["brand_fingerprint", "matching", "concept_generation"],
      "goal": "High reliability"
    },
    "step_2a": {
      "focus": ["brand_matching", "relationality_system"],
      "blocked": ["brand_fingerprint_complexity"],
      "goal": "Simple brand matching"
    },
    "step_2b": {
      "focus": ["brand_fingerprint", "profile_analysis"],
      "blocked": ["matching_engine"],
      "goal": "Intuitive brand understanding"
    }
  }
}
```

This allows you to update the phase without modifying code.

---

## 8. Next Steps to Build

1. [ ] Create `hagen-mcp-server/` directory
2. [ ] Initialize npm package
3. [ ] Implement core tools (phase, stats, ground truth, validate)
4. [ ] Test locally
5. [ ] Add to Claude Code config
6. [ ] Iterate based on usage
