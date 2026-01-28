const fs = require('fs');
const path = require('path');

const scored = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/leads-scored.json'), 'utf-8'));

const leads = scored
  .filter(p => p.businessScore >= 1 || p.humorScore >= 1)
  .sort((a, b) => b.totalScore - a.totalScore)
  .map(p => ({
    username: p.username,
    followers: p.followerCount,
    following: p.followingCount,
    ratio: p.ratio,
    bio: (p.bio || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    businessScore: p.businessScore,
    humorScore: p.humorScore,
    totalScore: p.totalScore,
    businessMatches: p.businessMatches || [],
    humorMatches: p.humorMatches || [],
    url: 'https://tiktok.com/@' + p.username
  }));

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TikTok Lead Reviewer</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #111; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .counter { font-size: 14px; color: #888; }
    .card { background: #222; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .username { font-size: 24px; font-weight: bold; color: #fe2c55; }
    .stats { display: flex; gap: 20px; margin: 10px 0; color: #888; font-size: 14px; }
    .bio { margin: 15px 0; padding: 10px; background: #333; border-radius: 8px; white-space: pre-wrap; min-height: 60px; }
    .scores { display: flex; gap: 10px; margin: 10px 0; }
    .score { padding: 4px 12px; border-radius: 20px; font-size: 12px; }
    .business { background: #1a472a; color: #4ade80; }
    .humor { background: #4a1a47; color: #f472b6; }
    .signals { font-size: 12px; color: #666; margin: 10px 0; }
    .btn { display: inline-block; padding: 12px 24px; background: #fe2c55; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-right: 10px; border: none; cursor: pointer; font-size: 16px; }
    .btn:hover { background: #e02850; }
    .btn-secondary { background: #333; }
    .btn-secondary:hover { background: #444; }
    .nav { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .shortcuts { font-size: 12px; color: #666; margin-top: 20px; text-align: center; }
    .marked { border: 2px solid #4ade80; }
    .skipped { opacity: 0.5; }
    .status { margin-top: 15px; }
    .status-btn { padding: 10px 20px; margin-right: 8px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .good { background: #166534; color: white; }
    .maybe { background: #854d0e; color: white; }
    .skip { background: #7f1d1d; color: white; }
    #export { margin-top: 20px; padding: 15px; background: #222; border-radius: 8px; display: none; }
    #export.show { display: block; }
    .jump { margin-top: 15px; }
    .jump input { padding: 8px; width: 80px; border-radius: 4px; border: 1px solid #444; background: #333; color: white; }
    .jump button { padding: 8px 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Lead Reviewer</h1>
      <div class="counter"><span id="current">1</span> / <span id="total">${leads.length}</span></div>
    </div>
    <div id="card" class="card"></div>
    <div class="nav">
      <button class="btn btn-secondary" onclick="prev()">← Föreg (←)</button>
      <button class="btn btn-secondary" onclick="next()">Nästa (→)</button>
      <a id="openLink" class="btn" href="#" target="_blank">Öppna TikTok ↗</a>
    </div>
    <div class="status">
      <button class="status-btn good" onclick="mark('good')">✓ Bra (G)</button>
      <button class="status-btn maybe" onclick="mark('maybe')">? Kanske (M)</button>
      <button class="status-btn skip" onclick="mark('skip')">✗ Skip (S)</button>
      <button class="status-btn" style="background:#333" onclick="exportMarked()">📋 Export (E)</button>
    </div>
    <div class="jump">
      <input type="number" id="jumpTo" min="1" max="${leads.length}" placeholder="#">
      <button class="btn btn-secondary" onclick="jumpToNum()">Hoppa</button>
    </div>
    <div class="shortcuts">
      ← → navigera | G = bra | M = kanske | S = skip | E = exportera | Space = öppna TikTok
    </div>
    <div id="export"></div>
  </div>

  <script>
    const leads = ${JSON.stringify(leads)};

    let idx = parseInt(localStorage.getItem('tiktok-idx') || '0');
    const marked = JSON.parse(localStorage.getItem('tiktok-marked') || '{}');

    function render() {
      const p = leads[idx];
      const status = marked[p.username] || '';
      document.getElementById('current').textContent = idx + 1;
      document.getElementById('openLink').href = p.url;
      document.getElementById('card').className = 'card' + (status === 'good' ? ' marked' : status === 'skip' ? ' skipped' : '');

      const statusIcon = status === 'good' ? ' ✓' : status === 'maybe' ? ' ?' : status === 'skip' ? ' ✗' : '';

      document.getElementById('card').innerHTML =
        '<div class="username">@' + p.username + statusIcon + '</div>' +
        '<div class="stats">' +
          '<span>' + p.followers.toLocaleString() + ' följare</span>' +
          '<span>' + p.following.toLocaleString() + ' följer</span>' +
          '<span>Ratio: ' + p.ratio + '</span>' +
        '</div>' +
        '<div class="scores">' +
          '<span class="score business">Business: ' + p.businessScore + '</span>' +
          '<span class="score humor">Humor: ' + p.humorScore + '</span>' +
        '</div>' +
        '<div class="signals">' +
          (p.businessMatches.length ? 'Business: ' + p.businessMatches.join(', ') : '') +
          (p.humorMatches.length ? ' | Humor: ' + p.humorMatches.join(', ') : '') +
        '</div>' +
        '<div class="bio">' + (p.bio || '(ingen bio)') + '</div>';

      localStorage.setItem('tiktok-idx', idx);
    }

    function next() { if (idx < leads.length - 1) { idx++; render(); } }
    function prev() { if (idx > 0) { idx--; render(); } }
    function jumpToNum() {
      const n = parseInt(document.getElementById('jumpTo').value);
      if (n >= 1 && n <= leads.length) { idx = n - 1; render(); }
    }

    function mark(status) {
      marked[leads[idx].username] = status;
      localStorage.setItem('tiktok-marked', JSON.stringify(marked));
      render();
      next();
    }

    function exportMarked() {
      const good = Object.entries(marked).filter(([k,v]) => v === 'good').map(([k]) => k);
      const maybe = Object.entries(marked).filter(([k,v]) => v === 'maybe').map(([k]) => k);
      const skip = Object.entries(marked).filter(([k,v]) => v === 'skip').map(([k]) => k);

      document.getElementById('export').className = 'show';
      document.getElementById('export').innerHTML =
        '<h3>📋 Exportera</h3>' +
        '<p><strong>✓ Bra (' + good.length + '):</strong><br>' + good.map(u => '@' + u).join(', ') + '</p>' +
        '<p><strong>? Kanske (' + maybe.length + '):</strong><br>' + maybe.map(u => '@' + u).join(', ') + '</p>' +
        '<p><strong>✗ Skipped: ' + skip.length + '</strong></p>' +
        '<p><strong>Kvar: ' + (leads.length - good.length - maybe.length - skip.length) + '</strong></p>';
    }

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key.toLowerCase() === 'g') mark('good');
      if (e.key.toLowerCase() === 'm') mark('maybe');
      if (e.key.toLowerCase() === 's') mark('skip');
      if (e.key.toLowerCase() === 'e') exportMarked();
      if (e.key === ' ') { e.preventDefault(); window.open(leads[idx].url, '_blank'); }
    });

    render();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'output/lead-reviewer.html'), html);
console.log('Skapad: output/lead-reviewer.html');
console.log('Profiler:', leads.length);
