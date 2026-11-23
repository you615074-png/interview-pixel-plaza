/* 界面层：身份选择、职业公告板、岗位详情、模拟面试（双视角）、解析报告、成果展馆、导览、数据说明。
 * 所有岗位与问答都来自 js/real-data.js（真实复盘，已去标识化）。 */
const UI = (function () {
  const $ = sel => document.querySelector(sel);
  const panel = $('#panel');
  const panelBody = $('#panel-body');
  const panelTitle = $('#panel-title');
  const roleBadge = $('#role-badge');
  const PASS = 3.8, WATCH = 3.0, CLOSE = 1.0;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式下忽略 */ } }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jobById = id => JOBS.find(j => j.id === id);
  const interviewable = job => job.items.some(it => it.qa && it.qa.length);
  const round2 = x => Math.round(x * 100) / 100;
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const verdictOf = s => (s == null ? null : s >= PASS ? '能用' : s >= WATCH ? '待观察' : '不匹配');
  const verdictCls = v => (v === '能用' ? 'ok' : v === '待观察' ? 'warn' : v === '不匹配' ? 'bad' : '');

  // 权重归一化：复盘给了权重就用权重，没给就均分
  function wnorm(job) {
    const raw = job.items.map(it => (typeof it.weight === 'number' ? it.weight : 1));
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map(x => x / sum);
  }
  const pctW = (job, i) => Math.round(wnorm(job)[i] * 100);

  const S = {
    role: store.get('iq.role'),              // 'candidate' | 'interviewer'
    results: store.get('iq.results') || {},  // jobId -> 报告摘要
    last: store.get('iq.last'),              // 最近一份报告
    session: null                            // 进行中的模拟面试
  };

  /* ---------- 面板基础 ---------- */
  function open(title, html) {
    panelTitle.textContent = title;
    panelBody.innerHTML = html;
    panel.hidden = false;
    panelBody.scrollTop = 0;
    panelBody.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => route(el.dataset.go, el.dataset)));
  }
  function close() { panel.hidden = true; panelBody.innerHTML = ''; }
  const blocking = () => !panel.hidden || World.talking();
  const noData = () => `<p class="lead">真实数据还没有加载。请在本地运行 <code>python3 tools/build_real_data.py</code>，或等待线上版本部署完成。</p>`;

  function route(go, d) {
    if (go === 'careers') openCareers(d.cat);
    else if (go === 'job') openJob(d.id);
    else if (go === 'start') startInterview(d.id);
    else if (go === 'hall') openHall();
    else if (go === 'report') openReport();
    else if (go === 'data') openData();
    else if (go === 'showcase') openShowcase();
    else if (go === 'guide') openGuide();
    else if (go === 'role') pickRole(d.role);
    else if (go === 'close') close();
    else if (go === 'reveal') reveal();
    else if (go === 'rate') rate(Number(d.v));
    else if (go === 'next') nextQuestion();
    else if (go === 'copy') copyReport();
  }

  /* ---------- 身份 ---------- */
  const roleName = r => (r === 'interviewer' ? '面试官' : '候选人');
  function setRoleBadge() { roleBadge.textContent = S.role ? `视角：${roleName(S.role)}` : '视角：未选择'; }
  function pickRole(role) {
    if (S.session && S.session.role !== role) S.session = null;
    S.role = role;
    store.set('iq.role', role);
    setRoleBadge();
    const hint = role === 'interviewer'
      ? '好的，你现在是面试官。去模拟面试室，判断候选人的回答里有没有足够的证据，再和复盘的判断对照。'
      : '好的，你现在是候选人。去模拟面试室，回放真实的问答，看看复盘指出了哪些缺口和更优答法。';
    if (!panel.hidden) close();
    World.say('小助手', [hint]);
  }
  function openIdentity(first) {
    open('选择你的身份', `
      <p class="lead">${first ? '欢迎来到面试广场。' : ''}两种视角都基于同一批真实复盘，最后汇到同一张证据表上：</p>
      <div class="grid2">
        <button class="choice" data-go="role" data-role="candidate">
          <b>候选人</b>
          <span>回放真实的问答：看自己当时的回答、复盘的点评，以及更优的答法。</span>
        </button>
        <button class="choice" data-go="role" data-role="interviewer">
          <b>面试官</b>
          <span>看候选人的真实回答，自己给证据打分，再和复盘的判断对照。</span>
        </button>
      </div>`);
  }
  function toggleRole() {
    if (!S.role) return openIdentity(false);
    pickRole(S.role === 'candidate' ? 'interviewer' : 'candidate');
  }

  /* ---------- 职业公告板 ---------- */
  function openCareers(cat) {
    if (!REAL) return open('职业公告板', noData());
    const cats = ['全部', ...new Set(JOBS.map(j => j.category))];
    const current = cats.includes(cat) ? cat : '全部';
    const list = JOBS.filter(j => current === '全部' || j.category === current);
    open('职业公告板', `
      <p class="lead">每个岗位来自真实的复盘材料（已去标识化）。有问答记录的岗位可以模拟面试；其余岗位只能查看复盘里的证据与结论。</p>
      <div class="chips">${cats.map(c => `<button class="chip ${c === current ? 'on' : ''}" data-go="careers" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="cards">
        ${list.map(j => {
          const r = S.results[j.id];
          return `<button class="card" data-go="job" data-id="${esc(j.id)}">
            <div class="card-title">${esc(j.title)}</div>
            <div class="card-sub">${esc(j.org)}</div>
            <div class="tags">${j.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
            <div class="verdict-line ${verdictCls(j.verdict ? (j.verdict.indexOf('通过') >= 0 || j.verdict.indexOf('进入下一轮') >= 0 ? '能用' : j.verdict.indexOf('补充考察') >= 0 ? '待观察' : '') : '')}">${esc(j.verdict || '复盘结论待整理')}</div>
            <div class="card-foot">
              <span class="${interviewable(j) ? 'can' : 'view'}">${interviewable(j) ? '可模拟问答' : '仅查看复盘'}</span>
              <span class="${r ? 'score-tag' : ''}">${r ? `上次 ${r.pct}%` : ''}</span>
            </div>
          </button>`;
        }).join('')}
      </div>`);
  }

  /* ---------- 岗位详情 ---------- */
  function openJob(id) {
    const job = jobById(id);
    if (!job) return;
    const w = wnorm(job);
    const rows = job.items.map((it, i) => `<tr>
        <td><b>${esc(it.name)}</b><div class="muted">${esc(it.jd)}</div></td>
        <td>${Math.round(w[i] * 100)}%</td>
        <td>${esc(it.judgment || '复盘未给出单独判断')}</td>
        <td>${it.score == null ? '—' : `<span class="lv lv${Math.round(it.score)}">${it.score.toFixed(1)}</span>`}</td>
        <td>${esc(it.verify || '—')}</td>
      </tr>`).join('');
    open(job.title, `
      <div class="job-head">
        <div class="job-sub">${esc(job.category)} · ${esc(job.org)}</div>
        <div class="tags">${job.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <p><b>复盘结论：</b>${esc(job.verdict || '待整理')}</p>
        <p>${esc(job.conclusion)}</p>
      </div>
      ${job.jd.length
        ? `<h3>岗位要求（来自 JD）</h3><ul class="plain">${job.jd.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
        : '<p class="hint">复盘材料里没有该岗位的 JD 要点，这里只展示复盘结论。</p>'}
      ${job.items.length ? `
        <h3>证据项与复盘判断</h3>
        <p class="hint">权重来自复盘；没有给权重的岗位按均分计算。「复盘分」只在复盘给出评分或判断词时才会有数值。</p>
        <div class="table-wrap"><table class="evid">
          <thead><tr><th>能力项</th><th>权重</th><th>复盘判断</th><th>复盘分</th><th>仍需验证</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : ''}
      <div class="actions">
        ${interviewable(job)
          ? `<button class="btn primary" data-go="start" data-id="${esc(job.id)}">开始模拟面试（${esc(roleName(S.role || 'candidate'))}视角）</button>`
          : '<span class="hint">这个岗位的复盘没有整理成问答记录，只能查看证据与结论。</span>'}
        <button class="btn" data-go="careers">返回公告板</button>
      </div>`);
  }

  /* ---------- 模拟面试室 ---------- */
  function openHall() {
    if (S.session) return resumeSession();
    if (!REAL) return open('模拟面试室', noData());
    if (!S.role) return openIdentity(false);
    const list = JOBS.filter(interviewable);
    open('模拟面试室', `
      <p class="lead">当前视角：<b>${roleName(S.role)}</b>。
        <button class="link" data-go="role" data-role="${S.role === 'candidate' ? 'interviewer' : 'candidate'}">切换为${roleName(S.role === 'candidate' ? 'interviewer' : 'candidate')}</button></p>
      <p class="hint">只列出有真实问答记录的岗位。候选人视角回放当时的回答与更优答法；面试官视角自己打分，再对照复盘。</p>
      <div class="cards">
        ${list.map(j => {
          const n = j.items.reduce((a, it) => a + (it.qa ? it.qa.length : 0), 0);
          return `<button class="card" data-go="start" data-id="${esc(j.id)}">
            <div class="card-title">${esc(j.title)}</div>
            <div class="card-sub">${esc(j.org)}</div>
            <div class="card-foot"><span>${n} 道真实问答</span><span>${S.results[j.id] ? `上次 ${S.results[j.id].pct}%` : '未练习'}</span></div>
          </button>`;
        }).join('') || '<p class="hint">暂无可模拟的岗位。</p>'}
      </div>`);
  }

  /* ---------- 模拟面试 ---------- */
  function queueOf(job) {
    const q = [];
    job.items.forEach(it => (it.qa || []).forEach(qa => q.push({ item: it, qa })));
    return q;
  }
  function startInterview(id) {
    if (!S.role) return openIdentity(false);
    const job = jobById(id);
    if (!job || !interviewable(job)) return;
    S.session = { jobId: job.id, role: S.role, queue: queueOf(job), i: 0, phase: 'ask', ratings: {} };
    renderQuestion();
  }
  function resumeSession() {
    if (S.session.role !== S.role) { S.session = null; return openHall(); }
    renderQuestion();
  }
  const bubble = (who, text, cls) => `<div class="bubble ${cls || ''}"><div class="who">${esc(who)}</div><p>${esc(text)}</p></div>`;

  function renderQuestion() {
    const ss = S.session;
    const job = jobById(ss.jobId);
    const cur = ss.queue[ss.i];
    const it = cur.item, qa = cur.qa;
    const idx = job.items.indexOf(it);
    const head = `<div class="q-head">
      <div class="progress"><span>第 ${ss.i + 1} / ${ss.queue.length} 题</span><span class="muted">${esc(job.title)}</span></div>
      <div class="ev">证据项：<b>${esc(it.name)}</b>（权重 ${pctW(job, idx)}%）· 岗位要求：${esc(it.jd)}</div></div>`;
    const title = ss.role === 'candidate' ? '模拟面试 · 候选人视角' : '模拟面试 · 面试官视角';
    const q = bubble('周老师（面试官）', qa.q);
    const real = bubble('候选人（复盘记录的原始回答）', qa.answer, 'cand');
    const next = `<div class="actions"><button class="btn primary" data-go="next">${ss.i + 1 < ss.queue.length ? '下一题' : '生成解析报告'}</button></div>`;

    if (ss.role === 'candidate') {
      if (ss.phase === 'ask') {
        open(title, `${head}${q}${real}
          <p class="hint">这是复盘里记录的真实问答。先读一遍当时的回答，再看复盘的点评。</p>
          <div class="actions"><button class="btn primary" data-go="reveal">看复盘点评与更优答法</button></div>`);
      } else {
        open(title, `${head}${q}${real}
          <div class="feedback">
            <div class="who">复盘点评</div>
            <p><b>这一问想验证什么：</b>${esc(qa.verifies || '—')}</p>
            <p><b>现场问题：</b>${esc(qa.problem || '—')}</p>
            ${qa.better ? `<p class="better"><b>更优答法：</b>${esc(qa.better)}</p>` : ''}
            <p class="muted">仍需验证：${esc(it.verify || '—')}</p>
          </div>${next}`);
      }
      return;
    }

    // 面试官视角：先打分，再对照复盘
    if (ss.phase === 'ask') {
      open(title, `${head}${q}${real}
        <p class="hint">你作为面试官，给这条回答的证据打分（1–5）。</p>
        <div class="opts rate">
          ${[1, 2, 3, 4, 5].map(v => `<button class="opt" data-go="rate" data-v="${v}"><b>${v} 分</b> · ${['证据不足', '证据薄弱', '有一定证据待验证', '证据较充分', '证据充分（有数字、可核对）'][v - 1]}</button>`).join('')}
        </div>`);
    } else {
      const arr = ss.ratings[ss.lastKey] || [];
      const mine = arr.length ? arr[arr.length - 1] : 0;
      const rv = it.score;
      const gap = rv == null ? null : Math.abs(mine - rv);
      const verdictLine = rv == null
        ? '复盘没有给这一项打分，只有文字判断。'
        : gap <= CLOSE ? `✅ 与复盘分相差 ${gap.toFixed(1)} 分，判断接近。`
        : `⚠️ 与复盘分相差 ${gap.toFixed(1)} 分（复盘 ${rv.toFixed(1)} 分）。`;
      open(title, `${head}${q}${real}
        <div class="feedback">
          <div class="who">你的评分：${mine} 分 ｜ 复盘判断：${esc(it.judgment || '—')}</div>
          <p>${verdictLine}</p>
          <p><b>这一问想验证什么：</b>${esc(qa.verifies || '—')}</p>
          <p><b>现场问题：</b>${esc(qa.problem || '—')}</p>
          ${qa.better ? `<p class="better"><b>更优的证据：</b>${esc(qa.better)}</p>` : ''}
        </div>${next}`);
    }
  }

  function reveal() {
    S.session.phase = 'reveal';
    renderQuestion();
  }
  function rate(v) {
    const ss = S.session;
    const cur = ss.queue[ss.i];
    const id = cur.item.id;
    (ss.ratings[id] = ss.ratings[id] || []).push(v);
    ss.lastKey = id;
    ss.phase = 'reveal';
    renderQuestion();
  }
  function nextQuestion() {
    const ss = S.session;
    ss.phase = 'ask';
    if (ss.i + 1 < ss.queue.length) { ss.i++; renderQuestion(); return; }
    finishInterview();
  }

  function finishInterview() {
    const ss = S.session;
    const report = buildReport(ss);
    S.results[report.jobId] = { pct: report.pct, verdict: report.verdict, at: Date.now() };
    S.last = report;
    store.set('iq.results', S.results);
    store.set('iq.last', report);
    S.session = null;
    openReport();
  }

  /* ---------- 解析报告 ---------- */
  function buildReport(ss) {
    const job = jobById(ss.jobId);
    const w = wnorm(job);
    let rs = 0, rw = 0, us = 0, uw = 0, hit = 0, cmp = 0;
    const rows = job.items.map((it, i) => {
      const rated = ss.ratings[it.id];
      const userAvg = rated && rated.length ? avg(rated) : null;
      if (it.score != null) {
        rs += w[i] * it.score; rw += w[i];
        if (userAvg != null) { cmp++; if (Math.abs(userAvg - it.score) <= CLOSE) hit++; }
      }
      const useScore = userAvg != null ? userAvg : it.score;
      if (useScore != null) { us += w[i] * useScore; uw += w[i]; }
      return {
        id: it.id, name: it.name, w: Math.round(w[i] * 100), jd: it.jd,
        judgment: it.judgment || '复盘未给出单独判断', verify: it.verify || '',
        reviewer: it.score, basis: it.score_basis || null, user: userAvg,
        answer: it.qa && it.qa[0] ? it.qa[0].answer : null
      };
    });
    const reviewer = rw ? round2(rs / rw) : null;
    const userScore = uw ? round2(us / uw) : null;
    const main = ss.role === 'interviewer' ? (userScore != null ? userScore : reviewer) : reviewer;
    return {
      jobId: job.id, title: job.title, org: job.org, mode: ss.role,
      reviewer, userScore, verdict: verdictOf(main), reviewerLabel: verdictOf(reviewer), reviewerVerdict: job.verdict || '',
      pct: main == null ? null : Math.round((main / 5) * 100),
      rows, accuracy: ss.role === 'interviewer' ? { hit, total: cmp } : null,
      source: job.source || REAL.meta.source, at: Date.now()
    };
  }
  function weakest(r) {
    const scored = r.rows.filter(x => (x.user != null ? x.user : x.reviewer) != null);
    if (!scored.length) return null;
    return scored.slice().sort((a, b) => (a.user != null ? a.user : a.reviewer) - (b.user != null ? b.user : b.reviewer))[0];
  }
  function interviewerConclusion(r) {
    const s = r.mode === 'interviewer' && r.userScore != null ? r.userScore : r.reviewer;
    if (s == null) return '复盘没有给出数值分，只能看文字判断。';
    const wk = weakest(r);
    const tail = wk ? `最弱的证据项是「${wk.name}」。` : '';
    if (r.verdict === '能用') return `得分 ${s.toFixed(2)}，达到能用线（≥${PASS}）。${tail}`;
    if (r.verdict === '待观察') return `得分 ${s.toFixed(2)}，处于待观察区间（${WATCH}–${PASS}），建议补充证据后再判断。${tail}`;
    return `得分 ${s.toFixed(2)}，低于 ${WATCH}，目前证据不足以支持进入下一轮。${tail}`;
  }
  function candidateConclusion(r) {
    const gaps = r.rows.filter(x => x.reviewer == null || x.reviewer < 4);
    if (!gaps.length) return '复盘给出的证据基本齐全。下一轮可以挑战更高难度的追问，重点放在细节的可核查性上。';
    return `还需要补的证据：<ul>${gaps.map(g => `<li><b>${esc(g.name)}</b>：${esc(g.verify || g.judgment)}</li>`).join('')}</ul>`;
  }

  function openReport() {
    const r = S.last;
    if (!r) {
      return open('报告馆', `<p class="lead">这里还没有报告。先去模拟面试室完成一次问答，再回来看看。</p>
        <div class="actions"><button class="btn primary" data-go="hall">去模拟面试室</button></div>`);
    }
    const title = r.title;
    const verdictHtml = r.mode === 'interviewer'
      ? `<span class="verdict ${verdictCls(r.verdict)}">你的结论：${esc(r.verdict || '—')}</span> <span class="verdict ${verdictCls(r.reviewerLabel)}">复盘结论：${esc(r.reviewerLabel || '—')}</span>`
      : `<span class="verdict ${verdictCls(r.reviewerLabel)}">结论：${esc(r.reviewerLabel || '—')}</span>`;
    open('解析报告', `
      <div class="report-top">
        <div class="score-big">${r.reviewer == null ? '—' : r.reviewer.toFixed(2)}<small> / 5</small></div>
        <div>
          <div class="report-title">${esc(title)}</div>
          <div class="muted">复盘得分 · ${esc(r.org)}</div>
          ${r.mode === 'interviewer' && r.userScore != null ? `<div class="muted">你的评分：<b>${r.userScore.toFixed(2)}</b> / 5</div>` : ''}
          ${verdictHtml}
          ${r.reviewerVerdict ? `<div class="muted">复盘原结论：${esc(r.reviewerVerdict)}</div>` : ''}
        </div>
      </div>
      ${r.accuracy && r.accuracy.total ? `<p class="hint">判断与复盘分一致（相差不超过 ${CLOSE} 分）：${r.accuracy.hit} / ${r.accuracy.total} 项</p>` : ''}

      <h3>分项对照</h3>
      <div class="table-wrap"><table class="evid">
        <thead><tr><th>能力项</th><th>权重</th><th>复盘判断</th><th>复盘分</th>${r.mode === 'interviewer' ? '<th>你的评分</th>' : ''}</tr></thead>
        <tbody>${r.rows.map(x => `<tr>
          <td><b>${esc(x.name)}</b></td>
          <td>${x.w}%</td>
          <td>${esc(x.judgment)}${x.basis ? `<div class="muted">${esc(x.basis)}</div>` : ''}</td>
          <td>${x.reviewer == null ? '—' : `<span class="lv lv${Math.round(x.reviewer)}">${x.reviewer.toFixed(1)}</span>`}</td>
          ${r.mode === 'interviewer' ? `<td>${x.user == null ? '—' : x.user.toFixed(1)}</td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>

      <h3>证据对照表</h3>
      <p class="hint">岗位要求 ↔ 候选人给出的证据 ↔ 复盘的命中判断。两种视角都使用这张表。</p>
      <div class="table-wrap"><table class="evid">
        <thead><tr><th>岗位要求</th><th>候选人证据（复盘记录）</th><th>命中</th></tr></thead>
        <tbody>${r.rows.map(x => `<tr><td>${esc(x.jd)}</td><td>${esc(x.answer || '（复盘未记录该项的原始回答）')}</td><td>${esc(x.judgment)}</td></tr>`).join('')}</tbody>
      </table></div>

      <div class="two-col">
        <div class="panel-box">
          <h4>面试官视角</h4>
          <p><b>${esc(r.verdict || '—')}</b></p>
          <p>${esc(interviewerConclusion(r))}</p>
        </div>
        <div class="panel-box">
          <h4>候选人视角</h4>
          <div>${candidateConclusion(r)}</div>
        </div>
      </div>

      <h3>可追溯说明</h3>
      <div class="src">
        <p>结论基于：${esc(r.source)}</p>
        <p>评分口径：有复盘原始评分的直接使用；只有判断词的，按「证据较充分=4、有一定证据待验证=3」映射（见数据说明）。</p>
        <p>本报告只用于练习，不代表任何企业的录用结果。</p>
      </div>

      <div class="actions">
        <button class="btn" data-go="copy">复制文字成绩单</button>
        <button class="btn" data-go="hall">再练一次</button>
        <button class="btn" data-go="careers">返回公告板</button>
      </div>
      <p class="copy-tip" id="copy-tip"></p>`);
  }

  function reportText(r) {
    const lines = [
      `【面试成绩单】${r.title}（${r.org}）`,
      `视角：${roleName(r.mode)}　复盘得分：${r.reviewer == null ? '—' : r.reviewer.toFixed(2)} / 5　结论：${r.verdict || '—'}`,
      r.userScore != null && r.mode === 'interviewer' ? `你的评分：${r.userScore.toFixed(2)} / 5` : '',
      '',
      '分项：',
      ...r.rows.map(x => `- ${x.name}（权重${x.w}%）：复盘 ${x.reviewer == null ? '—' : x.reviewer.toFixed(1)} · ${x.judgment}`),
      '',
      `面试官结论：${interviewerConclusion(r)}`,
      `数据来源：${r.source}`
    ].filter(x => x !== '');
    return lines.join('\n');
  }
  function copyReport() {
    const tip = document.getElementById('copy-tip');
    const text = reportText(S.last);
    const done = () => { if (tip) tip.textContent = '已复制到剪贴板。'; };
    const fail = () => { if (tip) tip.textContent = '复制失败，请手动选择文字。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }

  /* ---------- 成果展馆 ---------- */
  const PILL = { '已完成': 'ok', '进行中': 'doing', '待办': 'todo', '已定': 'ok', '待定': 'todo' };
  const pillCls = s => { for (const k of Object.keys(PILL)) if (String(s).indexOf(k) === 0) return PILL[k]; return 'todo'; };
  function openShowcase() {
    if (!REAL) return open('成果展馆', noData());
    const R = REAL.requirements;
    const interviewCount = JOBS.filter(interviewable).length;
    open('成果展馆', `
      <p class="lead">这里展示需求落定的结果、从复盘里整理出的总结，以及网站和项目的进度。</p>
      <div class="stat-row">
        <div class="stat"><b>${JOBS.length}</b><span>真实岗位</span></div>
        <div class="stat"><b>${interviewCount}</b><span>可模拟问答</span></div>
        <div class="stat"><b>${JOBS.length - interviewCount}</b><span>仅查看复盘</span></div>
      </div>

      <h3>🧭 需求落定（来自需求文档）</h3>
      <blockquote class="quote">${esc(R.one_liner)}</blockquote>
      <p class="hint">${esc(R.question)}</p>
      <div class="cards2">${R.deliverables.map(x => `<div class="mini"><b>${esc(x.t)}</b><span class="pill ${pillCls(x.status)}">${esc(x.status)}</span><p>${esc(x.d)}</p></div>`).join('')}</div>
      <h3>数据怎么来</h3>
      <ol class="steps">${R.pipeline.map(x => `<li><b>${esc(x.t)}：</b>${esc(x.d)}</li>`).join('')}</ol>
      <h3>还没拍板的问题</h3>
      <ul class="todo-list">${R.open_questions.map(x => `<li><span class="pill ${pillCls(x.status)}">${esc(x.status)}</span><div><p>${esc(x.t)}</p></div></li>`).join('')}</ul>
      <h3>待办</h3>
      <ul class="todo-list">${R.todo.map(x => `<li><span class="pill ${pillCls(x.status)}">${esc(x.status)}</span><div><b>${esc(x.t)}</b><p>负责人：${esc(x.owner)}</p></div></li>`).join('')}</ul>
      <p class="hint">${esc(R.mvp)}</p>

      <h3>🪞 复盘总结（通用经验）</h3>
      <div class="cards2">${REAL.lessons.map(x => `<div class="mini"><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>`).join('')}</div>
      <h3>改进计划</h3>
      <div class="cards2">${REAL.plan.map(p => `<div class="mini"><b>${esc(p.period)}</b><ul class="plain">${p.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>

      <h3>✅ 网站进度</h3>
      <div class="cards2">${PROJECT_DONE.map(x => `<div class="mini done"><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>`).join('')}</div>

      <div class="actions">
        <button class="btn primary" data-go="hall">去模拟面试室</button>
        <button class="btn" data-go="careers">看职业公告板</button>
        <button class="btn" data-go="data">数据说明</button>
      </div>`);
  }

  /* ---------- 广场导览 ---------- */
  function openGuide() {
    const card = k => `<div class="mini"><b>${esc(ROOMS[k].name)}</b><span class="tagline">${esc(ROOMS[k].short)}</span><p>${esc(ROOMS[k].desc)}</p></div>`;
    open('广场导览', `
      <p class="lead">每个房间和角色是做什么的，都写在这里，也写在地图上的木牌里。走到门口或身边，按 E（手机按 A）就能进入。</p>
      <h3>建筑与设施</h3>
      <div class="cards2">${['board', 'hall', 'report', 'showcase', 'sign'].map(card).join('')}</div>
      <h3>广场里的角色</h3>
      <div class="cards2">${['teacher', 'guide', 'curator'].map(card).join('')}</div>`);
  }

  /* ---------- 数据说明 ---------- */
  function openData() {
    const m = REAL ? REAL.meta : null;
    open('数据说明', `
      <h3>数据从哪来</h3>
      <ul class="plain">
        <li>${esc(m ? m.source : '真实数据尚未加载')}</li>
        <li>${esc(m ? m.privacy : '')}</li>
        <li>${esc(m ? m.note : '')}</li>
      </ul>
      <h3>数据怎么来（三步流水线）</h3>
      <ol class="steps">${REAL ? REAL.requirements.pipeline.map(x => `<li><b>${esc(x.t)}：</b>${esc(x.d)}</li>`).join('') : ''}</ol>
      <h3>评分规则</h3>
      <ul class="plain">
        <li>有复盘原始评分的（如需求分析 4.0、项目真实性 3.5）直接使用。</li>
        <li>只有判断词的，映射为分数：「证据较充分」= 4，「有一定证据待验证」= 3。没有判断的不打分。</li>
        <li>模拟面试里，面试官视角的评分与复盘分相差不超过 1 分，记为判断接近。</li>
        <li>总分 = Σ（能力项分数 × 权重）÷ Σ 权重。≥ 3.8 为「能用」，3.0–3.8 为「待观察」，< 3.0 为「不匹配」。</li>
      </ul>
      <h3>本站没有放什么</h3>
      <ul class="plain">
        <li>候选人姓名、学校、雇主、联系方式、会议链接与密码。</li>
        <li>原始 Word / Markdown 文件，以及生成的数据文件本身（不进入代码仓库）。</li>
      </ul>
      <h3>素材与致谢</h3>
      <ul class="plain">
        <li>像素地图与建筑：<a href="https://kenney.nl/assets/tiny-town" target="_blank" rel="noopener">Kenney Tiny Town</a>；角色与 NPC：<a href="https://kenney.nl/assets/tiny-dungeon" target="_blank" rel="noopener">Kenney Tiny Dungeon</a>；花丛、篝火、市集棚等装饰：<a href="https://opengameart.org/content/roguelikerpg-pack-1700-tiles" target="_blank" rel="noopener">Kenney Roguelike/RPG Pack</a>。以上均为 CC0 1.0。</li>
        <li>风格参考星露谷物语的田园像素风，本站未使用星露谷官方素材。</li>
      </ul>`);
  }

  /* ---------- 顶部按钮 ---------- */
  function bindHud() {
    $('#btn-role').addEventListener('click', toggleRole);
    $('#btn-data').addEventListener('click', openData);
    $('#btn-board').addEventListener('click', () => openCareers());
    $('#btn-showcase').addEventListener('click', () => openShowcase());
    $('#btn-guide').addEventListener('click', () => openGuide());
    $('#btn-music').addEventListener('click', e => {
      const on = Music.toggle();
      e.currentTarget.textContent = on ? '♪ 音乐开' : '♪ 音乐关';
      e.currentTarget.setAttribute('aria-pressed', on);
    });
    $('#panel-close').addEventListener('click', close);
    panel.addEventListener('click', e => { if (e.target === panel) close(); });
  }

  function init() {
    bindHud();
    setRoleBadge();
    if (!REAL) World.say('小助手', ['真实数据还没有加载。线上版本部署完成后，这里会显示真实的岗位与复盘。']);
    else if (!S.role) setTimeout(() => openIdentity(true), 400);
  }
  document.addEventListener('DOMContentLoaded', init);

  return { open, close, blocking, openCareers, openJob, openHall, openReport, openData, openShowcase, openGuide, startInterview, toggleRole };
})();
