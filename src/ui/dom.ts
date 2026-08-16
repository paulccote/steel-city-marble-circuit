/**
 * Tiny DOM helpers. The menus are built imperatively rather than from template
 * strings so that every interactive node keeps a real reference we can update
 * in place — the level-select panel changes on every arrow press and rebuilding
 * it wholesale would lose focus and restart CSS transitions.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.append(el('span', 'label', label));
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

/** Buttons with an icon read faster than buttons with only a word. */
export function iconButton(
  className: string,
  label: string,
  icon: SVGElement,
  onClick: () => void,
): HTMLButtonElement {
  const b = button(className, label, onClick);
  b.prepend(icon);
  return b;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
