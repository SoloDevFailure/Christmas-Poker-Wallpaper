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

test('party essentials are unique, searchable and in their browsing categories', () => {
  const expected: [string, string, string][] = [
    ['🚬', 'ciggies', 'Travel & objects'], ['🕶️', 'sunnies', 'Travel & objects'],
    ['😎', 'sunglasses face', 'Smileys'], ['🍺', 'beer', 'Food & drink'],
    ['🍻', 'clinking', 'Food & drink'], ['🍸', 'cocktail', 'Food & drink'],
    ['🍹', 'tropical drink', 'Food & drink'], ['🥃', 'whiskey', 'Food & drink'],
    ['🎲', 'dice', 'Activities'], ['🃏', 'joker', 'Activities'],
    ['♠️', 'spade', 'Symbols & flags'], ['♥️', 'heart suit', 'Symbols & flags'],
    ['♦️', 'diamond suit', 'Symbols & flags'], ['♣️', 'club', 'Symbols & flags'],
  ];
  for (const [unicode, query, category] of expected) {
    assert.equal(emojis.filter(emoji => emoji.unicode === unicode).length, 1, unicode);
    assert.ok(searchEmojis(query, 'Recent').some(emoji => emoji.unicode === unicode), query);
    assert.ok(searchEmojis('', category).some(emoji => emoji.unicode === unicode), category);
  }
  for (const query of ['cigarette', 'cigarettes', 'smoking', 'durries', 'shades', 'sunglasses']) {
    assert.ok(searchEmojis(query, 'Smileys').some(emoji => ['🚬', '🕶️'].includes(emoji.unicode)), query);
  }
  // Text/emoji presentation variants must not introduce duplicate catalogue entries.
  assert.equal(new Set(emojis.map(emoji => emoji.unicode.replace(/\uFE0F/g, ''))).size, emojis.length);
});

test('expanded browsing retains common omissions and recent/search behavior', () => {
  for (const unicode of ['🥱', '🫠', '🫶', '🦭', '🥭', '🧩', '🪩', '👓', '🚭', '🩷']) {
    assert.ok(emojis.some(emoji => emoji.unicode === unicode), unicode);
  }
  const recent = rememberEmoji(rememberEmoji([], '🚬'), '🕶️');
  assert.deepEqual(searchEmojis('', 'Recent', recent).map(emoji => emoji.unicode), ['🕶️', '🚬']);
  assert.ok(searchEmojis('poker', 'Recent', recent).some(emoji => emoji.unicode === '🎲'));
  assert.deepEqual(searchEmojis('no-such-emoji', 'Recent', recent), []);
});
