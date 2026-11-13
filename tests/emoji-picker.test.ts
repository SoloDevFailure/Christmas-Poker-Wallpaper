import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emojis, emojiCategories, searchEmojis, rememberEmoji } from '../src/emojiCatalog';
import { graphemes, validateText } from '../src/customStamp';

test('catalogue has unique complete emoji sequences compatible with the PNG text pipeline', () => {
  assert.equal(new Set(emojis.map(e => e.unicode)).size, emojis.length);
  for (const emoji of emojis) {
    assert.ok(emoji.name && emoji.keywords && emoji.category);
    assert.equal(validateText(emoji.unicode), emoji.unicode);
    assert.deepEqual(graphemes(emoji.unicode), [emoji.unicode]);
  }
  for (const category of emojiCategories) assert.ok(searchEmojis('', category).length);
});
test('search finds names, keyword aliases, categories and joined emoji across categories', () => {
  for (const query of ['SANTA', 'xmas', 'lol', 'aubergine', 'poker', 'aussie', '🏴‍☠️']) assert.ok(searchEmojis(query, 'Smileys').length, query);
  assert.equal(searchEmojis('red heart', 'Smileys')[0].unicode, '❤️');
  assert.deepEqual(searchEmojis('nothing-matches-this', 'Smileys'), []);
  assert.ok(searchEmojis('  beer   cheers  ', 'Smileys').some(e => e.unicode === '🍻'));
});
test('recent choices are ordered, deduplicated, bounded and ignore invalid stored values', () => {
  const recent = emojis.slice(0, 30).reduce((all, e) => rememberEmoji(all, e.unicode), [] as string[]);
  assert.equal(recent.length, 24);
  const next = rememberEmoji(recent, recent[3]);
  assert.equal(next[0], recent[3]);
  assert.equal(new Set(next).size, 24);
  assert.deepEqual(searchEmojis('', 'Recent', ['invalid', next[0]]).map(e => e.unicode), [next[0]]);
  assert.deepEqual(rememberEmoji(['invalid'], '😀'), ['😀']);
});
