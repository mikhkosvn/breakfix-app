# Gaps

Things our tools do not do, that we expected them to do. Each gap is work we must write
ourselves.

A gap is not a bug in our code. It is a missing feature in something we depend on. Read this
file before you trust a library to do what its name says.

Date of the last check: 2026-09-26.
Versions checked: OpenCode 1.18.32, commit `b471c2b`. Sentry `master` at commit `0f24ade`.

---

## 1. OpenCode does not validate structured output

**Severity: high. This gap is silent.**

### What we expected

The OpenCode prompt route accepts a `format` field with a JSON Schema. We expected OpenCode
to check the model answer against that schema, and to report an error when the answer does
not match.

### What happens

OpenCode does not check the answer. It returns whatever the model wrote.

A researcher tested this on 2026-09-26. The schema required a string field named `verdict`.
It also required a field named `confidence`, and it forbade extra keys. The researcher sent
this answer:

```json
{ "verdict": 123, "bogus": "extra" }
```

The number is the wrong type. The `confidence` field is absent. The `bogus` field is
forbidden. OpenCode accepted all three faults. It reported the status "completed" and no
error.

**The word "schema" in the OpenCode API is a hint to the model. It is not a rule that
OpenCode enforces.**

### The second half of the gap

The `format` object declares a field named `retryCount`, with a default value of 2. The name
suggests that OpenCode asks the model again when the answer is bad.

It does not. The field is declared in one file and read nowhere. When the model returns no
structured output, the error reports `retries: 0`.

### What we must build

1. **A validator.** Scout checks every agent answer against our own schema. We use Zod, and
   we generate the JSON Schema for the prompt from the same Zod object.
2. **A repair turn.** When validation fails, scout sends one more turn. That turn contains
   the validation errors. If the second answer also fails, the step fails.
3. **A counter.** Count how often the first answer fails. That number tells us whether the
   model needs a different prompt, or a different model.

### Why this matters more than it looks

The failure is silent. Nothing throws an exception. A broken object travels through scout,
reaches the GitHub issue, and looks correct to a person who reads it.

---

## 2. We use the v2 route, which has no structured output at all

**Severity: medium. We chose this.**

OpenCode has two prompt routes. They do not offer the same features.

| Route | Schema-shaped answer | Events for each tool call |
|---|---|---|
| v1, `POST /session/{id}/message` | Yes | Yes, but through a generic update event |
| v2, `POST /api/session/{id}/prompt` | **No** | Yes, with clear names |

The v2 route has no `format` field. Its tool list holds no `StructuredOutput` tool. A test
call returned the message `Unknown tool: StructuredOutput`.

**We chose the v2 route.** So the agent writes the JSON object in its final message, and
scout reads it from that text.

### Why we chose it

1. Gap 1 above means the v1 schema support gives us almost nothing. We must validate and
   retry in both cases.
2. The v1 structured path makes the Anthropic route send `tool_choice: {"type":"any"}`. An
   open-weights model behind our own gateway may reject that value.
3. The v2 route is the newer one. Building on v1 means a migration later.

### What we must build

A JSON extractor. The final message can hold prose before the object, a code fence around
it, or a truncated object. The extractor must separate a truncated answer from a chatty one,
because those two faults need different repair prompts.

PostHog solved this problem. Read their version at
`products/tasks/backend/logic/services/custom_prompt_internals.py`, lines 1080 to 1141.

### When we reverse this choice

Count the extractor failures. If more than one run in five produces unreadable output, then
constrained generation stops being optional. We then return to the v1 route, and we test
whether our gateway accepts `tool_choice: {"type":"any"}`.

---

## 3. OpenCode reports a cost of zero for our model

**Severity: low. Deferred. Token counts are correct.**

### What we expected

OpenCode reports the cost of each run in dollars. We expected that number to be correct.

### What happens

The number is always `0.00` for our model.

OpenCode computes cost with one multiplication. It multiplies the token count by a price
that it stores for that model. It stores prices for well-known models only. Our open-weights
model sits behind our own gateway, so OpenCode holds no price for it. The stored price is
zero, so every cost value is zero.

**The token counts are correct.** Only the dollar value is wrong.

### What we do now

The budget limit counts **tokens**, not money. We stop a run when it passes a token limit.

This is the correct measure for us in any case. We pay our gateway for each token, so tokens
are the number that matters.

### What we do later

This gap is deferred on purpose. Nobody works on it now.

To get real dollar values, write the price for each model into the configuration, under
`provider.<id>.models.<id>.cost`. A test confirmed that this makes the cost exact.

Do this work when one of these becomes true:

1. Somebody asks what one scout run costs in money.
2. We report a cost to a person in the GitHub issue or in Slack.
3. We compare two models by price.

---

## 4. An "ask" permission rule hangs the session forever

**Severity: high. Warning: this gap has no timeout.**

OpenCode permission rules accept three values: `allow`, `deny`, and `ask`.

In server mode, an `ask` rule waits for an answer that never arrives. The wait has no
timeout. The session hangs until something kills it.

**The default value of the `doom_loop` rule is `ask`.** Three identical tool calls in a row
trigger that rule. So a model that repeats one action hangs the session, with the default
configuration.

**What we do.**

1. Our permission block uses `allow` and `deny` only. It never uses `ask`.
2. We set `doom_loop` to `deny` explicitly.
3. The scout heartbeat detects a hung session, because no event arrives.

---

## 5. OpenCode writes files into the repository we cloned

**Severity: high. It breaks our read-only check.**

Without the correct environment variables, OpenCode changes the cloned repository. A
researcher reproduced three changes:

1. It rewrites `opencode.json` to add a `$schema` line.
2. It writes `<repo>/.opencode/.gitignore`.
3. It runs `npm install` into `<repo>/.opencode/node_modules`.

Scout checks that the working tree is clean after the diagnosis run. These writes break that
check before the agent starts.

**What we do.** Set all of these in the container:

```
OPENCODE_DISABLE_PROJECT_CONFIG=1
OPENCODE_DISABLE_EXTERNAL_SKILLS=1
OPENCODE_DISABLE_AUTOUPDATE=1
```

Warning: the first variable does not stop skills. A target repository can still load skills
from `.claude/skills/` and from `.agents/skills/`. Only the second variable stops those.

---

## 6. A Sentry organization token cannot do scout's work

**Severity: high. Check this before you write the client.**

A Sentry organization auth token starts with `sntrys_`. Its scope list is fixed to `org:ci`.

That scope works for the release endpoints. Four endpoints that scout needs reject it:

1. The issue details endpoint. It needs `event:read`.
2. The single event endpoint. It needs `event:read`.
3. The trace endpoint. It needs `org:read`.
4. The events and logs endpoint. It needs `org:read`.

**What we do.** Use an internal integration token, or a user auth token. Grant `event:read`,
`org:read`, and `project:releases`.

---

## 7. The Sentry regression webhook holds no event identifier

**Severity: medium.**

The `issue.unresolved` webhook says that an issue returned. It does not say which event
caused the return. The sender passes no event data.

**What we do.** Call the issue details endpoint. Read the newest activity entry whose type
is `set_regression`. The event identifier is at `data.event_id` inside that entry.

Two warnings.

1. The activity array holds at most 100 entries. A noisy issue can push the regression entry
   past that limit. Read the substatus as a fallback, and accept that the event identifier
   can be absent.
2. The key `event_id` uses snake case. Every neighbouring key uses camel case. Do not
   convert the whole object.

---

## 8. Sentry limits issue details to 5 requests each second

**Severity: low today. It grows with our run count.**

The issue details endpoint allows 5 requests in 1 second, for each organization.

**What we do.** Scout runs one job at a time, so we reach this limit only on a retry storm.
Add a shared limiter and a retry with backoff when we raise concurrency.

---

## 9. TypeScript is pinned to 6.0.3, below the newest release

**Severity: low. Two tools set this ceiling, not us.**

### What we expected

This is a new project. We expected every dependency at its newest release.

### What happens

TypeScript 7.0.2 exists and we cannot use it. Two tools block it, for two different reasons.

**The Nest command-line tool refuses to build.** Its message:

> The installed TypeScript version (7.0.2) does not expose the programmatic compiler API
> that the Nest CLI requires. TypeScript 7.0 ships the "tsc" executable only. The compiler
> API is expected to return in 7.1. Please install TypeScript 6.

**The lint tool agrees, independently.** `typescript-eslint` 8.70.1 is its newest release. Its
peer range for TypeScript is `>=4.8.4 <6.1.0`.

So the ceiling is **6.0.3**, the newest release below 6.1.0.

### What TypeScript 6 changed, and what we did

Three defaults changed. Each one broke the build until we set it.

1. **It no longer includes every `@types` package on its own.** Set
   `"types": ["node", "jest"]` in the root `tsconfig.json`. Warning: naming one package
   removes all the others. A list with `node` alone silently removes the Jest types, and
   every test matcher then reports as an unsafe call.
2. **It requires `rootDir` whenever `outDir` is set.** We set `"rootDir": "./"`.
3. **It deprecates `baseUrl`, which stops working in TypeScript 7.** We removed it, and we
   removed the empty `paths` object with it.

### When this gap closes

Check both tools when you next raise versions:

1. TypeScript 7.1 returns the compiler API. Then the Nest command-line tool can use it.
2. `typescript-eslint` raises its peer range above 6.1.0.

Both must be true. Raising TypeScript alone breaks the build.

---

## How to use this file

Add a gap when a tool does not do what its name says, and we write code to fill the hole.

Each entry needs five parts:

1. What we expected.
2. What happens.
3. The evidence, with a version and a date.
4. What we build instead.
5. When we remove the gap.

Check this file again when you raise a dependency version. A gap can close. A new one can
open.
