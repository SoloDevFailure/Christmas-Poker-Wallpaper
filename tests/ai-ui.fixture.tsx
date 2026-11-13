import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PhotoPreparation from '../src/PhotoPreparation';
import { AiConversionError } from '../src/aiStamp';
import { decodePhoto } from '../src/photoStamp';
import { validCustomAsset, type CustomAsset } from '../src/customStamp';
import '../src/style.css';
const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 1000;
const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e5bfe9'; ctx.fillRect(0, 0, 2000, 1000); ctx.fillStyle = '#256d95'; ctx.fillRect(650, 200, 700, 600);
const blob = async () => await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
const original = new File([await blob()], 'original.png', { type: 'image/png' });
canvas.width = 1024; canvas.height = 1024; ctx.fillStyle = '#ebc25f'; ctx.fillRect(230, 230, 564, 564); ctx.fillStyle = '#151d19'; ctx.fillRect(350, 380, 70, 70); ctx.fillRect(600, 380, 70, 70); ctx.fillRect(350, 650, 320, 40);
const cartoon = await blob();
let allowanceChecks = 0;
let calls = 0, selected: CustomAsset | null = null;
const ensure = (value: unknown, message: string) => { if (!value) throw Error(message); };
function Harness() {
  const [open, setOpen] = useState(true), [asset, setAsset] = useState<CustomAsset | null>(null);
  return <><p>MOCK AI fixture — no paid API calls</p>{open && <PhotoPreparation file={original} sessionId="11111111-1111-4111-8111-111111111111" onCancel={() => setOpen(false)} onFinish={value => { selected = value; setAsset(value); setOpen(false); }} allowance={async () => { allowanceChecks++; return { available: true }; }} convert={async upload => {
    calls++;
    const decoded = await decodePhoto(upload);
    try { ensure(decoded.image.naturalWidth === 1536 && decoded.image.naturalHeight === 768, 'AI received stamp-size or distorted input'); }
    finally { decoded.dispose(); }
    await new Promise(resolve => setTimeout(resolve, 300));
    if (location.search.includes('quota') && calls === 1) throw new AiConversionError('Your attempt allowance for the last 30 minutes is used.', false, 'test', false, 1);
    if (location.search.includes('failure') && calls === 1) throw new AiConversionError('Mock rate limit — your original photo is safe.', true, 'test');
    return cartoon;
  }}/ >}{asset && <><p>Prepared for placement; nothing stamped.</p><img alt="Prepared stamp" src={asset.image_data}/></>}</>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
if (!location.search.includes('visual')) void check();
async function check() {
  const out = document.createElement('output'); out.id = 'ai-ui-result'; document.body.append(out);
  const until = async (condition: () => unknown) => { for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error('UI timed out'); };
  const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await until(() => button('Convert to AI Stamp') && !button('Convert to AI Stamp').disabled);
    button('Convert to AI Stamp').click();
    await until(() => document.querySelector('.ai-progress'));
    ensure(!selected, 'Generation automatically selected/stamped artwork');
    if (location.search.includes('quota')) {
      await until(() => document.querySelector('[role=alert]'));
      ensure(button('Retry').disabled, 'Retry enabled during rolling quota');
      ensure(!button('Use Original Photo').disabled, 'Quota disabled original photo');
      ensure(document.querySelector('.ai-progress'), 'Refill countdown missing');
      await until(() => !button('Retry').disabled);
      ensure(allowanceChecks > 0 && calls === 1, 'Refill dispatched a generation or skipped server check');
      ensure(!selected, 'Refill automatically selected artwork');
      button('Retry').click();
    }
    if (location.search.includes('failure')) {
      await until(() => document.querySelector('[role=alert]'));
      ensure(button('Use Original Photo') && !button('Use Original Photo').disabled, 'Error discarded original');
      button('Retry').click();
    }
    await until(() => document.querySelector('img[alt="AI cartoon preview"]'));
    ensure(button('Retry') && button('Use AI Stamp') && button('Use Original Photo'), 'Preview actions missing');
    ensure(!selected, 'Preview selected artwork without Use AI Stamp');
    button('Use AI Stamp').click(); await until(() => selected);
    ensure(validCustomAsset(selected!), 'AI output exceeded existing PNG constraints');
    ensure(selected!.image_width === selected!.image_height, 'AI aspect ratio changed');
    const image = new Image(); image.src = selected!.image_data; await image.decode(); canvas.width = image.width; canvas.height = image.height;
    ctx.drawImage(image, 0, 0); ensure(ctx.getImageData(0, 0, 1, 1).data[3] === 0, 'Prepared AI stamp lost transparency');
    out.textContent = 'PASS: quota countdown and automatic no-generation recovery (quota mode), full-resolution normalized original, loading, retry/error recovery, original retained, generated preview, three actions, explicit Use AI Stamp, bounded transparent PNG and no automatic stamping.';
  } catch (e) { out.textContent = 'FAIL: ' + String(e); console.error(e); }
}
