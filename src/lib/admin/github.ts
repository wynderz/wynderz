import { isUploadImageRepoPath } from "@/lib/admin/paths";
import type { RepoFile } from "@/lib/admin/content-files";

export type PublishTarget = "dev" | "main";

type GithubConfig = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

export function isPublishTarget(value: string): value is PublishTarget {
  return value === "dev" || value === "main";
}

export function getPublishBranch(target: PublishTarget) {
  if (target === "dev") {
    return process.env.GITHUB_BRANCH_DEV?.trim() || "dev";
  }
  return process.env.GITHUB_BRANCH_MAIN?.trim() || process.env.GITHUB_BRANCH?.trim() || "main";
}

export function getGithubConfig(target: PublishTarget = "main"): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  const branch = getPublishBranch(target);
  if (!token || !owner || !repo || !branch) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) return null;
  return { token, owner, repo, branch };
}

type GithubError = Error & { status?: number; code?: string };

async function githubFetch(config: GithubConfig, url: string, init?: RequestInit) {
  const response = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wynderz-admin",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const error: GithubError = new Error(githubUserMessage(response.status));
    error.status = response.status;
    error.code = "GITHUB_API";
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

function githubUserMessage(status: number) {
  if (status === 401 || status === 403) {
    return "GitHub rejected the server token. Check GITHUB_TOKEN permissions.";
  }
  if (status === 404) {
    return "GitHub repository or branch was not found. Check GITHUB_OWNER, GITHUB_REPO, and GITHUB_BRANCH_DEV / GITHUB_BRANCH_MAIN.";
  }
  if (status === 409 || status === 422) {
    return "GitHub reported a conflict. Reload the admin page and save again.";
  }
  if (status >= 500) {
    return "GitHub is unavailable. Please try again shortly.";
  }
  return "Could not update GitHub. Please try again.";
}

export async function commitRepoFiles(files: RepoFile[], message: string, target: PublishTarget = "main") {
  const config = getGithubConfig(target);
  if (!config) {
    throw new Error("GitHub is not configured on the server.");
  }
  if (files.length === 0) {
    throw new Error("Nothing to save.");
  }

  const ref = (await githubFetch(
    config,
    `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`,
  )) as { object: { sha: string } };
  const commitSha = ref.object.sha;
  const commit = (await githubFetch(
    config,
    `/repos/${config.owner}/${config.repo}/git/commits/${commitSha}`,
  )) as { tree: { sha: string } };

  const treeItems: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: string | null;
  }> = [];

  for (const file of files) {
    if (file.delete) {
      if (!isUploadImageRepoPath(file.path)) {
        throw new Error("Only uploaded images can be removed.");
      }
      treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    if (!file.content) continue;
    const blob = (await githubFetch(config, `/repos/${config.owner}/${config.repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({
        content: file.content.toString("base64"),
        encoding: "base64",
      }),
    })) as { sha: string };
    treeItems.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = (await githubFetch(config, `/repos/${config.owner}/${config.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: commit.tree.sha,
      tree: treeItems,
    }),
  })) as { sha: string };

  const created = (await githubFetch(config, `/repos/${config.owner}/${config.repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [commitSha],
    }),
  })) as { sha: string };

  await githubFetch(
    config,
    `/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha: created.sha, force: false }),
    },
  );

  return { sha: created.sha.slice(0, 7), message, branch: config.branch };
}
