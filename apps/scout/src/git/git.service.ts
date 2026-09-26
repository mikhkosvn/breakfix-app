import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm, mkdir } from 'node:fs/promises';

const run = promisify(execFile);

export type CloneResult = {
  dir: string;
  /** The commit the working tree holds. */
  revision: string;
  /**
   * True when we checked out the commit the caller asked for.
   *
   * False means the commit was unknown, so we fall back to the default branch. Every line
   * number from the stack trace is then unverified, and the agent must check each one
   * against the source line Sentry recorded.
   */
  exact: boolean;
};

@Injectable()
export class GitService {
  private readonly log = new Logger(GitService.name);

  /**
   * Clone one repository and check out one commit.
   *
   * Uses a partial clone, not a shallow clone. `--filter=blob:none` downloads every commit
   * and every tree, and no file contents. Git fetches a file only when something reads it.
   *
   * A shallow clone would be smaller, and it would break `git blame` for any line older
   * than the clone depth. Scout needs blame to answer "when did this line last change",
   * which is how it tells a code change from a data change.
   */
  async clone(
    repoDir: string,
    repoUrl: string,
    revision: string | null,
  ): Promise<CloneResult> {
    await rm(repoDir, { recursive: true, force: true });
    await mkdir(repoDir, { recursive: true });

    await this.git(['clone', '--filter=blob:none', repoUrl, repoDir]);

    if (revision) {
      try {
        await this.git(['-C', repoDir, 'checkout', '--detach', revision]);
        return { dir: repoDir, revision, exact: true };
      } catch {
        this.log.warn(
          `Commit ${revision} is unknown in this repository. Using the default branch.`,
        );
      }
    }

    const head = (await this.git(['-C', repoDir, 'rev-parse', 'HEAD'])).trim();
    return { dir: repoDir, revision: head, exact: false };
  }

  /** The date one line last changed, as an ISO string. Null when the line has no history. */
  async lineLastChanged(
    repoDir: string,
    path: string,
    line: number,
  ): Promise<string | null> {
    try {
      const out = await this.git([
        '-C',
        repoDir,
        'log',
        '-1',
        '--format=%aI',
        `-L`,
        `${line},${line}:${path}`,
      ]);
      const first = out.split('\n').find((l) => l.trim().length > 0);
      return first ? first.trim() : null;
    } catch {
      return null;
    }
  }

  /** True when the working tree holds no change. The agent must not write any file. */
  async isClean(repoDir: string): Promise<boolean> {
    const out = await this.git(['-C', repoDir, 'status', '--porcelain']);
    return out.trim().length === 0;
  }

  private async git(args: string[]): Promise<string> {
    // `core.hooksPath=/dev/null` stops a repository hook running on our machine.
    const { stdout } = await run(
      'git',
      ['-c', 'core.hooksPath=/dev/null', ...args],
      {
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    return stdout;
  }
}
