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
