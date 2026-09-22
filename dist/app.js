/* PCA 刷题助手 — app.js */
(function () {
  'use strict';

  const BANK = window.BANK || { questions: [], caseStudies: {}, topics: [] };
  const BY_ID = {};
  BANK.questions.forEach(q => { BY_ID[q.id] = q; });

  /* ---------------- storage ---------------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let stats = LS.get('pca.stats', { answered: 0, correct: 0 });
  let wrongBook = LS.get('pca.wrong', {});
  let edits = LS.get('pca.edits', {});
  let settings = LS.get('pca.settings', { showCn: false });
  const saveStats = () => LS.set('pca.stats', stats);
  const saveWrong = () => LS.set('pca.wrong', wrongBook);
  const saveEdits = () => LS.set('pca.edits', edits);
  const saveSettings = () => LS.set('pca.settings', settings);
  const AUTH_KEY = 'pca.auth';
  const DEMO_USERNAME = 'admin';
  const DEMO_PASSWORD = 'admin';

  /* ---------------- helpers ---------------- */
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function view(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $('#' + id).classList.remove('hidden');
    window.scrollTo({ top: 0 });
  }
  function isLoggedIn() { return LS.get(AUTH_KEY, null)?.loggedIn === true; }
  function showLogin() {
    clearInterval(timer);
    session = null;
    view('view-login');
    $('#login-username').focus();
  }
  function logout() {
    LS.set(AUTH_KEY, { loggedIn: false });
    showLogin();
  }
  function openModal(id) { $('#' + id).classList.remove('hidden'); }
  function closeModal(id) { $('#' + id).classList.add('hidden'); }

  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

  // apply local proofreading edits on top of original data
  function qView(q) {
    const e = edits[q.id];
    if (!e) return q;
    return {
      ...q,
      q: e.q != null ? e.q : q.q,
      ans: e.ans && e.ans.length ? e.ans : q.ans,
      opts: q.opts.map(o => ({ ...o, en: (e.opts && e.opts[o.k] != null) ? e.opts[o.k] : o.en }))
    };
  }
  const sameSet = (a, b) => a.length === b.length && a.slice().sort().join('') === b.slice().sort().join('');

  // Rewrite option references in the explanation after the content is
  // shuffled. This keeps the explanation's A/B/C/D references aligned with
  // the labels shown to the user.
  function remapAnalysis(text, keyMap) {
    return String(text || '')
      .replace(/(^|[\n\r])(\s*)([A-F])(?=\s*[.．、:：])/g,
        (_, start, space, key) => start + space + (keyMap.get(key) || key))
      .replace(/(答案|选择|选项)(\s*[:：]?\s*)([A-F])(?=\s*(?:[.．、]|\b))/g,
        (_, label, gap, key) => label + gap + (keyMap.get(key) || key));
  }

  // Shuffle option content, relabel it A/B/C/D, and carry the same mapping
  // into answers and explanation text.
  function shuffledQuestion(q) {
    const visibleOpts = shuffle(q.opts);
    const visibleKeys = visibleOpts.map((_, i) => String.fromCharCode(65 + i));
    const keyMap = new Map(visibleOpts.map((o, i) => [o.k, visibleKeys[i]]));
    return {
      ...q,
      opts: visibleOpts.map((o, i) => ({ ...o, k: visibleKeys[i] })),
      ans: q.ans.map(k => keyMap.get(k)).sort(),
      ana: remapAnalysis(q.ana, keyMap)
    };
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60), ss = s % 60;
    return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    $('#bank-total').textContent = BANK.questions.length;
    $('#stat-answered').textContent = stats.answered;
    $('#stat-acc').textContent = stats.answered ? Math.round(stats.correct / stats.answered * 100) + '%' : '--';
    $('#stat-wrong').textContent = Object.keys(wrongBook).length;

    const grid = $('#topic-grid');
    grid.innerHTML = '';
    BANK.topics.forEach(t => {
      const b = el('button', 'topic-item');
      b.innerHTML = '<span class="t-label">' + esc(t.label) + '</span><span class="t-count">' + t.count + ' 题</span>';
      b.addEventListener('click', () => startSession('topic', t.count, t.id));
      grid.appendChild(b);
    });

    $('#set-showcn').checked = !!settings.showCn;
  }

  /* ---------------- session ---------------- */
  let session = null;      // { mode, param, ids, idx, results:{}, start, locked, sel:Set, revealed }
  let timer = null;

  function startSession(mode, n, param) {
    let pool;
    if (mode === 'random') {
      pool = shuffle(BANK.questions);
      pool = (n === 'all' || !n) ? pool : pool.slice(0, Math.min(n, pool.length));
    } else if (mode === 'topic') {
      pool = BANK.questions.filter(q => q.topic === param);
    } else if (mode === 'wrong') {
      const ids = Object.keys(wrongBook).filter(id => BY_ID[id]);
      if (!ids.length) { alert('错题本是空的，先去练习吧！'); return; }
      pool = shuffle(ids.map(id => BY_ID[id]));
    }
    session = {
      mode, param, ids: pool.map(q => q.id), idx: 0, results: {}, picks: {},
      displayQs: {}, start: Date.now(), locked: false, sel: new Set(), revealed: false
    };
    $('#btn-show-ana').classList.add('hidden');
    $('#btn-submit').disabled = true;
    view('view-practice');
    renderQuestion();
    startTimer();
  }

  function startTimer() {
    clearInterval(timer);
    const tick = () => { if (session) $('#pill-time').textContent = fmtTime(Date.now() - session.start); };
    tick();
    timer = setInterval(tick, 1000);
  }

  function renderQuestion() {
    const id = session.ids[session.idx];
    const baseQ = qView(BY_ID[id]);
    const q = shuffledQuestion(baseQ);
    session.displayQs[id] = q;
    session.locked = false; session.sel = new Set(); session.revealed = false;

    // top bar
    $('#pill-index').textContent = (session.idx + 1) + ' / ' + session.ids.length;
    let nc = 0, nw = 0;
    Object.values(session.results).forEach(r => r ? nc++ : nw++);
    $('#pill-correct').textContent = '✓ ' + nc;
    $('#pill-wrong').textContent = '✗ ' + nw;
    $('#progress-bar').style.width = (session.idx / session.ids.length * 100) + '%';

    // meta
    $('#q-source').textContent = 'Topic ' + q.topic + ' · Question #' + q.num;
    $('#q-multi').classList.toggle('hidden', !q.multi);
    const caseBtn = $('#btn-case');
    caseBtn.classList.add('hidden');
    if (q.cs && BANK.caseStudies[q.cs]) {
      caseBtn.classList.remove('hidden');
      caseBtn.dataset.cs = q.cs;
    }

    // question
    $('#q-text').textContent = q.q;
    const cnBox = $('#q-text-cn');
    cnBox.textContent = q.qCn || '';
    cnBox.classList.toggle('hidden', !(settings.showCn && q.qCn));

    // options
    const ul = $('#options');
    ul.className = 'options';
    ul.innerHTML = '';
    q.opts.forEach(o => {
      const li = el('li', 'opt');
      li.dataset.k = o.k;
      let html = '<span class="key">' + o.k + '</span><span class="txt">' + esc(o.en);
      if (settings.showCn && o.cn) html += '<span class="cn">' + esc(o.cn) + '</span>';
      html += '</span><span class="mark"></span>';
      li.innerHTML = html;
      li.addEventListener('click', () => toggleOption(o.k));
      ul.appendChild(li);
    });

    // buttons
    $('#feedback').classList.add('hidden');
    $('#btn-submit').classList.remove('hidden');
    $('#btn-submit').disabled = true;
    $('#btn-submit').textContent = '提交答案';
    $('#btn-next').classList.add('hidden');
    $('#btn-show-ana').classList.add('hidden');
  }

  function toggleOption(k) {
    if (session.locked) return;
    const q = session.displayQs[session.ids[session.idx]];
    if (q.multi) {
      if (session.sel.has(k)) session.sel.delete(k); else session.sel.add(k);
    } else {
      session.sel.clear(); session.sel.add(k);
    }
    document.querySelectorAll('#options .opt').forEach(li => li.classList.toggle('selected', session.sel.has(li.dataset.k)));
    $('#btn-submit').disabled = session.sel.size === 0;
  }

  function submitAnswer() {
    if (session.locked) return;
    const q = session.displayQs[session.ids[session.idx]];
    const sel = Array.from(session.sel).sort();
    const correct = sameSet(sel, q.ans);
    session.locked = true;
    session.results[q.id] = correct;
    session.picks[q.id] = sel;

    stats.answered++; if (correct) stats.correct++; saveStats();
    if (correct) { if (wrongBook[q.id]) { delete wrongBook[q.id]; saveWrong(); } }
    else { wrongBook[q.id] = (wrongBook[q.id] || 0) + 1; saveWrong(); }

    // paint options
    document.querySelectorAll('#options .opt').forEach(li => {
      const k = li.dataset.k;
      li.classList.remove('selected');
      const mark = li.querySelector('.mark');
      if (q.ans.includes(k)) { li.classList.add('correct'); if (mark) mark.textContent = '正确答案'; }
      else if (session.sel.has(k)) { li.classList.add('wrong'); if (mark) mark.textContent = '你的选择'; }
    });
    document.querySelector('#options').classList.add('locked');

    // counts
    let nc = 0, nw = 0; Object.values(session.results).forEach(r => r ? nc++ : nw++);
    $('#pill-correct').textContent = '✓ ' + nc;
    $('#pill-wrong').textContent = '✗ ' + nw;
    $('#progress-bar').style.width = ((session.idx + 1) / session.ids.length * 100) + '%';

    // feedback
    const fb = $('#feedback');
    const head = $('#fb-head');
    head.className = 'fb-head ' + (correct ? 'ok' : 'bad');
    head.textContent = correct
      ? '回答正确 ✓ 正确答案：' + q.ans.join('')
      : '回答错误 ✗ 正确答案：' + q.ans.join('') + '　你的选择：' + sel.join('');
    $('#fb-ana').textContent = q.ana || '（本题暂无解析）';
    fb.classList.toggle('hidden', !correct ? false : true); // wrong -> auto show

    // buttons
    $('#btn-submit').classList.add('hidden');
    const isLast = session.idx >= session.ids.length - 1;
    const nb = $('#btn-next');
    nb.classList.remove('hidden');
    nb.textContent = isLast ? '查看结果 →' : '下一题 →';
    const sa = $('#btn-show-ana');
    sa.classList.toggle('hidden', !correct);
  }

  function showAna() {
    $('#feedback').classList.remove('hidden');
    $('#btn-show-ana').classList.add('hidden');
  }

  function nextQuestion() {
    if (session.idx >= session.ids.length - 1) { finish(); return; }
    session.idx++;
    renderQuestion();
  }

  function finish() {
    clearInterval(timer);
    const total = session.ids.length;
    let correct = 0; const wrongList = [];
    session.ids.forEach(id => {
      const ok = session.results[id];
      if (ok) correct++;
      else wrongList.push(id);
    });
    const pct = total ? Math.round(correct / total * 100) : 0;
    $('#score-pct').textContent = pct + '%';
    $('#score-ring').style.setProperty('--deg', (pct * 3.6) + 'deg');
    $('#score-ring').style.background = 'conic-gradient(' +
      (pct >= 80 ? 'var(--ok)' : pct >= 60 ? '#e2a33c' : 'var(--bad)') + ' 0deg, ' +
      (pct >= 80 ? 'var(--ok)' : pct >= 60 ? '#e2a33c' : 'var(--bad)') + ' ' + (pct * 3.6) + 'deg, #e9eef6 ' + (pct * 3.6) + 'deg)';
    $('#result-title').textContent = pct >= 80 ? '太棒了，通过线就在眼前 🎉' : pct >= 60 ? '继续加油，还差一点 💪' : '基础还需巩固 📖';
    $('#result-sub').textContent = '共 ' + total + ' 题，答对 ' + correct + ' 题';
    $('#r-correct').textContent = correct;
    $('#r-wrong').textContent = wrongList.length;
    $('#r-time').textContent = fmtTime(Date.now() - session.start);

    const wrap = $('#wrong-review'), list = $('#wrong-list');
    list.innerHTML = '';
    if (!wrongList.length) { wrap.classList.add('hidden'); }
    else {
      wrap.classList.remove('hidden');
      wrongList.forEach(id => {
        const q = session.displayQs[id] || qView(BY_ID[id]);
        const item = el('div', 'wrong-item');
        const mine = (session.picks[id] || []).join('');
        let html = '<div class="w-meta">Topic ' + q.topic + ' · Question #' + q.num + '</div>';
        html += '<div class="w-q">' + esc(q.q.length > 240 ? q.q.slice(0, 240) + '…' : q.q) + '</div>';
        html += '<div class="w-ans">正确答案：<span class="ok">' + q.ans.join('') + '</span>' +
                (mine ? '　你的选择：<span class="bad">' + esc(mine) + '</span>' : '') + '</div>';
        html += '<details><summary>查看中文解析</summary><div class="w-ana">' + esc(q.ana) + '</div></details>';
        item.innerHTML = html;
        list.appendChild(item);
      });
    }
    view('view-result');
  }

  /* ---------------- case study ---------------- */
  function showCase(name) {
    const cs = BANK.caseStudies[name];
    if (!cs) return;
    $('#case-title').textContent = '案例背景 · ' + name;
    let html = '<div class="ana">' + esc(cs.en) + '</div>';
    if (cs.cn) html += '<div class="q-cn">' + esc(cs.cn) + '</div>';
    $('#case-body').innerHTML = html;
    openModal('modal-case');
  }

  /* ---------------- edit / proofread ---------------- */
  let editTarget = null;
  function openEdit() {
    const id = session.ids[session.idx];
    editTarget = id;
    const q = qView(BY_ID[id]);
    $('#edit-q').value = q.q;
    const box = $('#edit-opts'); box.innerHTML = '';
    q.opts.forEach(o => {
      const row = el('div', 'edit-opt-row');
      row.innerHTML = '<span class="k">' + o.k + '</span>';
      const inp = el('input', 'edit-opt-input'); inp.value = o.en; inp.dataset.k = o.k;
      row.appendChild(inp); box.appendChild(row);
    });
    const ac = $('#edit-ans'); ac.innerHTML = '';
    q.opts.forEach(o => {
      const l = el('label');
      l.innerHTML = '<input type="checkbox" value="' + o.k + '"' + (q.ans.includes(o.k) ? ' checked' : '') + '> ' + o.k;
      ac.appendChild(l);
    });
    openModal('modal-edit');
  }
  function saveEdit() {
    const id = editTarget;
    const opts = {};
    $('#edit-opts').querySelectorAll('input').forEach(i => { opts[i.dataset.k] = i.value.trim(); });
    const ans = Array.from($('#edit-ans').querySelectorAll('input:checked')).map(i => i.value);
    if (!ans.length) { alert('请至少勾选一个正确答案'); return; }
    edits[id] = { q: $('#edit-q').value.trim(), opts, ans };
    saveEdits();
    closeModal('modal-edit');
    renderQuestion();   // re-render with fixes applied
  }
  function resetEdit() {
    if (!editTarget) return;
    delete edits[editTarget]; saveEdits();
    closeModal('modal-edit');
    renderQuestion();
  }

  /* ---------------- events ---------------- */
  document.querySelectorAll('#random-chips .chip').forEach(b => {
    b.addEventListener('click', () => startSession('random', b.dataset.n === 'all' ? 'all' : parseInt(b.dataset.n, 10)));
  });
  $('#btn-wrong').addEventListener('click', () => startSession('wrong'));
  $('#btn-wrong2').addEventListener('click', () => startSession('wrong'));
  $('#btn-clear').addEventListener('click', () => {
    if (!confirm('确定清空错题本与练习统计吗？')) return;
    stats = { answered: 0, correct: 0 }; wrongBook = {};
    saveStats(); saveWrong(); renderHome();
  });
  $('#set-showcn').addEventListener('change', e => { settings.showCn = e.target.checked; saveSettings(); });
  $('#btn-logout').addEventListener('click', () => {
    if (confirm('确定退出登录吗？')) logout();
  });
  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const error = $('#login-error');
    if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
      LS.set(AUTH_KEY, { loggedIn: true, username: DEMO_USERNAME });
      error.classList.add('hidden');
      $('#login-password').value = '';
      renderHome();
      view('view-home');
    } else {
      error.classList.remove('hidden');
      $('#login-password').select();
    }
  });

  $('#btn-exit').addEventListener('click', () => {
    if (!session) return view('home');
    if (confirm('确定退出本次练习？进度不会保存。')) { clearInterval(timer); session = null; renderHome(); view('view-home'); }
  });
  $('#btn-submit').addEventListener('click', submitAnswer);
  $('#btn-next').addEventListener('click', nextQuestion);
  $('#btn-show-ana').addEventListener('click', showAna);
  $('#btn-case').addEventListener('click', e => showCase(e.currentTarget.dataset.cs));
  $('#btn-edit').addEventListener('click', openEdit);
  $('#btn-edit-save').addEventListener('click', saveEdit);
  $('#btn-edit-reset').addEventListener('click', resetEdit);

  $('#btn-retry').addEventListener('click', () => startSession(session.mode, session.mode === 'random' ? (session.ids.length >= BANK.questions.length ? 'all' : session.ids.length) : null, session.param));
  $('#btn-home').addEventListener('click', () => { renderHome(); view('view-home'); });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    if ($('#view-practice').classList.contains('hidden')) return;
    if (e.key === 'Enter') {
      if (!$('#btn-submit').classList.contains('hidden') && !$('#btn-submit').disabled) submitAnswer();
      else if (!$('#btn-next').classList.contains('hidden')) nextQuestion();
    }
    const map = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', f: 'F' };
    if (map[e.key.toLowerCase()]) toggleOption(map[e.key.toLowerCase()]);
  });

  /* ---------------- boot ---------------- */
  if (isLoggedIn()) { renderHome(); view('view-home'); }
  else showLogin();
})();
