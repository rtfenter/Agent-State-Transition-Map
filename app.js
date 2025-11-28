const taskInput = document.getElementById("task-input");
const conditionsInput = document.getElementById("conditions-input");
const rulesInput = document.getElementById("rules-input");

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
  // Base path and outcome
  // We choose one dominant pattern to keep it legible.
  if (!missing && !conflict && !timeout && !invalid) {
    return {
      outcomeType: "normal",
      outcomeLabel: "Normal path — task completed without major failures.",
      summaryText:
        "Agent followed the happy path: it processed the task under current conditions and reached a clean end state.",
      path: [
        "initial",
        "processing",
        "end_ok"
      ]
    };
  }

  if (invalid) {
    return {
      outcomeType: "failed",
      outcomeLabel: "Invalid state — agent reached an impossible or undefined state.",
      summaryText:
        "The agent transitioned into a state that should never be reachable. In real systems this often exposes design gaps, missing invariants, or unhandled edge cases.",
      path: [
        "initial",
        "processing",
        "error",
        "fallback",
        "end_failed"
      ]
    };
  }

  if (timeout) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Timeout-driven fallback — task completed via degraded path.",
      summaryText:
        "Slow or unavailable dependencies forced the agent into a timeout state, then through fallback and recovery to reach a degraded but acceptable outcome.",
      path: [
        "initial",
        "timeout",
        "fallback",
        "recovery",
        "end_degraded"
      ]
    };
  }

  if (missing && conflict) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Conflicting and incomplete inputs — agent relied heavily on fallback.",
      summaryText:
        "The agent detected both missing data and conflicting rules, leading to an error and heavy use of fallback / recovery logic. It reached a degraded end state that should be flagged for review.",
      path: [
        "initial",
        "error",
        "fallback",
        "recovery",
        "end_degraded"
      ]
    };
  }

  if (missing) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Missing or partial data — degraded success via fallback.",
      summaryText:
        "The agent detected incomplete inputs and moved into an error branch. Fallback and recovery logic allowed it to produce a partial or caveated result instead of silently failing.",
      path: [
        "initial",
        "error",
        "fallback",
        "recovery",
        "end_degraded"
      ]
    };
  }

  if (conflict) {
    return {
      outcomeType: "degraded",
      outcomeLabel: "Conflicting rules — agent resolved tension via fallback.",
      summaryText:
        "Conflicting rules or instructions pushed the agent into an error state. Fallback logic (e.g., escalation or explicit tie-breaking) allowed it to reach a degraded but consistent end state.",
      path: [
        "initial",
        "processing",
        "error",
        "fallback",
        "recovery",
        "end_degraded"
      ]
    };
  }

  // Fallback (should not be hit given branches above)
  return {
    outcomeType: "failed",
    outcomeLabel: "Uncategorized failure.",
    summaryText:
      "The agent encountered a scenario that was not explicitly modeled. In practice, this would indicate a gap in the state machine design.",
    path: [
      "initial",
      "error",
      "end_failed"
    ]
  };
}

// Render the state trace list
function renderTrace(path, meta) {
  const task = taskInput.value.trim();
  const conditions = conditionsInput.value.trim();
  const rules = rulesInput.value.trim();

  const taskSnippet = task || "No explicit task provided.";
  const conditionsSnippet =
    conditions || "No additional conditions or environment context specified.";
  const rulesSnippet =
    rules || "No explicit rules or policies provided.";

  const items = [];

  path.forEach((stateKey, index) => {
    let label;
    let detail;

    switch (stateKey) {
      case "initial":
        label = "Initial State";
        detail = `Agent receives the task and builds an internal view of context and rules.`;
        break;
      case "processing":
        label = "Next / Processing State";
        detail = `Agent is executing the task using the provided conditions and rules.`;
        break;
      case "timeout":
        label = "Timeout State";
        detail = `A dependency (API, database, external tool) is too slow or unresponsive, so progress is blocked.`;
        break;
      case "error":
        label = "Error State";
        detail = `The agent detects a hard failure: missing inputs, conflicting rules, or an invalid transition.`;
        break;
      case "fallback":
        label = "Fallback Handler";
        detail = `Fallback logic activates: retrying, switching to degraded mode, or escalating to a human.`;
        break;
      case "recovery":
        label = "Recovery / Retry";
        detail = `With fallback applied, the agent retries the task or continues with reduced scope.`;
        break;
      case "end_ok":
        label = "End State — Normal Completion";
        detail = `The agent finishes the task as intended, with no major drift or unresolved errors.`;
        break;
      case "end_degraded":
        label = "End State — Degraded Success";
        detail = `The agent completes the task with known limitations (partial output, manual intervention, or degraded mode).`;
        break;
      case "end_failed":
        label = "End State — Failed / Stalled";
        detail = `The agent cannot safely complete the task and stops. This path signals a design or architecture problem to fix.`;
        break;
      default:
        label = stateKey;
        detail = "";
    }

    let extra = "";

    if (index === 0) {
      extra = `<div class="trace-extra">
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
  const pieces = [];

  switch (meta.outcomeType) {
    case "normal":
      pieces.push(
        "This scenario illustrates the clean, happy-path behavior: the agent transitions from Initial → Processing → End without encountering failures."
      );
      break;
    case "degraded":
      pieces.push(
        "This scenario shows how the agent relies on fallback and recovery logic to avoid a hard failure."
      );
      break;
    case "failed":
      pieces.push(
        "This scenario highlights a hard failure path — the agent cannot safely complete the task and ends in a failed state."
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

// Main handler
runTraceBtn.addEventListener("click", () => {
  const task = taskInput.value.trim();

  const toggles = {
    missing: toggleMissing.checked,
    conflict: toggleConflict.checked,
    timeout: toggleTimeout.checked,
    invalid: toggleInvalid.checked
  };

  if (!task) {
    setStatus("Add at least a simple task description to make the trace meaningful.");
    summaryWarn("No task provided — the state machine exists, but we don’t know what the agent is trying to do.");
  } else {
    setStatus("");
  }

  const scenarioMeta = computeScenario(toggles);

  // Update summary badge
  if (scenarioMeta.outcomeType === "normal") {
    summaryOk(scenarioMeta.outcomeLabel);
  } else if (scenarioMeta.outcomeType === "degraded") {
    summaryOk(scenarioMeta.outcomeLabel);
  } else {
    summaryWarn(scenarioMeta.outcomeLabel);
  }

  // Highlight states and render trace
  highlightPath(scenarioMeta.path);
  renderTrace(scenarioMeta.path, scenarioMeta);

  // Interpretation notes
  const notes = generateNotes(scenarioMeta, toggles);
  notesTextEl.textContent = notes;
});

// Initial summary
summaryIdle(
  "No trace yet. Define a task, toggle conditions, then click Run State Trace to see how the agent moves through states."
);
