(function () {
  const STORAGE_DONE = 'mmut_done_modules_v1';
  const STORAGE_LAST = 'mmut_last_read_v1';
  const STORAGE_THEME = 'mmut_theme_v1';
  const STORAGE_FONT = 'mmut_font_scale_v1';

  let catalog = null;
  let activeCourseId = null;
  let currentReader = null; // { course, modIndex }
  let doneSet = new Set(JSON.parse(localStorage.getItem(STORAGE_DONE) || '[]'));
  let fontScale = Number(localStorage.getItem(STORAGE_FONT) || '100');
  let deferredInstallPrompt = null;

  const $ = (id) => document.getElementById(id);
  const homeView = $('homeView');
  const readerView = $('readerView');
  const contentArea = $('contentArea');
  const searchInput = $('searchInput');
  const backCourseBtn = $('backCourseBtn');
  const heroCard = $('heroCard');
  const resumeBanner = $('resumeBanner');
  const readerFrame = $('readerFrame');

  function modKey(courseId, modNum) {
    return `${courseId}_m${modNum}`;
  }

  function saveDone() {
    localStorage.setItem(STORAGE_DONE, JSON.stringify([...doneSet]));
  }

  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(STORAGE_THEME, isDark ? 'dark' : 'light');
    $('themeToggleBtn').textContent = isDark ? '☀️' : '🌙';
    $('readerThemeBtn').textContent = isDark ? '☀️' : '🌙';
    syncIframeAppearance();
  }

  function isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  function syncIframeAppearance() {
    try {
      const doc = readerFrame.contentDocument;
      if (!doc || !doc.documentElement) return;
      doc.documentElement.classList.add('in-app-shell');
      doc.documentElement.classList.toggle('dark-mode', isDarkMode());
      doc.documentElement.style.fontSize = `${fontScale}%`;
    } catch (_) {
      // Cross-origin fallback (not hit in local/Capacitor/same-origin PWA)
    }
  }

  function updateOverallStats() {
    if (!catalog) return;
    const total = catalog.courses.reduce((s, c) => s + c.modules.length, 0);
    const done = doneSet.size;
    $('statCourses').textContent = catalog.courses.length;
    $('statTotal').textContent = total;
    $('statDone').textContent = done;
    $('overallProgress').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;

    const last = JSON.parse(localStorage.getItem(STORAGE_LAST) || 'null');
    if (last && !activeCourseId && !searchInput.value.trim()) {
      const course = catalog.courses.find((c) => c.id === last.courseId);
      const mod = course && course.modules[last.modIndex];
      if (course && mod) {
        $('resumeTitle').textContent = `${course.code} · Modul ${mod.num}: ${mod.title}`;
        resumeBanner.classList.remove('hidden');
        resumeBanner.onclick = () => openReader(course.id, last.modIndex);
        return;
      }
    }
    resumeBanner.classList.add('hidden');
  }

  function renderDashboard() {
    activeCourseId = null;
    backCourseBtn.classList.add('hidden');
    heroCard.classList.remove('hidden');
    $('topTitle').textContent = catalog.appTitle;
    $('topSub').textContent = '4 Mata Kuliah · 36 Modul Ringkasan';
    updateOverallStats();

    const html = `
      <p class="section-label">Pilih Mata Kuliah</p>
      <div class="course-grid">
        ${catalog.courses.map((c) => {
          const doneCount = c.modules.filter((m) => doneSet.has(modKey(c.id, m.num))).length;
          const pct = Math.round((doneCount / c.modules.length) * 100);
          return `
            <article class="course-card" data-course="${c.id}">
              <div class="course-head">
                <div class="course-icon" style="background:linear-gradient(135deg,${c.color},${c.accent})">${c.icon}</div>
                <div style="min-width:0">
                  <div class="course-code">${c.code} · ${c.sks} SKS</div>
                  <h3 class="course-title">${c.title}</h3>
                  <div class="course-author">${c.author}</div>
                </div>
              </div>
              <div class="course-prog">
                <div class="mini-bar"><div style="width:${pct}%;background:${c.accent}"></div></div>
                <span>${doneCount}/${c.modules.length} Modul</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
    contentArea.innerHTML = html;
    contentArea.querySelectorAll('.course-card').forEach((el) => {
      el.addEventListener('click', () => renderCourse(el.dataset.course));
    });
  }

  function renderCourse(courseId) {
    const course = catalog.courses.find((c) => c.id === courseId);
    if (!course) return;
    activeCourseId = courseId;
    backCourseBtn.classList.remove('hidden');
    heroCard.classList.add('hidden');
    resumeBanner.classList.add('hidden');
    $('topTitle').textContent = `${course.code} — ${course.title}`;
    $('topSub').textContent = `${course.author} · ${course.modules.length} Modul`;

    const html = `
      <p class="section-label">Daftar Modul (${course.code})</p>
      <div class="module-list">
        ${course.modules.map((m, idx) => {
          const isDone = doneSet.has(modKey(course.id, m.num));
          return `
            <article class="module-item ${isDone ? 'done' : ''}" data-idx="${idx}">
              <div class="mod-badge" style="background:linear-gradient(135deg,${course.color},${course.accent})">${m.num}</div>
              <div class="mod-body">
                <div class="mod-meta">MODUL ${m.num}${isDone ? '<span class="done-tag">✓ Selesai</span>' : ''}</div>
                <div class="mod-title">${m.title}</div>
                <div class="mod-topics">${m.topics}</div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
    contentArea.innerHTML = html;
    contentArea.querySelectorAll('.module-item').forEach((el) => {
      el.addEventListener('click', () => openReader(course.id, Number(el.dataset.idx)));
    });
  }

  function renderSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      if (activeCourseId) renderCourse(activeCourseId);
      else renderDashboard();
      return;
    }
    heroCard.classList.add('hidden');
    resumeBanner.classList.add('hidden');

    const matches = [];
    catalog.courses.forEach((c) => {
      c.modules.forEach((m, idx) => {
        const hay = `${c.code} ${c.title} modul ${m.num} ${m.title} ${m.topics}`.toLowerCase();
        if (hay.includes(q)) matches.push({ course: c, mod: m, idx });
      });
    });

    if (!matches.length) {
      contentArea.innerHTML = `<p style="text-align:center;color:var(--muted);padding:32px 0">Tidak ada modul yang cocok dengan "<b>${q.replace(/</g, '&lt;')}</b>".</p>`;
      return;
    }

    contentArea.innerHTML = `
      <p class="section-label">Hasil Pencarian (${matches.length} Modul)</p>
      <div class="module-list">
        ${matches.map(({ course, mod, idx }) => {
          const isDone = doneSet.has(modKey(course.id, mod.num));
          return `
            <article class="module-item ${isDone ? 'done' : ''}" data-cid="${course.id}" data-idx="${idx}">
              <div class="mod-badge" style="background:${course.accent}">${mod.num}</div>
              <div class="mod-body">
                <div class="mod-meta">${course.code} · ${course.title}${isDone ? '<span class="done-tag">✓ Selesai</span>' : ''}</div>
                <div class="mod-title">${mod.title}</div>
                <div class="mod-topics">${mod.topics}</div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
    contentArea.querySelectorAll('.module-item').forEach((el) => {
      el.addEventListener('click', () => openReader(el.dataset.cid, Number(el.dataset.idx)));
    });
  }

  function openReader(courseId, modIndex) {
    const course = catalog.courses.find((c) => c.id === courseId);
    if (!course || !course.modules[modIndex]) return;
    currentReader = { course, modIndex };
    const mod = course.modules[modIndex];

    localStorage.setItem(STORAGE_LAST, JSON.stringify({ courseId, modIndex }));

    homeView.classList.add('hidden');
    readerView.classList.add('active');
    $('readerTitle').textContent = `Modul ${mod.num} — ${mod.title}`;
    $('readerSub').textContent = `${course.code} · ${course.title}`;

    const encodedPath = `modules/${encodeURIComponent(course.folder)}/${encodeURIComponent(mod.file)}`;
    readerFrame.src = encodedPath;

    $('prevModBtn').disabled = modIndex <= 0;
    $('nextModBtn').disabled = modIndex >= course.modules.length - 1;
    updateDoneButton();
  }

  function updateDoneButton() {
    if (!currentReader) return;
    const key = modKey(currentReader.course.id, currentReader.course.modules[currentReader.modIndex].num);
    const btn = $('toggleDoneBtn');
    const isDone = doneSet.has(key);
    btn.classList.toggle('is-done', isDone);
    btn.textContent = isDone ? '✓ Sudah Selesai' : '○ Tandai Selesai';
  }

  function closeReader() {
    readerView.classList.remove('active');
    homeView.classList.remove('hidden');
    readerFrame.src = 'about:blank';
    if (searchInput.value.trim()) renderSearch(searchInput.value);
    else if (activeCourseId) renderCourse(activeCourseId);
    else renderDashboard();
  }

  // Event bindings
  backCourseBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderDashboard();
  });
  $('readerBackBtn').addEventListener('click', closeReader);
  $('prevModBtn').addEventListener('click', () => {
    if (currentReader && currentReader.modIndex > 0) {
      openReader(currentReader.course.id, currentReader.modIndex - 1);
    }
  });
  $('nextModBtn').addEventListener('click', () => {
    if (currentReader && currentReader.modIndex < currentReader.course.modules.length - 1) {
      openReader(currentReader.course.id, currentReader.modIndex + 1);
    }
  });
  $('toggleDoneBtn').addEventListener('click', () => {
    if (!currentReader) return;
    const key = modKey(currentReader.course.id, currentReader.course.modules[currentReader.modIndex].num);
    if (doneSet.has(key)) doneSet.delete(key);
    else doneSet.add(key);
    saveDone();
    updateDoneButton();
  });

  $('themeToggleBtn').addEventListener('click', () => applyTheme(!isDarkMode()));
  $('readerThemeBtn').addEventListener('click', () => applyTheme(!isDarkMode()));

  $('fontDecBtn').addEventListener('click', () => {
    fontScale = Math.max(85, fontScale - 10);
    localStorage.setItem(STORAGE_FONT, String(fontScale));
    syncIframeAppearance();
  });
  $('fontIncBtn').addEventListener('click', () => {
    fontScale = Math.min(135, fontScale + 10);
    localStorage.setItem(STORAGE_FONT, String(fontScale));
    syncIframeAppearance();
  });

  readerFrame.addEventListener('load', syncIframeAppearance);
  searchInput.addEventListener('input', (e) => renderSearch(e.target.value));

  // PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $('installPwaBtn').classList.remove('hidden');
  });
  $('installPwaBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('installPwaBtn').classList.add('hidden');
  });

  // Register Service Worker (Option B: PWA Offline Support)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Init
  applyTheme(localStorage.getItem(STORAGE_THEME) === 'dark');
  fetch('catalog.json')
    .then((r) => r.json())
    .then((data) => {
      catalog = data;
      renderDashboard();
    })
    .catch((err) => {
      contentArea.innerHTML = `<p style="color:#b91c1c">Gagal memuat catalog.json: ${err.message}</p>`;
    });
})();
