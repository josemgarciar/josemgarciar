import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLanguages, escapeXml, rankRepositories, renderLanguagesCard, renderRepositoriesCard } from '../scripts/generate-profile-stats.mjs';

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
