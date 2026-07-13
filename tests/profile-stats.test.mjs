import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLanguages, buildDateRanges, escapeXml, mergeContributionStats, rankRepositories, renderLanguagesCard, renderRepositoriesCard } from '../scripts/generate-profile-stats.mjs';

test('aggregates and orders language bytes', () => {
  assert.deepEqual(aggregateLanguages([{ JavaScript: 12, Python: 3 }, { Python: 18, Java: 4 }]), [
    { name: 'Python', bytes: 21 },
    { name: 'JavaScript', bytes: 12 },
    { name: 'Java', bytes: 4 },
  ]);
});

test('ranks only public repositories with contributions', () => {
  const repositories = rankRepositories([
    { repository: { nameWithOwner: 'me/private', url: 'https://example.test/private', isPrivate: true }, contributions: { totalCount: 99 } },
    { repository: { nameWithOwner: 'me/b', url: 'https://example.test/b', isPrivate: false }, contributions: { totalCount: 2 } },
    { repository: { nameWithOwner: 'me/a', url: 'https://example.test/a', isPrivate: false }, contributions: { totalCount: 7 } },
  ]);
  assert.deepEqual(repositories.map(({ name, commits }) => [name, commits]), [['me/a', 7], ['me/b', 2]]);
});

test('escapes user-controlled SVG text and renders empty states', () => {
  assert.equal(escapeXml('<repo&>'), '&lt;repo&amp;&gt;');
  assert.match(renderLanguagesCard([]), /No public repository languages found/);
  assert.match(renderRepositoriesCard([]), /No public commit contributions found/);
});

test('splits historical requests into intervals shorter than one year', () => {
  const ranges = buildDateRanges('2022-09-26T00:00:00.000Z', '2026-07-13T00:00:00.000Z');
  assert.equal(ranges[0].from, '2022-09-26T00:00:00.000Z');
  assert.equal(ranges.at(-1).to, '2026-07-13T00:00:00.000Z');
  assert.ok(ranges.every(({ from, to }) => new Date(to) - new Date(from) <= 180 * 24 * 60 * 60 * 1000));
});

test('merges totals and repository commits from historical intervals', () => {
  const collection = (contributions, commits) => ({
    contributionCalendar: { totalContributions: contributions },
    totalCommitContributions: commits,
    totalIssueContributions: 1,
    totalPullRequestContributions: 2,
    totalPullRequestReviewContributions: 3,
    commitContributionsByRepository: [{
      repository: { nameWithOwner: 'me/project', url: 'https://example.test/project', isPrivate: false },
      contributions: { totalCount: commits },
    }],
  });
  const merged = mergeContributionStats([collection(10, 4), collection(20, 7)]);
  assert.equal(merged.totalContributions, 30);
  assert.equal(merged.totalCommitContributions, 11);
  assert.equal(merged.totalIssueContributions, 2);
  assert.equal(merged.commitContributionsByRepository[0].contributions.totalCount, 11);
});
