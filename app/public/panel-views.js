// Panel presentation is local to this browser; audio and API state are untouched.
export function initPanelViews(root = document) {
  root.querySelectorAll('.panel').forEach((panel, index) => {
    const heading = panel.querySelector(':scope > .panel-heading, :scope > .editor-heading');
    if (!heading || heading.querySelector('.panel-toggle')) return;
    const key = `algorave:view:${location.pathname}${location.search}:${panel.getAttribute('aria-label') || index}`;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'panel-toggle';
    const name = panel.getAttribute('aria-label') || 'panel';
    function render(minimized) {
      panel.classList.toggle('is-minimized', minimized);
      button.textContent = minimized ? 'Expand ↗' : 'Minimize −';
      button.setAttribute('aria-expanded', String(!minimized));
      button.setAttribute('aria-label', `${minimized ? 'Expand' : 'Minimize'} ${name}`);
      panel.dispatchEvent(new CustomEvent('panelviewchange'));
    }
    let saved = false;
    try { saved = localStorage.getItem(key) === 'compact'; } catch {}
    render(saved);
    button.onclick = () => {
      const minimized = !panel.classList.contains('is-minimized');
      render(minimized);
      try { localStorage.setItem(key, minimized ? 'compact' : 'full'); } catch {}
    };
    heading.append(button);
  });
}
