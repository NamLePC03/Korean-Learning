(function () {
  const STORAGE_KEY = 'korean_sc1_exam_history_v1';
  const LETTERS = ['A', 'B', 'C', 'D'];

  let state = {
    mode: 'exam', // 'exam' | 'practice'
    started: false,
    submitted: false,
    remainingSec: 45 * 60,
    elapsedSec: 0,
    timerId: null,
    filterWrongOnly: false,
    answers: {} // qId -> value
  };

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveResult(examId, score, maxScore, elapsedSec) {
    try {
      const h = getHistory();
      const prev = h[examId] || { best: 0, attempts: [] };
      const best = Math.max(prev.best || 0, score);
      const attempts = [
        { score, maxScore, elapsedSec, date: new Date().toISOString() },
        ...(prev.attempts || [])
      ].slice(0, 10);
      h[examId] = { best, attempts };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
    } catch {
      // ignore storage errors on restricted file:// origins
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function normalizeText(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
  }

  function stripEndingPunct(str) {
    return normalizeText(str).replace(/[.?!]+$/, '');
  }

  function isAnswered(q) {
    const val = state.answers[q.id];
    if (q.type === 'mcq') return typeof val === 'number';
    if (q.type === 'tile-order' || q.type === 'tile-build') return Array.isArray(val) && val.length > 0;
    if (q.type === 'error-fix') return Boolean(val && typeof val.segIndex === 'number' && typeof val.fixIndex === 'number');
    return false;
  }

  function gradeQuestion(q) {
    const val = state.answers[q.id];
    if (q.type === 'mcq') {
      const ok = val === q.answer;
      return {
        correct: ok,
        earned: ok ? q.points : 0,
        correctDisplay: LETTERS[q.answer] + '. ' + q.options[q.answer]
      };
    }
    if (q.type === 'tile-order' || q.type === 'tile-build') {
      const userStr = Array.isArray(val) ? val.map(idx => q.tiles[idx]).join(' ') : '';
      const userNorm = stripEndingPunct(userStr);
      const accepted = (q.acceptedAnswers || [q.answerText]).map(stripEndingPunct);
      const ok = userNorm.length > 0 && accepted.includes(userNorm);
      return {
        correct: ok,
        earned: ok ? q.points : 0,
        correctDisplay: q.answerText || (q.acceptedAnswers && q.acceptedAnswers[0]) || ''
      };
    }
    if (q.type === 'error-fix') {
      const segOk = val && val.segIndex === q.errorSegIndex;
      const fixOk = val && val.fixIndex === q.correctFixIndex;
      const ok = Boolean(segOk && fixOk);
      return {
        correct: ok,
        segOk: Boolean(segOk),
        fixOk: Boolean(fixOk),
        earned: ok ? q.points : 0,
        correctDisplay: `Chỗ sai: "${q.segments[q.errorSegIndex]}" → Sửa thành: "${q.fixOptions[q.correctFixIndex]}"`
      };
    }
    return { correct: false, earned: 0, correctDisplay: '' };
  }

  function renderTopNav(exam) {
    const history = getHistory();
    const exams = [
      { id: 'de-01', label: 'Đề 01', file: 'Đề sơ cấp 1 - 01.html' },
      { id: 'de-02', label: 'Đề 02', file: 'Đề sơ cấp 1 - 02.html' },
      { id: 'de-03', label: 'Đề 03', file: 'Đề sơ cấp 1 - 03.html' },
      { id: 'de-04', label: 'Đề 04', file: 'Đề sơ cấp 1 - 04.html' },
      { id: 'de-05', label: 'Đề 05', file: 'Đề sơ cấp 1 - 05.html' }
    ];
    const linksHtml = exams
      .map(item => {
        const active = item.id === exam.id ? 'active' : '';
        const rec = history[item.id];
        const badge = rec && typeof rec.best === 'number' ? `<span class="nav-score-badge">${rec.best}đ</span>` : '';
        return `<a class="exam-nav-pill ${active}" href="${encodeURI(item.file)}">${item.label}${badge}</a>`;
      })
      .join('');

    return `
      <nav class="top-nav">
        <div class="top-nav-inner">
          <a class="brand-link" href="../Ng%E1%BB%AF%20ph%C3%A1p%20s%C6%A1%20c%E1%BA%A5p%201.htm">📚 Bộ Đề Ôn Tập Tiếng Hàn Sơ Cấp 1 (Bài 1–15)</a>
          <div class="exam-links">${linksHtml}</div>
        </div>
      </nav>
    `;
  }

  function renderHero(exam) {
    return `
      <header class="hero-header">
        <div class="hero-inner">
          <div>
            <span class="hero-badge">${exam.badge || 'ĐỌC & VIẾT • BÀI 1–15'}</span>
            <h1 class="hero-title">${exam.title}</h1>
            <p class="hero-subtitle">${exam.subtitle}</p>
          </div>
          <div class="hero-meta-chips">
            <div class="meta-chip">📝 ${exam.questions.length} câu hỏi</div>
            <div class="meta-chip">⏱️ ${exam.durationMinutes} phút</div>
            <div class="meta-chip">🎯 100 điểm</div>
          </div>
        </div>
      </header>
    `;
  }

  function getStartHistoryHtml(exam) {
    const history = getHistory();
    const rec = history[exam.id];
    return rec
      ? `<p id="startHistLine" style="font-size:13.5px;color:#059669;font-weight:700;margin-bottom:14px;">🏆 Điểm cao nhất đã lưu: ${rec.best}/100 (${rec.attempts.length} lần làm)</p>`
      : `<p id="startHistLine" style="display:none;"></p>`;
  }

  function renderStartPanel(exam) {
    const histLine = getStartHistoryHtml(exam);

    return `
      <div class="start-panel" id="startPanel">
        <div class="start-card">
          <h2>Chuẩn bị làm bài: ${exam.title}</h2>
          <p style="color:var(--text-muted);font-size:14px;">Toàn bộ câu hỏi bám sát từ vựng và ngữ pháp Bài 1–15 Sơ cấp 1, thao tác 100% bằng chuột (không cần gõ bàn phím tiếng Hàn).</p>
          ${histLine}
          <div class="start-grid">
            <div class="mode-card selected" data-mode="exam" id="modeExamCard">
              <h3>⏱️ Chế độ Thi thật (45 phút)</h3>
              <p>Đồng hồ đếm ngược 45:00, tự động nộp khi hết giờ. Phù hợp kiểm tra năng lực tổng hợp.</p>
            </div>
            <div class="mode-card" data-mode="practice" id="modePracticeCard">
              <h3>📖 Chế độ Ôn tập (Không giới hạn)</h3>
              <p>Không áp lực thời gian, có nút "Kiểm tra câu này" để xem đáp án & giải thích ngay từng câu.</p>
            </div>
          </div>

          <table class="blueprint-table">
            <thead>
              <tr><th>Phần thi</th><th>Dạng bài</th><th>Số câu</th><th>Điểm</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Phần A</strong> – Từ vựng & Nền tảng</td><td>Từ vựng ngữ cảnh, trái nghĩa/biến âm, số đếm Hán/Thuần Hàn</td><td>10</td><td>20 đ</td></tr>
              <tr><td><strong>Phần B</strong> – Ngữ pháp & Bất quy tắc</td><td>Tiểu từ, bẫy ngữ pháp Sơ cấp 1, chia động/tính từ bất quy tắc</td><td>14</td><td>32 đ</td></tr>
              <tr><td><strong>Phần C</strong> – Đọc hiểu</td><td>Tin nhắn/thông báo ngắn & 2 đoạn văn đọc hiểu</td><td>8</td><td>24 đ</td></tr>
              <tr><td><strong>Phần D</strong> – Viết câu (Ghép thẻ & Sửa lỗi)</td><td>Sắp xếp câu, tìm & sửa lỗi sai, dịch Việt–Hàn từ ngân hàng thẻ</td><td>8</td><td>24 đ</td></tr>
            </tbody>
          </table>

          <button class="btn btn-primary" id="btnStartExam" style="font-size:15px;padding:12px 24px;">▶ Bắt đầu làm bài</button>
        </div>
      </div>
    `;
  }

  function renderHud(exam) {
    return `
      <div class="hud-bar hidden" id="hudBar">
        <div class="hud-inner">
          <div class="hud-left">
            <div class="timer-box" id="timerBox">⏱️ <span id="timerText">${formatTime(exam.durationMinutes * 60)}</span></div>
            <div class="progress-pill">Đã làm: <strong id="answeredCount">0</strong> / ${exam.questions.length} câu</div>
            <div class="progress-pill" id="modeBadge">Chế độ: <strong>Thi thật</strong></div>
          </div>
          <div class="hud-actions">
            <button class="btn btn-outline btn-sm" id="btnBackMenu">↺ Đổi chế độ</button>
            <button class="btn btn-success" id="btnSubmitExam">✓ Nộp bài & Chấm điểm</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderQuestionBody(q, idx) {
    const val = state.answers[q.id];
    const checkPractice = state.mode === 'practice' && !state.submitted
      ? `<div class="q-actions-row"><button class="btn btn-outline btn-sm btn-check-one" data-qid="${q.id}">Kiểm tra câu này</button></div>`
      : '';

    let inner = '';
    if (q.type === 'mcq') {
      const optsHtml = q.options
        .map((opt, oi) => {
          const sel = val === oi ? 'selected' : '';
          return `
            <button type="button" class="opt-btn ${sel}" data-qid="${q.id}" data-oi="${oi}">
              <span class="opt-letter">${LETTERS[oi]}</span>
              <span>${opt}</span>
            </button>
          `;
        })
        .join('');
      inner = `<div class="options-list">${optsHtml}</div>`;
    } else if (q.type === 'tile-order' || q.type === 'tile-build') {
      const picked = Array.isArray(val) ? val : [];
      const trayItems = picked.length
        ? picked
            .map((tileIdx, pos) => `<button type="button" class="word-tile in-tray" data-qid="${q.id}" data-pos="${pos}">${q.tiles[tileIdx]}</button>`)
            .join('')
        : `<span class="tray-placeholder">Bấm vào các thẻ bên dưới theo đúng thứ tự để tạo câu...</span>`;

      const bankItems = q.tiles
        .map((txt, tileIdx) => {
          const isUsed = picked.includes(tileIdx);
          return `<button type="button" class="word-tile ${isUsed ? 'used' : ''}" data-qid="${q.id}" data-tile="${tileIdx}" ${isUsed ? 'disabled' : ''}>${txt}</button>`;
        })
        .join('');

      inner = `
        <div class="tile-zone-label">
          <span>Khung câu của bạn (bấm vào thẻ để bỏ chọn):</span>
          <button type="button" class="btn btn-outline btn-sm btn-clear-tiles" data-qid="${q.id}">Xóa hết</button>
        </div>
        <div class="answer-tray ${picked.length ? 'has-items' : ''}">${trayItems}</div>
        <div class="tile-zone-label"><span>${q.type === 'tile-build' ? 'Ngân hàng thẻ (có thẻ gây nhiễu):' : 'Các mảnh từ cần sắp xếp:'}</span></div>
        <div class="tile-bank">${bankItems}</div>
      `;
    } else if (q.type === 'error-fix') {
      const segPicked = val && typeof val.segIndex === 'number' ? val.segIndex : null;
      const fixPicked = val && typeof val.fixIndex === 'number' ? val.fixIndex : null;
      const segsHtml = q.segments
        .map((seg, si) => {
          const pickedCls = segPicked === si ? 'picked-seg' : '';
          return `<button type="button" class="seg-btn ${pickedCls}" data-qid="${q.id}" data-si="${si}"><span class="seg-num">${si + 1}</span><span>${seg}</span></button>`;
        })
        .join('');
      const fixesHtml = q.fixOptions
        .map((opt, fi) => {
          const sel = fixPicked === fi ? 'selected' : '';
          return `
            <button type="button" class="opt-btn ${sel}" data-qid="${q.id}" data-fi="${fi}">
              <span class="opt-letter">${LETTERS[fi]}</span>
              <span>${opt}</span>
            </button>
          `;
        })
        .join('');
      let partialHint = '';
      if (segPicked !== null && fixPicked === null) {
        partialHint = `<div style="font-size:12.5px;color:#b45309;font-weight:600;margin-top:8px;">👉 Đã chọn phần sai — hãy chọn thêm phương án sửa ở Bước 2 để hoàn tất câu này.</div>`;
      } else if (segPicked === null && fixPicked !== null) {
        partialHint = `<div style="font-size:12.5px;color:#b45309;font-weight:600;margin-top:8px;">👉 Đã chọn phương án sửa — hãy bấm chọn phần bị sai ở Bước 1 để hoàn tất câu này.</div>`;
      }
      inner = `
        <div class="fix-step-title">Bước 1: Bấm chọn phần bị SAI trong câu:</div>
        <div class="err-sentence">${segsHtml}</div>
        <div class="fix-step-title">Bước 2: Chọn phương án sửa ĐÚNG cho phần đó:</div>
        <div class="options-list">${fixesHtml}</div>
        ${partialHint}
      `;
    }

    const noticeHtml = q.noticeBox ? `<div class="notice-card">${q.noticeBox}</div>` : '';
    const koStemHtml = q.koStem ? `<div class="q-ko-stem">${q.koStem}</div>` : '';

    return `
      <article class="q-card" id="qcard-${q.id}" data-qid="${q.id}" ${q.passageId ? `data-passage="${q.passageId}"` : ''}>
        <div class="q-top">
          <div class="q-badge-group">
            <span class="q-num">Câu ${idx + 1}</span>
            <span class="q-type-tag">${q.typeLabel}</span>
          </div>
          <span class="q-points">${q.points} điểm</span>
        </div>
        <div class="q-prompt">${q.prompt}</div>
        ${noticeHtml}
        ${koStemHtml}
        ${inner}
        ${checkPractice}
        <div class="feedback-box" id="fb-${q.id}"></div>
      </article>
    `;
  }

  function renderWorkspace(exam) {
    const sectionsHtml = exam.sections
      .map(sec => {
        const qs = exam.questions.filter(q => q.section === sec.id);
        let renderedPassageIds = new Set();
        const qsHtml = qs
          .map(q => {
            const globalIdx = exam.questions.indexOf(q);
            let passageHtml = '';
            if (q.passageId && !renderedPassageIds.has(q.passageId)) {
              renderedPassageIds.add(q.passageId);
              const p = (exam.passages || {})[q.passageId];
              if (p) {
                passageHtml = `
                  <div class="passage-card" data-passage-box="${q.passageId}">
                    <div class="passage-label">${p.label}</div>
                    <div class="passage-text">${p.text}</div>
                  </div>
                `;
              }
            }
            return passageHtml + renderQuestionBody(q, globalIdx);
          })
          .join('');

        return `
          <section class="section-block" id="sec-${sec.id}">
            <div class="section-header">
              <h2>${sec.title}</h2>
              <p>${sec.desc}</p>
            </div>
            ${qsHtml}
          </section>
        `;
      })
      .join('');

    const navDots = exam.questions
      .map((q, i) => `<button type="button" class="q-dot" id="dot-${q.id}" data-jump="qcard-${q.id}">${i + 1}</button>`)
      .join('');

    return `
      <div class="main-container hidden" id="examWorkspace">
        <main>
          <div class="result-panel" id="resultPanel"></div>
          <div id="sectionsRoot">${sectionsHtml}</div>
        </main>
        <aside class="sidebar">
          <div class="sidebar-title">
            <span>Bảng câu hỏi</span>
            <span id="sideProgress" style="color:var(--primary);font-size:13px;">0/${exam.questions.length}</span>
          </div>
          <div class="q-grid">${navDots}</div>
          <div class="legend-row">
            <span class="legend-item"><span class="legend-swatch" style="background:#f8fafc;"></span>Chưa làm</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#e0e7ff;border-color:#818cf8;"></span>Đã chọn</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#ecfdf5;border-color:#10b981;"></span>Đúng</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#fef2f2;border-color:#ef4444;"></span>Sai</span>
          </div>
        </aside>
      </div>
    `;
  }

  function refreshQuestionCard(exam, q) {
    const idx = exam.questions.indexOf(q);
    const oldEl = document.getElementById('qcard-' + q.id);
    if (!oldEl) return;
    const temp = document.createElement('div');
    temp.innerHTML = renderQuestionBody(q, idx).trim();
    const newEl = temp.firstElementChild;
    oldEl.replaceWith(newEl);
    updateProgressUI(exam);
  }

  function updateProgressUI(exam) {
    let done = 0;
    exam.questions.forEach(q => {
      const answered = isAnswered(q);
      if (answered) done++;
      const dot = document.getElementById('dot-' + q.id);
      if (dot && !state.submitted) {
        dot.classList.remove('correct', 'wrong');
        dot.classList.toggle('answered', Boolean(answered));
      }
    });
    const ac = document.getElementById('answeredCount');
    const sp = document.getElementById('sideProgress');
    if (ac) ac.textContent = String(done);
    if (sp) sp.textContent = `${done}/${exam.questions.length}`;
  }

  function showQuestionFeedback(q, res, lockInputs) {
    const card = document.getElementById('qcard-' + q.id);
    const fb = document.getElementById('fb-' + q.id);
    if (!card || !fb) return;

    card.classList.remove('is-correct', 'is-wrong');
    card.classList.add(res.correct ? 'is-correct' : 'is-wrong');

    const dot = document.getElementById('dot-' + q.id);
    if (dot) {
      dot.classList.remove('answered', 'correct', 'wrong');
      dot.classList.add(res.correct ? 'correct' : 'wrong');
    }

    if (lockInputs) {
      card.querySelectorAll('button:not(.btn-check-one)').forEach(b => (b.disabled = true));
      if (q.type === 'mcq') {
        const userVal = state.answers[q.id];
        card.querySelectorAll('.opt-btn').forEach((btn, oi) => {
          if (oi === q.answer) btn.classList.add('correct-ans');
          else if (oi === userVal) btn.classList.add('wrong-ans');
        });
      } else if (q.type === 'error-fix') {
        const val = state.answers[q.id] || {};
        card.querySelectorAll('.seg-btn').forEach((btn, si) => {
          if (si === q.errorSegIndex) btn.classList.add('true-err-seg');
        });
        card.querySelectorAll('.opt-btn').forEach((btn, fi) => {
          if (fi === q.correctFixIndex) btn.classList.add('correct-ans');
          else if (fi === val.fixIndex) btn.classList.add('wrong-ans');
        });
      }
    }

    fb.className = 'feedback-box show ' + (res.correct ? 'fb-correct' : 'fb-wrong');
    const statusLabel = res.correct
      ? `✅ Chính xác (+${q.points}đ)`
      : `❌ Chưa đúng (0/${q.points}đ)`;
    fb.innerHTML = `
      <div class="feedback-ans">${statusLabel} — Đáp án đúng: <span class="ko">${res.correctDisplay}</span></div>
      <div>${q.explanation}</div>
    `;
  }

  function submitExam(exam, autoTimeout) {
    if (state.submitted) return;
    state.submitted = true;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }

    let totalEarned = 0;
    let totalMax = 0;
    let correctCount = 0;
    const secStats = {};
    exam.sections.forEach(s => (secStats[s.id] = { title: s.shortTitle || s.title, earned: 0, max: 0 }));

    exam.questions.forEach(q => {
      const res = gradeQuestion(q);
      totalMax += q.points;
      totalEarned += res.earned;
      if (res.correct) correctCount++;
      secStats[q.section].max += q.points;
      secStats[q.section].earned += res.earned;
      showQuestionFeedback(q, res, true);
    });

    const elapsed = state.mode === 'exam'
      ? exam.durationMinutes * 60 - state.remainingSec
      : state.elapsedSec;

    saveResult(exam.id, totalEarned, totalMax, elapsed);

    const activePill = document.querySelector('.exam-nav-pill.active');
    if (activePill) {
      const history = getHistory();
      const rec = history[exam.id];
      if (rec && typeof rec.best === 'number') {
        let badge = activePill.querySelector('.nav-score-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-score-badge';
          activePill.appendChild(badge);
        }
        badge.textContent = `${rec.best}đ`;
      }
    }

    let rank = 'Cần ôn tập thêm';
    if (totalEarned >= 90) rank = 'Xuất sắc (Làm chủ Sơ cấp 1)';
    else if (totalEarned >= 80) rank = 'Giỏi (Sẵn sàng kiểm tra)';
    else if (totalEarned >= 65) rank = 'Khá (Cần rà lại lỗi sai)';
    else if (totalEarned >= 50) rank = 'Trung bình (Nên ôn kỹ lại các phần yếu)';

    const bdHtml = exam.sections
      .map(s => {
        const st = secStats[s.id];
        const pct = st.max ? Math.round((st.earned / st.max) * 100) : 0;
        return `
          <div class="bd-card">
            <div class="bd-head"><span>${st.title}</span><span>${st.earned}/${st.max}đ (${pct}%)</span></div>
            <div class="bd-bar-track"><div class="bd-bar-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join('');

    const panel = document.getElementById('resultPanel');
    panel.innerHTML = `
      <div class="result-top">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-muted);">${autoTimeout ? '⏰ Hết giờ — Hệ thống đã tự động nộp bài' : '🎉 Hoàn thành bài kiểm tra'}</div>
          <div class="score-circle"><span class="score-big">${totalEarned}</span><span class="score-max">/ ${totalMax} điểm</span></div>
          <span class="grade-badge">${rank}</span>
        </div>
        <div style="font-size:14px;color:var(--text-muted);line-height:1.8;">
          <div>✔ Số câu đúng: <strong>${correctCount} / ${exam.questions.length}</strong></div>
          <div>⏱️ Thời gian làm: <strong>${formatTime(elapsed)}</strong></div>
        </div>
      </div>
      <div class="breakdown-grid">${bdHtml}</div>
      <div class="result-controls">
        <button type="button" class="btn btn-outline" id="btnToggleWrong">🔍 Chỉ hiện các câu sai (${exam.questions.length - correctCount})</button>
        <button type="button" class="btn btn-primary" id="btnRetryAll">↻ Làm lại toàn bộ đề</button>
      </div>
    `;
    panel.classList.add('show');
    document.getElementById('btnSubmitExam').disabled = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startTimer(exam) {
    if (state.timerId) clearInterval(state.timerId);
    const timerText = document.getElementById('timerText');
    const timerBox = document.getElementById('timerBox');

    if (state.mode === 'exam') {
      state.remainingSec = exam.durationMinutes * 60;
      timerText.textContent = formatTime(state.remainingSec);
      timerBox.className = 'timer-box';
      state.timerId = setInterval(() => {
        state.remainingSec--;
        timerText.textContent = formatTime(Math.max(0, state.remainingSec));
        if (state.remainingSec <= 120) timerBox.className = 'timer-box danger';
        else if (state.remainingSec <= 300) timerBox.className = 'timer-box warning';
        if (state.remainingSec <= 0) {
          submitExam(exam, true);
        }
      }, 1000);
    } else {
      state.elapsedSec = 0;
      timerText.textContent = '00:00';
      timerBox.className = 'timer-box';
      state.timerId = setInterval(() => {
        state.elapsedSec++;
        timerText.textContent = formatTime(state.elapsedSec);
      }, 1000);
    }
  }

  function resetExamState(exam) {
    if (state.timerId) clearInterval(state.timerId);
    state.submitted = false;
    state.filterWrongOnly = false;
    state.answers = {};
    const ws = document.getElementById('examWorkspace');
    const temp = document.createElement('div');
    temp.innerHTML = renderWorkspace(exam).trim();
    ws.replaceWith(temp.firstElementChild);
    document.getElementById('examWorkspace').classList.remove('hidden');
    document.getElementById('btnSubmitExam').disabled = false;
    updateProgressUI(exam);
    startTimer(exam);
  }

  window.initExamApp = function (exam) {
    const app = document.getElementById('app');
    app.innerHTML =
      renderTopNav(exam) +
      renderHero(exam) +
      renderHud(exam) +
      renderStartPanel(exam) +
      renderWorkspace(exam);

    app.addEventListener('click', e => {
      const modeCard = e.target.closest('.mode-card');
      if (modeCard) {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
        modeCard.classList.add('selected');
        state.mode = modeCard.dataset.mode;
        return;
      }

      if (e.target.closest('#btnStartExam')) {
        state.started = true;
        document.getElementById('startPanel').classList.add('hidden');
        document.getElementById('hudBar').classList.remove('hidden');
        document.getElementById('modeBadge').innerHTML =
          'Chế độ: <strong>' + (state.mode === 'exam' ? 'Thi thật (45p)' : 'Ôn tập tự do') + '</strong>';
        resetExamState(exam);
        return;
      }

      if (e.target.closest('#btnBackMenu')) {
        const hasAnyAnswer = exam.questions.some(q => isAnswered(q));
        if (!state.submitted && hasAnyAnswer && !confirm('Bạn đang làm dở bài. Quay lại chọn chế độ sẽ xóa tiến độ hiện tại, tiếp tục chứ?')) {
          return;
        }
        if (state.timerId) clearInterval(state.timerId);
        state.started = false;
        const histEl = document.getElementById('startHistLine');
        if (histEl) histEl.outerHTML = getStartHistoryHtml(exam);
        document.getElementById('hudBar').classList.add('hidden');
        document.getElementById('examWorkspace').classList.add('hidden');
        document.getElementById('startPanel').classList.remove('hidden');
        return;
      }

      if (e.target.closest('#btnSubmitExam')) {
        const unanswered = exam.questions.filter(q => !isAnswered(q)).length;
        if (unanswered > 0 && !confirm(`Bạn còn ${unanswered} câu chưa trả lời. Bạn vẫn muốn nộp bài chứ?`)) {
          return;
        }
        submitExam(exam, false);
        return;
      }

      if (e.target.closest('#btnRetryAll')) {
        resetExamState(exam);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (e.target.closest('#btnToggleWrong')) {
        state.filterWrongOnly = !state.filterWrongOnly;
        const btn = document.getElementById('btnToggleWrong');
        const wrongCount = document.querySelectorAll('.q-card.is-wrong').length;
        btn.textContent = state.filterWrongOnly
          ? '📋 Hiện tất cả câu hỏi'
          : `🔍 Chỉ hiện các câu sai (${wrongCount})`;
        document.querySelectorAll('.q-card').forEach(card => {
          if (state.filterWrongOnly) {
            card.classList.toggle('hidden', card.classList.contains('is-correct'));
          } else {
            card.classList.remove('hidden');
          }
        });
        document.querySelectorAll('[data-passage-box]').forEach(box => {
          const pId = box.getAttribute('data-passage-box');
          const hasVisibleQ = Array.from(document.querySelectorAll(`.q-card[data-passage="${pId}"]`)).some(
            c => !c.classList.contains('hidden')
          );
          box.classList.toggle('hidden', state.filterWrongOnly && !hasVisibleQ);
        });
        document.querySelectorAll('.section-block').forEach(sec => {
          const hasVisibleQ = Array.from(sec.querySelectorAll('.q-card')).some(
            c => !c.classList.contains('hidden')
          );
          sec.classList.toggle('hidden', state.filterWrongOnly && !hasVisibleQ);
        });
        return;
      }

      const jumpDot = e.target.closest('[data-jump]');
      if (jumpDot) {
        const target = document.getElementById(jumpDot.dataset.jump);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (state.submitted) return;

      const checkOne = e.target.closest('.btn-check-one');
      if (checkOne) {
        const q = exam.questions.find(x => x.id === checkOne.dataset.qid);
        if (q) showQuestionFeedback(q, gradeQuestion(q), false);
        return;
      }

      const optBtn = e.target.closest('.opt-btn');
      if (optBtn) {
        const q = exam.questions.find(x => x.id === optBtn.dataset.qid);
        if (!q) return;
        if (q.type === 'mcq') {
          const oi = Number(optBtn.dataset.oi);
          if (state.answers[q.id] === oi) {
            delete state.answers[q.id];
          } else {
            state.answers[q.id] = oi;
          }
        } else if (q.type === 'error-fix' && optBtn.dataset.fi !== undefined) {
          const fi = Number(optBtn.dataset.fi);
          const prev = state.answers[q.id] || {};
          if (prev.fixIndex === fi) {
            const next = { ...prev };
            delete next.fixIndex;
            if (typeof next.segIndex === 'number') state.answers[q.id] = next;
            else delete state.answers[q.id];
          } else {
            state.answers[q.id] = { ...prev, fixIndex: fi };
          }
        }
        refreshQuestionCard(exam, q);
        return;
      }

      const segBtn = e.target.closest('.seg-btn');
      if (segBtn) {
        const q = exam.questions.find(x => x.id === segBtn.dataset.qid);
        if (!q) return;
        const si = Number(segBtn.dataset.si);
        const prev = state.answers[q.id] || {};
        if (prev.segIndex === si) {
          const next = { ...prev };
          delete next.segIndex;
          if (typeof next.fixIndex === 'number') state.answers[q.id] = next;
          else delete state.answers[q.id];
        } else {
          state.answers[q.id] = { ...prev, segIndex: si };
        }
        refreshQuestionCard(exam, q);
        return;
      }

      const bankTile = e.target.closest('.word-tile[data-tile]');
      if (bankTile) {
        const q = exam.questions.find(x => x.id === bankTile.dataset.qid);
        if (!q) return;
        const tileIdx = Number(bankTile.dataset.tile);
        const cur = Array.isArray(state.answers[q.id]) ? [...state.answers[q.id]] : [];
        if (!cur.includes(tileIdx)) {
          cur.push(tileIdx);
          state.answers[q.id] = cur;
          refreshQuestionCard(exam, q);
        }
        return;
      }

      const trayTile = e.target.closest('.word-tile.in-tray[data-pos]');
      if (trayTile) {
        const q = exam.questions.find(x => x.id === trayTile.dataset.qid);
        if (!q) return;
        const pos = Number(trayTile.dataset.pos);
        const cur = Array.isArray(state.answers[q.id]) ? [...state.answers[q.id]] : [];
        cur.splice(pos, 1);
        state.answers[q.id] = cur;
        refreshQuestionCard(exam, q);
        return;
      }

      const clearBtn = e.target.closest('.btn-clear-tiles');
      if (clearBtn) {
        const q = exam.questions.find(x => x.id === clearBtn.dataset.qid);
        if (!q) return;
        delete state.answers[q.id];
        refreshQuestionCard(exam, q);
      }
    });
  };
})();
