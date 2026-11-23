/* 界面层：身份选择、职业列表、岗位详情（匹配机制）、模拟面试（双视角）、解析报告、数据说明。 */
const UI = (function () {
  const $ = sel => document.querySelector(sel);
  const panel = $('#panel');
  const panelBody = $('#panel-body');
  const panelTitle = $('#panel-title');
  const roleBadge = $('#role-badge');
  const PASS = 3.8, WATCH = 3.0;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式下忽略 */ } }
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jobById = id => JOBS.find(j => j.id === id);

  const S = {
    role: store.get('iq.role'),          // 'candidate' | 'interviewer'
    results: store.get('iq.results') || {}, // jobId -> 报告摘要
    last: store.get('iq.last'),          // 最近一份完整报告
    session: null                        // 进行中的模拟面试
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
    else if (go === 'answer') answer(Number(d.i));
    else if (go === 'rate') rate(Number(d.level));
    else if (go === 'next') nextQuestion();
    else if (go === 'finish') finishInterview();
    else if (go === 'copy') copyReport();
    else if (go === 'reset') { S.session = null; openHall(); }
  }

  /* ---------- 身份 ---------- */
  function roleName(r) { return r === 'interviewer' ? '面试官' : '候选人'; }
  function setRoleBadge() { roleBadge.textContent = S.role ? `视角：${roleName(S.role)}` : '视角：未选择'; }
  function pickRole(role) {
    if (S.session && S.session.role !== role) S.session = null;
    S.role = role;
    store.set('iq.role', role);
    setRoleBadge();
    const hint = role === 'interviewer'
      ? '好的，你现在是面试官。去模拟面试室，判断候选人的回答里有没有足够的证据。'
      : '好的，你现在是候选人。去职业公告板看清任职要求，再到模拟面试室作答。';
    if (!panel.hidden) close();
    World.say('小助手', [hint]);
  }
  function openIdentity(first) {
    open('选择你的身份', `
      <p class="lead">${first ? '欢迎来到面试广场。' : ''}本站的问答有两种视角，最后都会汇到同一张证据表上：</p>
      <div class="grid2">
        <button class="choice" data-go="role" data-role="candidate">
          <b>候选人</b>
          <span>面试官会问你问题。你要用经历、数据和判断，证明自己符合岗位要求。</span>
        </button>
        <button class="choice" data-go="role" data-role="interviewer">
          <b>面试官</b>
          <span>候选人会回答。你要判断每个回答里的证据够不够，并给出能用 / 待观察 / 不匹配的结论。</span>
        </button>
      </div>`);
  }
  function toggleRole() {
    if (!S.role) return openIdentity(false);
    pickRole(S.role === 'candidate' ? 'interviewer' : 'candidate');
  }

  /* ---------- 职业列表 ---------- */
  function openCareers(cat) {
    const cats = ['全部', ...new Set(JOBS.map(j => j.category))];
    const current = cat && cats.includes(cat) ? cat : '全部';
    const list = JOBS.filter(j => current === '全部' || j.category === current);
    open('职业公告板', `
      <p class="lead">岗位任职要求会被拆成「证据项」。面试回答命中哪一项，匹配度才会上升。</p>
      <div class="chips">${cats.map(c => `<button class="chip ${c === current ? 'on' : ''}" data-go="careers" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="cards">
        ${list.map(j => {
          const r = S.results[j.id];
          return `<button class="card" data-go="job" data-id="${j.id}">
            <div class="card-title">${esc(j.title)}</div>
            <div class="card-sub">${esc(j.sub)}</div>
            <div class="tags">${j.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
            <div class="card-foot">
              <span>${esc(j.source.type)}</span>
              <span class="${r ? 'score-tag' : ''}">${r ? `上次匹配 ${r.pct}%` : '尚未练习'}</span>
            </div>
          </button>`;
        }).join('')}
      </div>`);
  }

  /* ---------- 岗位详情：技能要求与匹配机制 ---------- */
  function jobMatch(job) {
    const r = S.results[job.id];
    return r ? r.pct : null;
  }
  function openJob(id) {
    const job = jobById(id);
    if (!job) return;
    const r = S.results[id];
    const reqRows = job.dims.map(d => {
      const got = r ? r.rows.find(x => x.id === d.id) : null;
      const status = got
        ? `<span class="hit lv${got.level}">${LEVEL_LABEL[got.level]}</span>`
        : '<span class="hit lv0">尚未收集证据</span>';
      return `<li>
        <div class="req-head"><b>${esc(d.name)}</b><em>权重 ${d.weight}%</em></div>
        <div class="req-jd">要求：${esc(d.jd)}</div>
        <div class="req-state">${status}</div>
      </li>`;
    }).join('');
    open(job.title, `
      <div class="job-head">
        <div class="job-sub">${esc(job.sub)} · ${esc(job.company)}</div>
        <p>${esc(job.summary)}</p>
        <div class="tags">${job.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="src">数据来源：${esc(job.source.type)}。${esc(job.source.detail)}</div>
      </div>
      <h3>任职要求 → 证据项（匹配机制）</h3>
      <p class="hint">每条要求对应一个证据项，权重加总为 100%。面试中，每题只会针对一个证据项提问；命中越充分，分数越高。</p>
      <div class="match-bar"><div style="width:${jobMatch(job) ?? 0}%"></div><span>当前匹配度 ${jobMatch(job) ?? 0}%</span></div>
      <ol class="reqs">${reqRows}</ol>
      <div class="actions">
        <button class="btn primary" data-go="start" data-id="${job.id}">开始模拟面试（${esc(roleName(S.role || 'candidate'))}视角）</button>
        <button class="btn" data-go="careers">返回公告板</button>
      </div>`);
  }

  /* ---------- 模拟面试室：选岗 ---------- */
  function openHall() {
    if (S.session && !S.session.finished) return resumeSession();
    if (!S.role) return openIdentity(false);
    open('模拟面试室', `
      <p class="lead">当前视角：<b>${roleName(S.role)}</b>。选一个岗位开始。<button class="link" data-go="role" data-role="${S.role === 'candidate' ? 'interviewer' : 'candidate'}">切换为${roleName(S.role === 'candidate' ? 'interviewer' : 'candidate')}</button></p>
      <div class="cards">
        ${JOBS.map(j => `<button class="card" data-go="start" data-id="${j.id}">
          <div class="card-title">${esc(j.title)}</div>
          <div class="card-sub">${esc(j.sub)}</div>
          <div class="card-foot"><span>6 道题 · ${j.dims.length} 个证据项</span><span>${S.results[j.id] ? `上次 ${S.results[j.id].pct}%` : '未练习'}</span></div>
        </button>`).join('')}
      </div>`);
  }

  /* ---------- 模拟面试 ---------- */
  function startInterview(id) {
    if (!S.role) return openIdentity(false);
    const job = jobById(id);
    S.session = { jobId: job.id, role: S.role, idx: 0, answers: {}, replies: {}, matches: 0, phase: 'ask', finished: false };
    renderQuestion();
  }
  function resumeSession() {
    if (S.session.role !== S.role) { S.session = null; return openHall(); }
    renderQuestion();
  }
  function currentDim() {
    const job = jobById(S.session.jobId);
    return { job, dim: job.dims[S.session.idx] };
  }
  function interviewerBubble(text) {
    return `<div class="bubble"><div class="who">周老师（面试官）</div><p>${esc(text)}</p></div>`;
  }
  function candidateBubble(text) {
    return `<div class="bubble cand"><div class="who">候选人 · 小 L（模拟）</div><p>${esc(text)}</p></div>`;
  }
  function progressHtml(job) {
    const n = S.session.idx, total = job.dims.length;
    const dots = job.dims.map((_, i) => `<i class="${i < n ? 'done' : i === n ? 'now' : ''}"></i>`).join('');
    return `<div class="progress"><span>第 ${Math.min(n + 1, total)} / ${total} 题</span><div class="dots">${dots}</div></div>`;
  }

  function renderQuestion() {
    const ss = S.session;
    const { job, dim } = currentDim();
    const head = `<div class="q-head">${progressHtml(job)}
      <div class="ev">证据项：<b>${esc(dim.name)}</b>（权重 ${dim.weight}%）· 对应要求：${esc(dim.jd)}</div></div>`;
    const title = ss.role === 'candidate' ? '模拟面试 · 候选人视角' : '模拟面试 · 面试官视角';

    if (ss.role === 'candidate') {
      if (ss.phase === 'ask') {
        open(title, `${head}
          ${interviewerBubble(dim.q)}
          <p class="hint">选一个你会说的回答。每个回答背后的证据强弱不同。</p>
          <div class="opts">${dim.opts.map((o, i) => `<button class="opt" data-go="answer" data-i="${i}">${esc(o.text)}</button>`).join('')}</div>`);
      } else {
        const chosen = dim.opts.find(o => o.level === ss.answers[dim.id]);
        const best = dim.opts[0];
        open(title, `${head}
          ${interviewerBubble(dim.q)}
          ${candidateBubble(chosen.text)}
          ${feedbackBlock(chosen.fb, chosen.level, best)}
          <div class="actions"><button class="btn primary" data-go="next">${ss.idx + 1 < job.dims.length ? '下一题' : '生成解析报告'}</button></div>`);
      }
    } else {
      const simLevel = job.simLevels[ss.idx];
      const simOpt = dim.opts.find(o => o.level === simLevel);
      if (ss.phase === 'ask') {
        open(title, `${head}
          ${interviewerBubble(dim.q)}
          ${candidateBubble(simOpt.text)}
          <p class="hint">候选人已经回答。你判断这条回答里的证据够不够？</p>
          <div class="opts">
            <button class="opt" data-go="rate" data-level="5">✅ 证据充分（给 5 分）· 有具体动作、数字或可核查的方法</button>
            <button class="opt" data-go="rate" data-level="3">🟡 有证据但待验证（给 3 分）· 方向对，但缺口径或细节</button>
            <button class="opt" data-go="rate" data-level="1">❌ 证据不足（给 1 分）· 空泛、没有依据或说不清</button>
          </div>`);
      } else {
        const mine = ss.answers[dim.id];
        const right = mine === simLevel;
        open(title, `${head}
          ${interviewerBubble(dim.q)}
          ${candidateBubble(simOpt.text)}
          <div class="feedback">
            <div class="who">你的判断：${esc(LEVEL_LABEL[mine])}</div>
            <p>${right ? '✅ 与候选人的实际证据等级一致。' : `⚠️ 偏差：候选人的实际证据等级是「${esc(LEVEL_LABEL[simLevel])}」。`}</p>
            <p class="fb-note">${esc(simOpt.fb)}</p>
            ${simLevel !== 5 ? `<p class="better"><b>更优的证据：</b>${esc(dim.opts[0].text)}</p>` : ''}
          </div>
          <div class="actions"><button class="btn primary" data-go="next">${ss.idx + 1 < job.dims.length ? '下一题' : '生成解析报告'}</button></div>`);
      }
    }
  }

  function feedbackBlock(fb, level, best) {
    return `<div class="feedback">
      <div class="who">周老师的点评</div>
      <p class="fb-note">${esc(fb)}</p>
      ${level !== 5 ? `<p class="better"><b>更优答法：</b>${esc(best.text)}</p>` : '<p class="better">✅ 这一答已经是更优答法。</p>'}
    </div>`;
  }

  function answer(i) {
    const ss = S.session;
    const { dim } = currentDim();
    const o = dim.opts[i];
    ss.answers[dim.id] = o.level;
    ss.replies[dim.id] = o.text;
    ss.phase = 'reveal';
    renderQuestion();
  }
  function rate(level) {
    const ss = S.session;
    const { job, dim } = currentDim();
    const simLevel = job.simLevels[ss.idx];
    ss.answers[dim.id] = level;
    ss.replies[dim.id] = dim.opts.find(o => o.level === simLevel).text;
    if (level === simLevel) ss.matches++;
    ss.phase = 'reveal';
    renderQuestion();
  }
  function nextQuestion() {
    const ss = S.session;
    const { job } = currentDim();
    ss.phase = 'ask';
    if (ss.idx + 1 < job.dims.length) { ss.idx++; renderQuestion(); }
    else { ss.finished = true; finishInterview(); }
  }
  function finishInterview() {
    const ss = S.session;
    const report = buildReport(ss);
    S.results[report.jobId] = { pct: report.pct, verdict: report.verdict, at: Date.now(), rows: report.rows };
    S.last = report;
    store.set('iq.results', S.results);
    store.set('iq.last', report);
    S.session = null;
    openReport();
  }

  /* ---------- 解析报告 ---------- */
  function buildReport(ss) {
    const job = jobById(ss.jobId);
    let total = 0, wsum = 0;
    const rows = job.dims.map(d => {
      const level = ss.answers[d.id];
      total += d.weight * level;
      wsum += d.weight;
      return { id: d.id, name: d.name, weight: d.weight, jd: d.jd, level, label: LEVEL_LABEL[level], reply: ss.replies[d.id], tip: d.tip };
    });
    const score = Math.round((total / wsum) * 100) / 100;
    const pct = Math.round((score / 5) * 100);
    const verdict = score >= PASS ? '能用' : score >= WATCH ? '待观察' : '不匹配';
    const sorted = [...rows].sort((a, b) => a.level - b.level || b.weight - a.weight);
    const weakest = sorted[0];
    const strongest = [...rows].sort((a, b) => b.level - a.level || b.weight - a.weight)[0];
    return {
      jobId: job.id, title: job.title, mode: ss.role, score, pct, verdict,
      weakest: weakest.name, strongest: strongest.name,
      accuracy: ss.role === 'interviewer' ? { hit: ss.matches, total: job.dims.length } : null,
      rows, source: job.source, at: Date.now()
    };
  }
  function gapsOf(r) { return r.rows.filter(x => x.level <= 3); }
  function interviewerConclusion(r) {
    const why = {
      '能用': `总分 ${r.score} 分，达到能用线（≥${PASS}）。证据最扎实的是「${r.strongest}」。`,
      '待观察': `总分 ${r.score} 分，处于待观察区间（${WATCH}–${PASS}）。最弱的证据项是「${r.weakest}」，需要二面确认。`,
      '不匹配': `总分 ${r.score} 分，低于 ${WATCH}。多个证据项缺失，目前不建议进入下一轮。`
    };
    return why[r.verdict];
  }
  function candidateConclusion(r) {
    const gaps = gapsOf(r);
    if (!gaps.length) return '证据基本齐全。下一轮可以挑战更高难度的追问，重点放在细节的可核查性上。';
    return `还缺 ${gaps.length} 项证据，建议下一轮优先补齐：<ul>${gaps.map(g => `<li><b>${esc(g.name)}</b>：${esc(g.tip)}</li>`).join('')}</ul>`;
  }

  function openReport() {
    const r = S.last;
    if (!r) {
      return open('报告馆', `<p class="lead">这里还没有报告。先去模拟面试室完成一次问答，再回来看看。</p>
        <div class="actions"><button class="btn primary" data-go="hall">去模拟面试室</button></div>`);
    }
    const verdictCls = r.verdict === '能用' ? 'ok' : r.verdict === '待观察' ? 'warn' : 'bad';
    open('解析报告', `
      <div class="report-top">
        <div class="score-big">${r.score.toFixed(2)}<small> / 5</small></div>
        <div>
          <div class="report-title">${esc(r.title)}</div>
          <div class="muted">视角：${roleName(r.mode)} · 匹配度 ${r.pct}%</div>
          <span class="verdict ${verdictCls}">面试官结论：${r.verdict}</span>
        </div>
      </div>
      ${r.accuracy ? `<p class="hint">判断准确率：${r.accuracy.hit} / ${r.accuracy.total}（与模拟候选人的实际证据等级一致的题数）</p>` : ''}

      <h3>分项得分</h3>
      <div class="dims">${r.rows.map(x => `
        <div class="dim">
          <div class="dim-head"><b>${esc(x.name)}</b><em>权重 ${x.weight}%</em><span class="lv lv${x.level}">${esc(x.label)} · ${x.level} 分</span></div>
          <div class="bar"><div style="width:${x.level * 20}%"></div></div>
        </div>`).join('')}
      </div>

      <h3>证据对照表</h3>
      <p class="hint">岗位要求 ↔ 候选人给出的证据 ↔ 命中程度。两种视角都使用这张表。</p>
      <table class="evid">
        <thead><tr><th>岗位要求</th><th>候选人证据（模拟回答）</th><th>命中</th></tr></thead>
        <tbody>${r.rows.map(x => `<tr><td>${esc(x.jd)}</td><td>${esc(x.reply || '—')}</td><td><span class="lv lv${x.level}">${x.level} 分</span></td></tr>`).join('')}</tbody>
      </table>

      <div class="two-col">
        <div class="panel-box">
          <h4>面试官视角</h4>
          <p><b>${r.verdict}</b></p>
          <p>${esc(interviewerConclusion(r))}</p>
        </div>
        <div class="panel-box">
          <h4>候选人视角</h4>
          <div>${candidateConclusion(r)}</div>
        </div>
      </div>

      <h3>可追溯说明</h3>
      <div class="src">
        <p>结论基于：${esc(r.source.type)}。${esc(r.source.detail)}</p>
        <p>数据标注：复盘样本取自练习材料，模拟补充部分（JD 摘要与模拟候选人回答）已在来源中注明。本报告仅用于练习，不代表任何真实录用结果。</p>
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
      `【面试成绩单】${r.title}`,
      `视角：${roleName(r.mode)}　总分：${r.score.toFixed(2)} / 5　匹配度：${r.pct}%　结论：${r.verdict}`,
      '',
      '分项得分：',
      ...r.rows.map(x => `- ${x.name}（权重${x.weight}%）：${x.level} 分 · ${x.label}`),
      '',
      `面试官结论：${interviewerConclusion(r)}`,
      `候选人建议：${gapsOf(r).map(g => `${g.name}：${g.tip}`).join('；') || '证据基本齐全'}`,
      '',
      `数据来源：${r.source.type}（练习材料，模拟补充已标注）`
    ];
    return lines.join('\n');
  }
  function copyReport() {
    const tip = document.getElementById('copy-tip');
    const text = reportText(S.last);
    const done = () => { if (tip) tip.textContent = '已复制到剪贴板。'; };
    const fail = () => { if (tip) tip.textContent = '复制失败，请手动选择文字。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  /* ---------- 数据说明 ---------- */
  function openData() {
    open('数据说明', `
      <h3>数据怎么来（三步流水线）</h3>
      <ol class="steps">
        <li><b>采集：</b>收集岗位招募信息与个人复盘报告。本站使用的是复盘材料整理文档中的样本。</li>
        <li><b>AI 处理：</b>从 JD 中抽出任职要求，拆成证据项与评分权重；从复盘中提取问答、证据表现与判断信号。</li>
        <li><b>补量：</b>真实样本不够的部分由模拟补充，并在每个岗位的「数据来源」中标注。</li>
      </ol>
      <h3>真实与模拟的区别</h3>
      <ul class="plain">
        <li>复盘样本：来自练习材料的面试复盘。原文注明公司、面试官与对话为虚构，仅用于练习，候选人已去标识化。</li>
        <li>模拟补充：JD 摘要与「候选人 · 小 L」的回答为 AI 生成的示例，用于补足题量。</li>
        <li>所有评分与结论都只用于练习，不代表真实录用结果。</li>
      </ul>
      <h3>评分规则</h3>
      <ul class="plain">
        <li>每题对应一个证据项；候选人选择的回答（或面试官的判断）给出 1 / 3 / 5 分。</li>
        <li>总分 = Σ（证据项分数 × 权重）÷ 100，满分 5 分。</li>
        <li>≥ 3.8 为「能用」，3.0–3.8 为「待观察」，< 3.0 为「不匹配」。</li>
      </ul>
      <h3>素材与致谢</h3>
      <ul class="plain">
        <li>像素地图与建筑：<a href="https://kenney.nl/assets/tiny-town" target="_blank" rel="noopener">Kenney Tiny Town</a>；角色与 NPC：<a href="https://kenney.nl/assets/tiny-dungeon" target="_blank" rel="noopener">Kenney Tiny Dungeon</a>；花丛、篝火、市集棚等装饰：<a href="https://opengameart.org/content/roguelikerpg-pack-1700-tiles" target="_blank" rel="noopener">Kenney Roguelike/RPG Pack</a>。以上均为 CC0 1.0，可自由使用。</li>
        <li>风格参考星露谷物语的田园像素风，本站未使用星露谷官方素材。</li>
      </ul>`);
  }

  /* ---------- 广场导览：每个房间与角色的用途 ---------- */
  function openGuide() {
    const card = k => `<div class="mini"><b>${esc(ROOMS[k].name)}</b><span class="tagline">${esc(ROOMS[k].short)}</span><p>${esc(ROOMS[k].desc)}</p></div>`;
    open('广场导览', `
      <p class="lead">每个房间和角色是做什么的，都写在这里，也写在地图上的木牌里。走到门口或身边，按 E（手机按 A）就能进入。</p>
      <h3>建筑与设施</h3>
      <div class="cards2">${['board', 'hall', 'report', 'showcase', 'sign'].map(card).join('')}</div>
      <h3>广场里的角色</h3>
      <div class="cards2">${['teacher', 'guide', 'curator'].map(card).join('')}</div>`);
  }

  /* ---------- 成果展馆：已完成的部分、复盘总结、待办 ---------- */
  const TODO_CLASS = { '已完成': 'ok', '进行中': 'doing', '待办': 'todo' };
  function openShowcase() {
    const doneCount = SHOWCASE.done.length + SHOWCASE.todo.filter(x => x.s === '已完成').length;
    const total = SHOWCASE.done.length + SHOWCASE.todo.length;
    const pct = Math.round((doneCount / total) * 100);
    open('成果展馆', `
      <p class="lead">这里展示项目目前完成的部分、从复盘里提炼出的通用经验，以及还没做完的待办。</p>
      <div class="progress-big">
        <div class="pg-num">${pct}%</div>
        <div class="pg-text">已完成 ${SHOWCASE.done.length} 个模块 · 待办 ${SHOWCASE.todo.length} 项</div>
      </div>
      <div class="bar big"><div style="width:${pct}%"></div></div>

      <h3>✅ 已完成</h3>
      <div class="cards2">${SHOWCASE.done.map(x => `<div class="mini done"><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>`).join('')}</div>

      <h3>🧭 复盘总结（通用经验，已去除个人信息）</h3>
      <div class="cards2">${SHOWCASE.lessons.map(x => `<div class="mini"><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>`).join('')}</div>

      <h3>📌 待办与下一步</h3>
      <ul class="todo-list">${SHOWCASE.todo.map(x => `<li>
        <span class="pill ${TODO_CLASS[x.s] || 'todo'}">${esc(x.s)}</span>
        <div><b>${esc(x.t)}</b><p>${esc(x.d)}</p></div>
      </li>`).join('')}</ul>

      <h3>🧰 技术与素材</h3>
      <ul class="plain">${SHOWCASE.stack.map(x => `<li>${esc(x)}</li>`).join('')}</ul>

      <div class="actions">
        <button class="btn primary" data-go="hall">去模拟面试室</button>
        <button class="btn" data-go="report">看报告馆</button>
        <button class="btn" data-go="data">看数据说明</button>
      </div>`);
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
    if (!S.role) {
      setTimeout(() => openIdentity(true), 400);
    }
  }
  document.addEventListener('DOMContentLoaded', init);

  return { open, close, blocking, openCareers, openJob, openHall, openReport, openData, openShowcase, openGuide, startInterview, toggleRole };
})();
