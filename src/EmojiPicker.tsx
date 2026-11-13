import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { emojiCategories, rememberEmoji, searchEmojis } from './emojiCatalog';

const RECENTS_KEY = 'christmas-poker-recent-emojis';
function loadRecent(): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string').slice(0, 24) : [];
  } catch { return []; }
}

export default function EmojiPicker({ onSelect, onClose }: { onSelect: (unicode: string) => void; onClose: () => void }) {
  const [recent] = useState(loadRecent);
  const [category, setCategory] = useState(recent.length ? 'Recent' : emojiCategories[0]);
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const results = searchEmojis(query, category, recent);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  function select(unicode: string) {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(rememberEmoji(recent, unicode))); } catch { /* Private browsing or full storage: selection still works. */ }
    onSelect(unicode);
  }
  return createPortal(<div className="emoji-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} className="emoji-dialog" role="dialog" aria-modal="true" aria-labelledby="emoji-title" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input')];
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="settings-title"><h2 id="emoji-title">Choose emoji</h2><button type="button" aria-label="Close emoji picker" onClick={onClose}>×</button></div>
      <input type="search" aria-label="Search emojis" placeholder="Search emojis…" value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false}/>
      <div className="emoji-categories" aria-label="Emoji categories">
        {['Recent', ...emojiCategories].map(name => <button type="button" key={name} aria-pressed={category === name && !query.trim()} onClick={() => { setCategory(name); setQuery(''); }}>{name}</button>)}
      </div>
      <p className="emoji-results-label" role="status">{query.trim() ? `${results.length} results` : category}</p>
      <div className="emoji-grid" aria-label="Emojis">
        {results.map(emoji => <button type="button" key={emoji.unicode} title={emoji.name} aria-label={emoji.name} onClick={() => select(emoji.unicode)}>{emoji.unicode}</button>)}
        {!results.length && <p className="emoji-empty">{category === 'Recent' && !query.trim() ? 'Your recently selected emojis will appear here.' : 'No emojis found. Try another keyword.'}</p>}
      </div>
    </div>
  </div>, document.body);
}
