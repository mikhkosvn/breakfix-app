import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm, mkdir } from 'node:fs/promises';

const run = promisify(execFile);

export type CloneResult = {
  dir: string;
  revision: string;
  exact: boolean;
};

@Injectable()
export class GitService {
  async clone(
    repoDir: string,
    repoUrl: string,
    revision: string | null,
  ): Promise<CloneResult> {
    await rm(repoDir, { recursive: true, force: true });
    await mkdir(repoDir, { recursive: true });

    await this.git(['clone', '--filter=blob:none', repoUrl, repoDir]);

    if (revision) {
      const checkedOut = await this.git([
        '-C',
        repoDir,
        'checkout',
        '--detach',
        revision,
      ])
        .then(() => true)
        .catch(() => false);
      if (checkedOut) return { dir: repoDir, revision, exact: true };
    }

    const head = (await this.git(['-C', repoDir, 'rev-parse', 'HEAD'])).trim();
    return { dir: repoDir, revision: head, exact: false };
  }

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

  async isClean(repoDir: string): Promise<boolean> {
    const out = await this.git(['-C', repoDir, 'status', '--porcelain']);
    return out.trim().length === 0;
  }

  private async git(args: string[]): Promise<string> {
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
