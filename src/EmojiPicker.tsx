import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { emojiCategories, rememberEmoji, searchEmojis, type Emoji } from './emojiCatalog';

const RECENTS_KEY = 'christmas-poker-recent-emojis';
const categories = ['Recent', ...emojiCategories];
function loadRecent(): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string').slice(0, 24) : [];
  } catch { return []; }
}

// Scrolling changes only the navigation highlight, not hundreds of emoji buttons.
const EmojiGrid = memo(function EmojiGrid({ emojis, onSelect }: { emojis: Emoji[]; onSelect: (unicode: string) => void }) {
  return <div className="emoji-grid">{emojis.map(emoji => <button type="button" key={emoji.unicode} title={emoji.name} aria-label={emoji.name} onClick={() => onSelect(emoji.unicode)}>{emoji.unicode}</button>)}</div>;
});

export default function EmojiPicker({ onSelect, onClose }: { onSelect: (unicode: string) => void; onClose: () => void }) {
  const [recent] = useState(loadRecent);
  const [category, setCategory] = useState('Recent');
  const [query, setQuery] = useState('');
  const searching = !!query.trim();
  const dialog = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const pendingJump = useRef<string | null>(null);
  const groups = useMemo(() => categories.map(name => ({ name, emojis: searchEmojis('', name, recent) })), [recent]);
  const results = useMemo(() => searching ? searchEmojis(query, '', recent) : [], [query, searching, recent]);
  // Keep this callback stable when only the active section changes.
  const select = useMemo(() => (unicode: string) => {
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(rememberEmoji(recent, unicode))); } catch { /* Private browsing or full storage: selection still works. */ }
    onSelect(unicode);
  }, [recent, onSelect]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const x = window.scrollX, y = window.scrollY;
    const body = document.body;
    const saved = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    // Fixed body also locks older iOS Safari, where overflow:hidden alone leaks.
    Object.assign(body.style, { position: 'fixed', top: -y + 'px', left: -x + 'px', width: '100%', overflow: 'hidden' });
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { Object.assign(body.style, saved); previous?.focus({ preventScroll: true }); window.scrollTo(x, y); };
  }, []);

  function jump(name: string) {
    const list = scroller.current, section = sections.current.get(name);
    if (!list || !section) return;
    const top = list.scrollTop + section.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  useLayoutEffect(() => {
    if (pendingJump.current && !searching) { jump(pendingJump.current); pendingJump.current = null; }
    else scroller.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [query, searching]);

  useEffect(() => {
    const list = scroller.current;
    if (!list || searching) return;
    let frame = 0;
    function update() {
      frame = 0;
      const top = list!.getBoundingClientRect().top + 24;
      let active = categories[0];
      for (const name of categories) {
        if ((sections.current.get(name)?.getBoundingClientRect().top ?? Infinity) <= top) active = name;
        else break;
      }
      if (list!.scrollTop > 0 && list!.scrollTop + list!.clientHeight >= list!.scrollHeight - 2) active = categories[categories.length - 1];
      setCategory(previous => previous === active ? previous : active);
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    list.addEventListener('scroll', onScroll, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll);
    observer?.observe(list);
    update();
    return () => { list.removeEventListener('scroll', onScroll); observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [searching]);

  useEffect(() => {
    const nav = navigation.current;
    const active = nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!nav || !active) return;
    const bounds = nav.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.left < bounds.left) nav.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
  }, [category, searching]);

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
      <div ref={navigation} className="emoji-categories" aria-label="Emoji categories">
        {categories.map((name, index) => <button type="button" key={name} aria-controls={searching ? 'emoji-search-results' : 'emoji-section-' + index} aria-pressed={category === name && !searching} onClick={() => {
          if (searching) { pendingJump.current = name; setQuery(''); } else jump(name);
        }}>{name}</button>)}
      </div>
      <div ref={scroller} className="emoji-scroll" aria-label="Emojis">
        {searching ? <section id="emoji-search-results" aria-label="Search results">
          <p className="emoji-results-label" role="status">{results.length} results</p>
          <EmojiGrid emojis={results} onSelect={select}/>
          {!results.length && <p className="emoji-empty">No emojis found. Try another keyword.</p>}
        </section> : groups.map(({ name, emojis }, index) => <section key={name} id={'emoji-section-' + index} aria-labelledby={'emoji-heading-' + index} ref={node => { if (node) sections.current.set(name, node); else sections.current.delete(name); }}>
          <h3 id={'emoji-heading-' + index} className="emoji-section-heading">{name}</h3>
          <EmojiGrid emojis={emojis} onSelect={select}/>
          {!emojis.length && <p className="emoji-empty">Your recently selected emojis will appear here.</p>}
        </section>)}
      </div>
    </div>
  </div>, document.body);
}
