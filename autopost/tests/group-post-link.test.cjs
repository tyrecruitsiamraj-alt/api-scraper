const test = require('node:test');
const assert = require('node:assert/strict');
const { groupSlugFromUrl, groupAliases, postIdForGroup, canonicalPostLink } = require('../server/group-post-link');

const G = '1486494998623206';

test('slug from a group page URL', () => {
  assert.equal(groupSlugFromUrl('https://www.facebook.com/groups/HanganKhabrot/my_posted_content'), 'hangankhabrot');
  assert.equal(groupSlugFromUrl(`https://www.facebook.com/groups/${G}/`), G);
  assert.deepEqual(groupAliases(G, 'https://www.facebook.com/groups/hangankhabrot/my_posted_content'), [G, 'hangankhabrot']);
  assert.deepEqual(groupAliases(G, `https://www.facebook.com/groups/${G}/my_posted_content`), [G]);
});

test('post links by number, by name, permalink and story_fbid', () => {
  const al = [G, 'hangankhabrot'];
  assert.equal(postIdForGroup(`https://www.facebook.com/groups/${G}/posts/2172970066642359/`, al), '2172970066642359');
  assert.equal(postIdForGroup('/groups/hangankhabrot/posts/2172970066642359/?__cft__=x', al), '2172970066642359');
  assert.equal(postIdForGroup('https://www.facebook.com/groups/HanganKhabrot/permalink/555/', al), '555');
  assert.equal(postIdForGroup(`https://www.facebook.com/permalink.php?story_fbid=777&id=${G}`, al), '777');
});

test('not our group or not a post is rejected', () => {
  const al = [G, 'hangankhabrot'];
  assert.equal(postIdForGroup('https://www.facebook.com/groups/othergroup/posts/1/', al), null);
  assert.equal(postIdForGroup('https://www.facebook.com/groups/hangankhabrot/user/1000/', al), null);
  assert.equal(postIdForGroup('https://www.facebook.com/hangankhabrot', al), null);
});

test('stored link is always the numbered form', () => {
  assert.equal(
    canonicalPostLink('/groups/hangankhabrot/posts/2172970066642359/?x=1', G, [G, 'hangankhabrot']),
    `https://www.facebook.com/groups/${G}/posts/2172970066642359/`,
  );
});
