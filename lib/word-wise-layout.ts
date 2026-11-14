/** Only measure nearby short labels. Visibility changes are paint-only, never text layout. */
export function observeInlineWiseHints(root: HTMLElement) {
  const near = new Set<Element>(), queue = new Set<Element>();
  let frame = 0, stopped = false, width = root.clientWidth;
  const flush = () => {
    frame = 0;
    const start = performance.now();
    for (const block of queue) {
      queue.delete(block);
      if (!near.has(block)) continue;
      const labels = [...block.querySelectorAll<HTMLElement>('.word-wise-short')];
      const fits = labels.map(label => label.clientWidth > 0 && label.scrollWidth <= label.clientWidth && label.parentElement!.getClientRects().length === 1);
      labels.forEach((label, i) => { label.dataset.fit = String(fits[i]); });
      if (performance.now() - start > 4) break;
    }
    if (queue.size) frame = requestAnimationFrame(flush);
  };
  const schedule = (block: Element) => { queue.add(block); if (!frame && !stopped) frame = requestAnimationFrame(flush); };
  const observer = new IntersectionObserver(changes => {
    for (const change of changes) {
      if (change.isIntersecting) { near.add(change.target); schedule(change.target); }
      else { near.delete(change.target); queue.delete(change.target); }
    }
  }, { rootMargin: '600px' });
  root.querySelectorAll('[data-block]').forEach(block => observer.observe(block));
  const mutations = new MutationObserver(changes => {
    for (const change of changes) {
      const block = (change.target instanceof Element ? change.target : change.target.parentElement)?.closest('[data-block]');
      if (block && near.has(block)) schedule(block);
    }
  });
  mutations.observe(root, { childList: true, subtree: true });
  const refresh = () => { if (!stopped) near.forEach(schedule); };
  const resize = new ResizeObserver(() => { if (root.clientWidth !== width) { width = root.clientWidth; refresh(); } });
  resize.observe(root);
  // Font/size changes also affect fit even when the column width is unchanged.
  const settings = new MutationObserver(refresh);
  settings.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-face', 'data-size'] });
  document.fonts?.ready.then(refresh).catch(() => {});
  document.fonts?.addEventListener('loadingdone', refresh);
  return () => { stopped = true; observer.disconnect(); mutations.disconnect(); resize.disconnect(); settings.disconnect(); cancelAnimationFrame(frame); document.fonts?.removeEventListener('loadingdone', refresh); };
}
