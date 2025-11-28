const scenarioSelect = document.getElementById("scenario-select");
const scenarioDescriptionEl = document.getElementById("scenario-description");

const toggleMissing = document.getElementById("toggle-missing");
const toggleConflict = document.getElementById("toggle-conflict");
const toggleTimeout = document.getElementById("toggle-timeout");
const toggleInvalid = document.getElementById("toggle-invalid");

const runTraceBtn = document.getElementById("run-trace");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const traceListEl = document.getElementById("trace-list");
const notesTextEl = document.getElementById("notes-text");

// State nodes
const stateNodes = {
  initial: document.getElementById("state-initial"),
  processing: document.getElementById("state-processing"),
  timeout: document.getElementById("state-timeout"),
  error: document.getElementById("state-error"),
  fallback: document.getElementById("state-fallback"),
  recovery: document.getElementById("state-recovery"),
  end_ok: document.getElementById("state-end-ok"),
  end_degraded: document.getElementById("state-end-degraded"),
  end_failed: document.getElementById("state-end-failed")
};

// Scenario presets
const SCENARIOS = {
  incident: {
    id: "incident",
    label: "Incident escalation assistant",
    task: "Monitor alerts, group related signals, and draft an incident summary for the on-call engineer.",
    conditions:
      "Alerts can be noisy; log streams may be delayed; ticketing system is usually available but occasionally slow.",
    rules:
      "Never close an incident without a ticket, never hide high-severity alerts, and always highlight uncertainty explicitly.",
    description:
      "Agent triages incidents from alerts, gathers context, and escalates to the on-call engineer with a summary."
  },
  customer_email: {
    id: "customer_email",
    label: "Customer follow-up agent",
    task: "Draft follow-up emails after support tickets are resolved, summarizing actions taken and next steps.",
    conditions:
      "Support notes vary in quality; CRM data may be incomplete; customers may have multiple open tickets.",
    rules:
      "Do not promise features or timelines, keep tone calm and professional, and link back to the original ticket.",
    description:
      "Agent reads support notes and CRM data, then drafts a follow-up email that explains what happened and what’s next."
  },
  data_cleanup: {
    id: "data_cleanup",
    label: "Data quality repair agent",
    task: "Scan recent records for anomalies, flag likely data issues, and generate safe, reviewable fixes.",
    conditions:
      "Source tables come from multiple pipelines; some fields are sparsely populated; schemas evolve over time.",
    rules:
      "Never hard-delete data, never infer sensitive fields, and always produce a reversible, auditable change set.",
    description:
      "Agent inspects recent data, proposes corrections, and prepares a change set for human review before applying fixes."
  }
};

function getSelectedScenario() {
  const key = scenarioSelect.value || "incident";
  return SCENARIOS[key] || SCENARIOS.incident;
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

// Summary helpers
function summaryIdle(text) {
  summaryEl.innerHTML = `
    <div class="summary-badge summary-badge-idle">
      ${text}
    </div>
  `;
}

function summaryOk(text) {
  summaryEl.innerHTML = `
    <div class="summary-badge summary-badge-ok">
      ${text}
    </div>
  `;
}

function summaryWarn(text) {
  summaryEl.innerHTML = `
    <div class="summary-badge summary-badge-warn">
      ${text}
    </div>
  `;
}

// Clear state highlights
function resetStateHighlights() {
  Object.values(stateNodes).forEach((node) => {
    node.classList.remove("state-node-active", "state-node-visited");
  });
}

// Compute scenario path based on toggles
function computeScenario({ missing, conflict, timeout, invalid }) {
  if (!missing && !conflict && !timeout && !invalid) {
    return {
      outcomeType: "normal",
      outcomeLabel: "Normal path — task completed without major failures.",
      summaryText:
        "Agent followed the happy path: it processed the task under current conditions and reached a clean end state.",
      path: ["initial", "processing", "end_ok"]
    };
  }

  if (invalid) {
    return {
      outcomeType: "failed",
      outcomeLabel: "Invalid state — agent reached an impossible or undefined state.",
      summaryText:
        "The agent transitioned into a state that should never be reachable. In real systems this often exposes design gaps, missing invariants, or unhandled edge cases.",
      path: ["initial", "processing", "error", "fallback", "end_failed"]
    };
  }

  if (timeout) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Timeout-driven fallback — task completed via degraded path.",
      summaryText:
        "Slow or unavailable dependencies forced the agent into a timeout state, then through fallback and recovery to reach a degraded but acceptable outcome.",
      path: ["initial", "timeout", "fallback", "recovery", "end_degraded"]
    };
  }

  if (missing && conflict) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Conflicting and incomplete inputs — agent relied heavily on fallback.",
      summaryText:
        "The agent detected both missing data and conflicting rules, leading to an error and heavy use of fallback / recovery logic. It reached a degraded end state that should be flagged for review.",
      path: ["initial", "error", "fallback", "recovery", "end_degraded"]
    };
  }

  if (missing) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Missing or partial data — degraded success via fallback.",
      summaryText:
        "The agent detected incomplete inputs and moved into an error branch. Fallback and recovery logic allowed it to produce a partial or caveated result instead of silently failing.",
      path: ["initial", "error", "fallback", "recovery", "end_degraded"]
    };
  }

  if (conflict) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Conflicting rules — agent resolved tension via fallback.",
      summaryText:
        "Conflicting rules or instructions pushed the agent into an error state. Fallback logic (e.g., escalation or explicit tie-breaking) allowed it to reach a degraded but consistent end state.",
      path: ["initial", "processing", "error", "fallback", "recovery", "end_degraded"]
    };
  }

  return {
    outcomeType: "failed",
    outcomeLabel: "Uncategorized failure.",
    summaryText:
      "The agent encountered a scenario that was not explicitly modeled. In practice, this would indicate a gap in the state machine design.",
    path: ["initial", "error", "end_failed"]
  };
}

// Render the state trace list
function renderTrace(path, meta) {
  const scenario = getSelectedScenario();

  const taskSnippet = scenario.task;
  const conditionsSnippet = scenario.conditions;
  const rulesSnippet = scenario.rules;

  const items = [];

  path.forEach((stateKey, index) => {
    let label;
    let detail;

    switch (stateKey) {
      case "initial":
        label = "Initial State";
        detail =
          "Agent receives the scenario task and builds an internal view of context and rules.";
        break;
      case "processing":
        label = "Next / Processing State";
        detail =
          "Agent is executing the task using the scenario’s conditions and rules.";
        break;
      case "timeout":
        label = "Timeout State";
        detail =
          "A dependency (API, database, external tool) is too slow or unresponsive, so progress is blocked.";
        break;
      case "error":
        label = "Error State";
        detail =
          "The agent detects a hard failure: missing inputs, conflicting rules, or an invalid transition.";
        break;
      case "fallback":
        label = "Fallback Handler";
        detail =
          "Fallback logic activates: retrying, switching to degraded mode, or escalating to a human.";
        break;
      case "recovery":
        label = "Recovery / Retry";
        detail =
          "With fallback applied, the agent retries the task or continues with reduced scope.";
        break;
      case "end_ok":
        label = "End State — Normal Completion";
        detail =
          "The agent finishes the task as intended, with no major drift or unresolved errors.";
        break;
      case "end_degraded":
        label = "End State — Degraded Success";
        detail =
          "The agent completes the task with known limitations (partial output, manual intervention, or degraded mode).";
        break;
      case "end_failed":
        label = "End State — Failed / Stalled";
        detail =
          "The agent cannot safely complete the task and stops. This path signals a design or architecture problem to fix.";
        break;
      default:
        label = stateKey;
        detail = "";
    }

    let extra = "";

    if (index === 0) {
      extra = `<div class="trace-extra">
        <strong>Scenario:</strong> ${scenario.label}<br />
        <strong>Task:</strong> ${taskSnippet}<br />
        <strong>Conditions:</strong> ${conditionsSnippet}<br />
        <strong>Rules:</strong> ${rulesSnippet}
      </div>`;
    }

    items.push(`
      <li>
        <div class="trace-step-label">${index + 1}. ${label}</div>
        <div class="trace-step-detail">${detail}</div>
        ${extra}
      </li>
    `);
  });

  traceListEl.innerHTML = items.join("");
}

// Highlight states on the map
function highlightPath(path) {
  resetStateHighlights();

  path.forEach((stateKey, index) => {
    const node = stateNodes[stateKey];
    if (!node) return;
    node.classList.add("state-node-visited");
    if (index === path.length - 1) {
      node.classList.add("state-node-active");
    }
  });
}

// Generate interpretation notes based on the scenario
function generateNotes(meta, toggles) {
  const scenario = getSelectedScenario();
  const pieces = [];

  pieces.push(`Scenario: ${scenario.label}.`);

  switch (meta.outcomeType) {
    case "normal":
      pieces.push(
        "This run illustrates the clean, happy-path behavior: the agent transitions from Initial → Processing → End without encountering failures."
      );
      break;
    case "degraded":
      pieces.push(
        "This run shows how the agent relies on fallback and recovery logic to avoid a hard failure."
      );
      break;
    case "failed":
      pieces.push(
        "This run highlights a hard failure path — the agent cannot safely complete the task and ends in a failed state."
      );
      break;
  }

  if (toggles.timeout) {
    pieces.push(
      "Timeouts are especially important in production systems: they often reveal fragility in dependency management and error handling."
    );
  }

  if (toggles.missing) {
    pieces.push(
      "Missing or partial data emphasizes the need for strong preconditions and clear ‘incomplete information’ branches in the state machine."
    );
  }

  if (toggles.conflict) {
    pieces.push(
      "Conflicting rules expose places where product, policy, and engineering need a shared contract about which invariant wins."
    );
  }

  if (toggles.invalid) {
    pieces.push(
      "Invalid states usually point to gaps in invariants or transition guards — they are the places you most want to eliminate through better design."
    );
  }

  pieces.push(
    "In an interview, you can walk through this trace to show how you think about agent behavior as a state machine: what triggers transitions, where guardrails live, and how fallback prevents silent failure."
  );

  return pieces.join(" ");
}

// Scenario description sync
function updateScenarioDescription() {
  const scenario = getSelectedScenario();
  scenarioDescriptionEl.textContent = scenario.description;
}

// Main handler
runTraceBtn.addEventListener("click", () => {
  const toggles = {
    missing: toggleMissing.checked,
    conflict: toggleConflict.checked,
    timeout: toggleTimeout.checked,
    invalid: toggleInvalid.checked
  };

  const scenarioMeta = computeScenario(toggles);

  if (scenarioMeta.outcomeType === "normal") {
    summaryOk(scenarioMeta.outcomeLabel);
  } else if (scenarioMeta.outcomeType === "degraded") {
    summaryOk(scenarioMeta.outcomeLabel);
  } else {
    summaryWarn(scenarioMeta.outcomeLabel);
  }

  highlightPath(scenarioMeta.path);
  renderTrace(scenarioMeta.path, scenarioMeta);

  const notes = generateNotes(scenarioMeta, toggles);
  notesTextEl.textContent = notes;

  setStatus(
    "Trace generated for: " +
      getSelectedScenario().label +
      " (toggles applied: " +
      Object.entries(toggles)
        .filter(([_, v]) => v)
        .map(([k]) => k)
        .join(", ") +
      (Object.values(toggles).some(Boolean) ? ")" : "none)")
  );
});

// Update description when scenario changes
scenarioSelect.addEventListener("change", () => {
  updateScenarioDescription();
  setStatus("Scenario changed. Run a new trace to see the updated path.");
});

// Initial UI state
updateScenarioDescription();
summaryIdle(
  "No trace yet. Choose a scenario, toggle conditions, then click Run State Trace to see how the agent moves through states."
);
