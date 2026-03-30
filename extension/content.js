// Inject golden shimmer line at top of page
if (!document.getElementById('apex-indicator')) {
  const bar = document.createElement('div');
  bar.id = 'apex-indicator';
  document.body.prepend(bar);
}
