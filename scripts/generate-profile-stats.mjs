import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API_ROOT = 'https://api.github.com';
const CARD_BACKGROUND = '#0d1117';
const CARD_BORDER = '#238636';
const TEXT = '#e6edf3';
const MUTED = '#8b949e';
const ACCENT = '#3fb950';

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function aggregateLanguages(languageMaps) {
  const totals = new Map();
  for (const languageMap of languageMaps) {
    for (const [language, bytes] of Object.entries(languageMap)) {
      totals.set(language, (totals.get(language) ?? 0) + bytes);
    }
  }

  return [...totals.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name));
}

export function rankRepositories(contributions, limit = 5) {
  return contributions
    .filter(({ repository, contributions: count }) => repository && !repository.isPrivate && count.totalCount > 0)
    .map(({ repository, contributions: count }) => ({
      name: repository.nameWithOwner,
      url: repository.url,
      commits: count.totalCount,
    }))
    .sort((left, right) => right.commits - left.commits || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">\n${body}\n</svg>\n`;
}

function cardShell(width, height, title, body) {
  return svgDocument(width, height, `  <rect width="100%" height="100%" rx="12" fill="${CARD_BACKGROUND}" stroke="${CARD_BORDER}"/>\n  <text x="24" y="32" fill="${TEXT}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="18" font-weight="600">${escapeXml(title)}</text>\n${body}`);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function renderStatsCard(profile, stats) {
  const entries = [
    ['Public contributions', stats.totalContributions],
    ['Commits', stats.totalCommitContributions],
    ['Pull requests', stats.totalPullRequestContributions],
    ['Issues', stats.totalIssueContributions],
    ['Reviews', stats.totalPullRequestReviewContributions],
    ['Public repos', profile.public_repos],
    ['Followers', profile.followers],
  ];
  const rows = entries.map(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 24 : 262;
    const y = 70 + row * 31;
    return `  <text x="${x}" y="${y}" fill="${MUTED}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="13">${escapeXml(label)}</text>\n  <text x="${x + 180}" y="${y}" fill="${ACCENT}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="13" font-weight="700" text-anchor="end">${formatNumber(value)}</text>`;
  }).join('\n');

  return cardShell(500, 202, 'GitHub Stats', `${rows}\n  <text x="24" y="185" fill="${MUTED}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="11">Public activity since ${escapeXml(profile.created_at.slice(0, 4))}</text>`);
}

export function renderLanguagesCard(languages) {
  if (languages.length === 0) {
    return cardShell(390, 202, 'Top Languages', '  <text x="24" y="75" fill="#8b949e" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="14">No public repository languages found.</text>');
  }

  const topLanguages = languages.slice(0, 5);
  const total = topLanguages.reduce((sum, language) => sum + language.bytes, 0);
  const rows = topLanguages.map((language, index) => {
    const y = 64 + index * 27;
    const percentage = total === 0 ? 0 : Math.round((language.bytes / total) * 100);
    const width = Math.max(2, Math.round((language.bytes / total) * 140));
    return `  <text x="24" y="${y}" fill="${TEXT}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="13">${escapeXml(language.name)}</text>\n  <rect x="137" y="${y - 11}" width="140" height="8" rx="4" fill="#21262d"/>\n  <rect x="137" y="${y - 11}" width="${width}" height="8" rx="4" fill="${ACCENT}"/>\n  <text x="360" y="${y}" fill="${MUTED}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="12" text-anchor="end">${percentage}%</text>`;
  }).join('\n');
  return cardShell(390, 202, 'Top Languages', rows);
}

export function renderRepositoriesCard(repositories) {
  if (repositories.length === 0) {
    return cardShell(610, 210, 'Top Contributed Repositories', '  <text x="24" y="75" fill="#8b949e" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="14">No public commit contributions found.</text>');
  }

  const rows = repositories.map((repository, index) => {
    const y = 65 + index * 27;
    return `  <a href="${escapeXml(repository.url)}"><text x="24" y="${y}" fill="${TEXT}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="14">${index + 1}. ${escapeXml(repository.name)}</text></a>\n  <text x="580" y="${y}" fill="${ACCENT}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="13" font-weight="700" text-anchor="end">${formatNumber(repository.commits)} commits</text>`;
  }).join('\n');
  const footerY = Math.min(190, 76 + repositories.length * 27);
  return cardShell(610, 210, 'Top Contributed Repositories', `${rows}\n  <text x="24" y="${footerY}" fill="${MUTED}" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="11">Public commits across all history</text>`);
}

async function request(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function listRepositories(owner, token) {
  const repositories = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(`${API_ROOT}/users/${owner}/repos?type=owner&per_page=100&page=${page}`, token);
    repositories.push(...batch);
    if (batch.length < 100) return repositories;
  }
}

async function contributionStats(owner, from, token) {
  const query = `query ProfileStats($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar { totalContributions }
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner url isPrivate }
          contributions { totalCount }
        }
      }
    }
  }`;
  const response = await fetch(`${API_ROOT}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: owner, from, to: new Date().toISOString() } }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL returned ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data?.user) throw new Error(`GitHub GraphQL error: ${payload.errors?.[0]?.message ?? 'user not found'}`);
  return payload.data.user.contributionsCollection;
}

export async function generate({ owner, token, outputDirectory }) {
  if (!owner || !token) throw new Error('GITHUB_REPOSITORY_OWNER and GITHUB_TOKEN are required.');
  const profile = await request(`${API_ROOT}/users/${owner}`, token);
  const repositories = (await listRepositories(owner, token)).filter((repository) => !repository.fork && !repository.archived);
  const languageMaps = await Promise.all(repositories.map((repository) => request(`${API_ROOT}/repos/${repository.full_name}/languages`, token)));
  const stats = await contributionStats(owner, profile.created_at, token);

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'github-stats.svg'), renderStatsCard(profile, stats)),
    writeFile(path.join(outputDirectory, 'top-languages.svg'), renderLanguagesCard(aggregateLanguages(languageMaps))),
    writeFile(path.join(outputDirectory, 'top-contributed-repos.svg'), renderRepositoriesCard(rankRepositories(stats.commitContributionsByRepository))),
  ]);
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  generate({
    owner: process.env.GITHUB_REPOSITORY_OWNER,
    token: process.env.GITHUB_TOKEN,
    outputDirectory: path.join(root, 'assets'),
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
