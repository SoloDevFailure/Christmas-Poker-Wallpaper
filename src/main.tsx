import './style.css';

// Import React and its renderer inside this catch: a renderer import can throw
// before a React error boundary has a chance to mount (for example error #527).
void import('./bootstrap').then(({ mount }) => mount()).catch(error => {
  console.error('Christmas Poker failed to start', error);
  const host = document.getElementById('root');
  if (!host) return;
  const panel = document.createElement('main');
  panel.className = 'setup';
  panel.setAttribute('role', 'alert');
  const heading = document.createElement('h1');
  heading.textContent = 'Christmas Poker could not start';
  const explanation = document.createElement('p');
  explanation.textContent = 'Reload the page. If this continues, share the message below so the startup failure can be fixed.';
  const details = document.createElement('pre');
  details.className = 'debug';
  details.textContent = error instanceof Error ? error.message : String(error);
  const retry = document.createElement('button');
  retry.textContent = 'Reload page';
  retry.onclick = () => location.reload();
  panel.append(heading, explanation, details, retry);
  host.replaceChildren(panel);
});
