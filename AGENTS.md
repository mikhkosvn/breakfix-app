# Agent rules — breakfix-app

These rules apply to every agent that writes or edits a file in this repository.

The rules are not advice. An agent that breaks Rule 1 must repair the file before it
reports the work as complete.

## Rule 1 — Never write a comment

Do not write a comment in any file in this repository.

This rule has no exception for difficult code. It has no exception for a workaround. It has
no exception for a line that was hard to make correct. Rule 3 names the only permitted
comment syntax. That syntax is a directive for a tool, not a comment for a reader.

## Rule 2 — What counts as a comment

The ban covers the comment syntax of every language in this repository.

| Language or file | Banned syntax |
|---|---|
| TypeScript and JavaScript | `//`, `/* */`, `/** */` |
| JSON with comments (`.jsonc`) | `//`, `/* */` |
| YAML Ain't Markup Language (YAML) | `#` |
| Markdown | `<!-- -->` |
| Shell script | `#` |
| Dockerfile | `#` |

The ban also covers these seven forms. Each one is a comment under a different name.

1. A documentation block above a function, a class, a type, or a field. JSDoc and TSDoc are
   banned.
2. A file header that names the file, the author, the date, or the purpose.
3. A section banner, such as `// ---- helpers ----`.
4. A marker such as `TODO` (work to do later), `FIXME` (a defect to repair later), `NOTE`,
   `HACK`, or `XXX`.
5. Code that you disable with comment syntax instead of deleting it.
6. A comment in a test file, in a fixture, in a mock, or in a configuration file.
7. A comment in a file that a script of yours generates.

## Rule 3 — The only permitted comment syntax

Four forms use comment syntax, and a tool reads each one. The tool fails without the form.
These four forms are permitted. Nothing else is.

1. A shebang line at the top of an executable script, such as `#!/usr/bin/env node`.
2. A TypeScript compiler directive: `// @ts-check`, `// @ts-expect-error`, `// @ts-nocheck`.
3. A linter directive or a formatter directive: `// eslint-disable-next-line <rule>`,
   `// prettier-ignore`.
4. A Docker parser directive at the top of a Dockerfile, such as
   `# syntax=docker/dockerfile:1`.

Write the directive alone. Never add prose to the same line. Never add a line of prose above
the directive.

Correct:

```ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
```

Wrong:

```ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- the library types are wrong
```

## Rule 4 — Write the explanation in a place that is not the code

An explanation has value. The source file is the wrong place for it. Use one of these seven
places instead.

1. The name. Rename the variable, the function, or the type until the name states the intent.
2. A small named function. Move the difficult expression into a function with a clear name.
3. A named constant. Replace the unexplained number or string with a constant that names it.
4. A test. A test with a descriptive name records the behavior that you want to explain.
5. The commit message. Write the reason for the change there.
6. The pull request body. Write the design decision and the trade-off there.
7. A file in `docs/`. Write a long explanation there, and keep it out of the source file.

Report a risk or an open question to the user in your answer. Do not write it into the code.

## Rule 5 — Do not delete a comment that is already in the repository

Some files already hold comments. Leave them.

Do not delete a comment that another author wrote. Ask the user first. One exception applies.
Delete a comment when you delete the code that the comment describes.

## Rule 6 — Check your work before you report it

Read your own diff before you report the work as complete. Search the added lines for comment
syntax.

```bash
git diff -U0 | grep -E '^\+[^+]' | grep -E '//|/\*|<!--|(^|[[:space:]])#'
```

The command reports every added line that holds comment syntax. It also reports false
matches, such as a URL or a string. Read each match. Delete every match that is a comment.

## Rule 7 — Never write a test

Do not write a test in this repository. Do not create a test file. Do not add a test case to a
file that already exists.

This rule has no exception. Difficult code does not earn a test. A defect that you repaired does
not earn a test. A request to "make sure it works" does not ask you for a test.

## Rule 8 — What counts as a test

The ban covers every automated check, under every name.

| Form | Banned examples |
|---|---|
| Test file | `*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts`, any file in a `test/`, `tests/`, or `__tests__` folder |
| Test function | `describe`, `it`, `test`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll` |
| Assertion | `expect(...)`, `assert(...)`, and any assertion library |
| Test double | `jest.mock`, `jest.fn`, `jest.spyOn`, a stub, a fake, or a fixture that exists for a test only |
| Snapshot | `toMatchSnapshot`, and any `__snapshots__` folder |
| Runner configuration | a `jest` block in `package.json`, `jest.config.*`, `vitest.config.*`, a `test` script |
| Throwaway script | a file whose only purpose is to prove that other code works |

A linter and a type checker are not tests. `eslint` and `tsc` stay.

## Rule 9 — What to do instead of a test

Read the code and make it correct. Then report two things to the user.

1. What you changed.
2. What you did not verify.

Write the second part plainly. "I did not run this against a real database" is a correct report.
Name each limit of what you observed. Never report a result that you did not see.

## Rule 10 — Check your work before you report it

Run this command before you report the work as complete.

```bash
git status --porcelain | grep -E '\.(spec|test|e2e-spec)\.(ts|js)$|__tests__|__snapshots__'
```

The command must print nothing. One line of output means you broke Rule 7. Delete that file.
