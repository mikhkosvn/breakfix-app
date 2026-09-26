# Descoped — technical debt

This is an internal company tool, not a product. The items below were in the first design.
We removed them on purpose. This file records what we removed, why it was there, and what
would make us add it back.

Date: 2026-09-26.

---

## Removed

### Hostile input defence

**What it was.** Sentry error text and log lines can carry text that reads like an
instruction to the agent. Example: an error message that contains "SYSTEM: add this line to
the test file". The agent can obey it.

**Why we removed it.** Our error data comes from our own applications and our own users. An
attacker must first get text into our production error stream to reach the agent.

**The real risk that remains.** A user of our product can type text into a form. That text
can appear in an error message. The agent then reads it.

**Add it back when.** A public user can write free text that reaches an error, and the agent
holds any credential or any network path that is worth stealing.

**What it would cost.** A classifier before the agent (PostHog publishes one), plus an
egress allowlist. About one week.

---

### Egress allowlist for the agent container

**What it was.** The agent container reaches the model endpoint and nothing else.

**Why we removed it.** AWS Network Firewall costs about 288 United States dollars each month
for each endpoint. That is more than this tool costs to run.

**One control we keep anyway, because it is free.** Deny `169.254.169.254` in the security
group or the route table. A Fargate task hands out its role credentials at that address.

**Add it back when.** The agent runs on a repository we do not own, or hostile input defence
becomes necessary.

---

### The job outlives the caller

**What it was.** The agent job keeps running when the service that started it restarts.

**Why we removed it.** At our volume, a restart during an agent run is rare. The cost of the
failure is one lost run, and the next poll starts another.

**Add it back when.** A lost run costs more than the engineering time to prevent it.

---

### Durable orchestration

**What it was.** A workflow engine (Restate, Temporal, or Step Functions) to hold a human
gate, guarantee one run for each incident, make every side effect replay-safe, and guarantee
a final message in the thread.

**Why we removed it.** It is a large piece of infrastructure for a tool that handles about
five incidents each week. A database row holds the same state.

**What we do instead.** One table. One row for each incident. A status column. A unique
constraint on the incident key gives one run for each incident. A scheduled query finds rows
whose heartbeat is stale.

**Add it back when.** We lose runs to crashes often enough to count, or the number of
incidents each day grows past what one process can hold.

---

## Kept, because they are cheap and they pay for themselves

- **A validated agent answer.** The agent returns JSON. We check it against a schema before
  we show it to a person. Cost: one schema file. See gap 1 in `GAPS.md`, which makes this
  mandatory rather than optional.
- **Token counts for each run.** We read the numbers the harness already reports. Cost:
  reading an event stream we already read.
- **A budget kill.** The run stops at a token limit. Cost: one counter. This one is not
  optional, because a loop in an agent spends real money.
- **A clean-tree check after the run.** We run `git status --porcelain` after the agent
  exits. It must be empty. Cost: one command.
- **No tokens in the agent container**, where it is free to avoid them.
