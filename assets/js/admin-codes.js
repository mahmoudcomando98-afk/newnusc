import { supabase } from './supabase.js';
import { protectAdminPage } from './auth.js';
import { escapeHtml, showToast, initIcons } from './utils.js';

const state = {
  rows: [],
  parsedRows: [],
  codeCol: -1,
  nameCol: -1,
  genderCol: -1,
  linkedOnly: false
};

const $ = (id) => document.getElementById(id);
const normalizeCode = (v) => String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
const normKey = (v) => normalizeCode(v);

function roleLabel(role) {
  if (role === 'admin') return { text: 'أدمن', cls: 'badge-admin' };
  if (role === 'moderator') return { text: 'مشرف', cls: 'badge-mod' };
  return { text: 'طالب', cls: '' };
}

function statusBadge(row) {
  if (row.is_active === false) return '<span class="badge badge-off">موقوف</span>';
  if (row.linked_user_id) return '<span class="badge badge-success">نشط</span>';
  return '<span class="badge">لم يدخل بعد</span>';
}

function genderPill(g) {
  if (g === 'male') return '<span class="badge badge-m">شاب</span>';
  if (g === 'female') return '<span class="badge badge-f">شابة</span>';
  return '<span class="text-muted text-xs">تلقائي</span>';
}

function normGender(v) {
  const s = String(v || '').trim().toLowerCase().replace(/[\u064b-\u065f]/g, '');
  if (/^(m|male|boy|man|ذكر|ذكور|شب|شاب|ولد)/.test(s)) return 'male';
  if (/^(f|female|girl|woman|انثى|أنثى|شابة|بنت)/.test(s)) return 'female';
  return null;
}

function genderCellHtml(r) {
  return (
    '<select class="form-select gender-inline" data-id="' + escapeHtml(r.id) + '" aria-label="الجنس">' +
      '<option value=""' + (r.gender ? '' : ' selected') + '>تلقائي</option>' +
      '<option value="male"' + (r.gender === 'male' ? ' selected' : '') + '>شاب</option>' +
      '<option value="female"' + (r.gender === 'female' ? ' selected' : '') + '>شابة</option>' +
    '</select>'
  );
}

function filteredRows() {
  const q = ($('search')?.value || '').trim().toLowerCase();
  let rows = state.rows;
  if (state.linkedOnly) rows = rows.filter((r) => !!r.linked_user_id);
  if (!q) return rows;
  return rows.filter(
    (r) =>
      String(r.full_name || '').toLowerCase().includes(q) ||
      String(r.code || '').toLowerCase().includes(q)
  );
}

function updateCounts() {
  const total = state.rows.length;
  const inactive = state.rows.filter((r) => r.is_active === false).length;
  const linked = state.rows.filter((r) => r.linked_user_id).length;
  if ($('count-total')) $('count-total').textContent = String(total);
  if ($('count-active')) $('count-active').textContent = String(total - inactive);
  if ($('count-inactive')) $('count-inactive').textContent = String(inactive);
  if ($('count-linked')) $('count-linked').textContent = String(linked);
}

function rowActionsHtml(r) {
  return (
    '<div class="row-actions">' +
    '<button type="button" class="btn btn-sm btn-outline toggle-btn">' +
    (r.is_active === false ? 'تفعيل' : 'إيقاف') +
    '</button>' +
    (r.device_id
      ? '<button type="button" class="btn btn-sm btn-outline reset-device-btn">إعادة ضبط الجهاز</button>'
      : '') +
    (r.linked_user_id
      ? '<button type="button" class="btn btn-sm btn-outline unlink-btn">فك الربط</button>'
      : '') +
    '<button type="button" class="btn btn-sm btn-danger delete-btn">حذف</button>' +
    '</div>'
  );
}

function renderList() {
  const tbody = $('codes-list');
  const mobile = $('codes-mobile');
  if (!tbody) return;
  const rows = filteredRows().slice(0, 500);
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:16px">مفيش نتائج.</td></tr>';
    if (mobile)
      mobile.innerHTML =
        '<p class="text-muted" style="text-align:center;padding:16px;margin:0">مفيش نتائج.</p>';
    return;
  }
  tbody.innerHTML = rows
    .map((r) => {
      const role = roleLabel(r.role);
      return (
        '<tr data-id="' +
        escapeHtml(r.id) +
        '"><td>' +
        escapeHtml(r.full_name || '') +
        '</td><td><span class="code-pill">' +
        escapeHtml(r.code || '') +
        '</span></td><td><span class="badge ' +
        role.cls +
        '">' +
        role.text +
        '</span></td><td>' +
        genderCellHtml(r) +
        '</td><td>' +
        statusBadge(r) +
        '</td><td>' +
        rowActionsHtml(r) +
        '</td></tr>'
      );
    })
    .join('');
  if (mobile) {
    mobile.innerHTML = rows
      .map((r) => {
        const role = roleLabel(r.role);
        return (
          '<article class="code-card" data-id="' +
          escapeHtml(r.id) +
          '">' +
          '<div class="code-card-top"><div class="code-card-name">' +
          escapeHtml(r.full_name || '') +
          '</div><span class="badge ' +
          role.cls +
          '">' +
          role.text +
          '</span></div>' +
          '<div class="code-card-meta"><span class="code-pill">' +
          escapeHtml(r.code || '') +
          '</span>' +
          genderPill(r.gender) +
          statusBadge(r) +
          '</div>' +
          rowActionsHtml(r) +
          '</article>'
        );
      })
      .join('');
  }
}

async function loadCodes() {
  const tbody = $('codes-list');
  try {
    const { data, error } = await supabase
      .from('student_codes')
      .select('id, code, full_name, role, gender, is_active, linked_user_id, device_id, created_at')
      .order('full_name', { ascending: true })
      .limit(10000);
    if (error) throw error;
    state.rows = data || [];
    updateCounts();
    renderList();
  } catch (err) {
    console.error('[codes] load failed:', err);
    if (tbody)
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:16px">تعذر تحميل الكودات. نفّذ SETUP_NEW_DB.sql</td></tr>';
    const mob = $('codes-mobile');
    if (mob)
      mob.innerHTML =
        '<p class="text-muted" style="text-align:center;padding:16px">تعذر تحميل الكودات.</p>';
    showToast('تعذر تحميل الكودات.', 'error');
  }
}

function bindUi() {
  const addForm = $('add-form');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = normalizeCode($('code').value);
      const fullName = String($('full_name').value || '').trim();
      const role = $('role').value;
      const genderRaw = String($('gender')?.value || '');
      const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : null;
      if (!code || !fullName) {
        showToast('اكتب الكود والاسم.', 'error');
        return;
      }
      const btn = $('add-btn');
      if (btn) btn.disabled = true;
      try {
        const payload = { code, full_name: fullName, role };
        if (gender) payload.gender = gender;
        const { error } = await supabase.from('student_codes').insert(payload);
        if (error) {
          const msg = String(error.message || '');
          if (/duplicate|unique|already/i.test(msg)) showToast('الكود موجود بالفعل.', 'error');
          else showToast('تعذر الحفظ: ' + msg, 'error');
          return;
        }
        $('code').value = '';
        $('full_name').value = '';
        $('role').value = 'student';
        if ($('gender')) $('gender').value = '';
        showToast('تم حفظ الكود', 'success');
        await loadCodes();
      } catch (err) {
        showToast('تعذر الحفظ: ' + String(err?.message || err), 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  async function onCodesActionClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const host = btn.closest('tr, article.code-card');
    const id = host?.dataset?.id;
    if (!id) return;

    if (btn.classList.contains('toggle-btn')) {
      const row = state.rows.find((r) => r.id === id);
      const next = !(row && row.is_active === false);
      btn.disabled = true;
      const { error } = await supabase
        .from('student_codes')
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('id', id);
      btn.disabled = false;
      if (error) {
        showToast('تعذر التحديث: ' + error.message, 'error');
        return;
      }
      showToast(next ? 'تم تفعيل الكود.' : 'تم إيقاف الكود.', 'success');
      await loadCodes();
      return;
    }

    if (btn.classList.contains('reset-device-btn')) {
      const row = state.rows.find((r) => r.id === id);
      if (!confirm('إعادة ضبط جهاز «' + (row?.full_name || row?.code || '') + '»؟')) return;
      btn.disabled = true;
      const { error } = await supabase
        .from('student_codes')
        .update({ device_id: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      btn.disabled = false;
      if (error) {
        showToast('تعذر مسح ربط الجهاز: ' + error.message, 'error');
        return;
      }
      showToast('تم مسح ربط الجهاز.', 'success');
      await loadCodes();
      return;
    }

    if (btn.classList.contains('unlink-btn')) {
      const row = state.rows.find((r) => r.id === id);
      if (!confirm('فك ربط «' + (row?.full_name || row?.code || '') + '»؟')) return;
      btn.disabled = true;
      const { error } = await supabase
        .from('student_codes')
        .update({ linked_user_id: null, device_id: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      btn.disabled = false;
      if (error) {
        showToast('تعذر فك الربط: ' + error.message, 'error');
        return;
      }
      showToast('تم فك الربط.', 'success');
      await loadCodes();
      return;
    }

    if (btn.classList.contains('delete-btn')) {
      const row = state.rows.find((r) => r.id === id);
      if (!confirm('حذف كود «' + (row?.full_name || '') + '»؟')) return;
      btn.disabled = true;
      const { error } = await supabase.from('student_codes').delete().eq('id', id);
      btn.disabled = false;
      if (error) {
        showToast('تعذر الحذف: ' + error.message, 'error');
        return;
      }
      showToast('تم حذف الكود.', 'success');
      await loadCodes();
    }
  }

  async function onInlineGenderChange(e) {
    const select = e.target.closest('.gender-inline');
    if (!select) return;
    const id = select.dataset?.id;
    if (!id) return;
    const value = select.value;
    const valid = value === 'male' || value === 'female' ? value : null;
    select.disabled = true;
    const { error } = await supabase.rpc('admin_set_code_gender', {
      p_code_id: id,
      p_gender: valid
    });
    select.disabled = false;
    if (error) {
      showToast('تعذر تحديث الجنس: ' + error.message, 'error');
      return;
    }
    const row = state.rows.find((r) => r.id === id);
    if (row) row.gender = valid;
    showToast(
      value === 'male' ? 'اتظبط: شب' : value === 'female' ? 'اتظبطت: شابة' : 'اترجع تلقائي (من الاسم)',
      'success'
    );
  }
  $('codes-list')?.addEventListener('change', onInlineGenderChange);
  $('codes-mobile')?.addEventListener('change', onInlineGenderChange);

  $('codes-list')?.addEventListener('click', onCodesActionClick);
  $('codes-mobile')?.addEventListener('click', onCodesActionClick);
  $('search')?.addEventListener('input', renderList);

  $('filter-linked-btn')?.addEventListener('click', () => {
    state.linkedOnly = !state.linkedOnly;
    const b = $('filter-linked-btn');
    b.setAttribute('aria-pressed', String(state.linkedOnly));
    b.textContent = state.linkedOnly ? 'عرض الكل' : 'عرض المسجلين فقط';
    renderList();
  });

  $('export-btn')?.addEventListener('click', () => {
    const rows = filteredRows();
    const lines = ['code,full_name,role,gender,is_active,linked'];
    for (const r of rows) {
      lines.push(
        [r.code, r.full_name, r.role, r.gender || '', r.is_active !== false ? '1' : '0', r.linked_user_id ? '1' : '0']
          .map((v) => '"' + String(v || '').replace(/"/g, '""') + '"')
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'student-codes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function guessCol(headers, patterns) {
    const lower = headers.map((h) => String(h || '').toLowerCase());
    for (let i = 0; i < lower.length; i++) {
      if (patterns.some((p) => lower[i].includes(p))) return i;
    }
    return 0;
  }

  function findColByPattern(headers, patterns) {
    const lower = headers.map((h) => String(h || '').toLowerCase());
    for (let i = 0; i < lower.length; i++) {
      if (patterns.some((p) => lower[i].includes(p))) return i;
    }
    return -1;
  }

  let sheetMatrix = [];

  function applyImportPreview() {
    const ci = Number($('code-col').value) || 0;
    const ni = Number($('name-col').value) || 0;
    const gi = $('gender-col') ? Number($('gender-col').value) : -1;
    const rows = [];
    for (let i = 1; i < sheetMatrix.length; i++) {
      const row = sheetMatrix[i] || [];
      const code = normalizeCode(row[ci]);
      const name = String(row[ni] || '').trim();
      if (!code && !name) continue;
      const gender = gi >= 0 ? normGender(row[gi]) : null;
      rows.push({ code, full_name: name, gender });
    }
    state.parsedRows = rows;
    if ($('import-total')) $('import-total').textContent = String(rows.length);
    if ($('import-preview')) {
      $('import-preview').innerHTML = rows
        .slice(0, 8)
        .map(
          (r, i) =>
            '<tr><td>' +
            (i + 1) +
            '</td><td><span class="code-pill">' +
            escapeHtml(r.code) +
            '</span></td><td>' +
            escapeHtml(r.full_name) +
            '</td><td>' +
            genderPill(r.gender) +
            '</td></tr>'
        )
        .join('');
    }
    const wrap = $('import-preview-wrap');
    if (wrap) wrap.style.display = 'block';
  }

  $('xlsx-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      sheetMatrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!sheetMatrix.length) {
        showToast('الملف فاضي.', 'error');
        return;
      }
      const headers = sheetMatrix[0].map((h) => String(h || ''));
      const codeSel = $('code-col');
      const nameSel = $('name-col');
      const genderSel = $('gender-col');
      codeSel.innerHTML = '';
      nameSel.innerHTML = '';
      genderSel.innerHTML = '';
      headers.forEach((h, i) => {
        const o1 = document.createElement('option');
        o1.value = String(i);
        o1.textContent = h || 'عمود ' + (i + 1);
        codeSel.appendChild(o1);
        nameSel.appendChild(o1.cloneNode(true));
        genderSel.appendChild(o1.cloneNode(true));
      });
      const empty = document.createElement('option');
      empty.value = '-1';
      empty.textContent = '— اتركها تلقائي (من الاسم) —';
      genderSel.insertBefore(empty, genderSel.firstChild);
      codeSel.value = String(guessCol(headers, ['code', 'كود', 'id', 'رقم']));
      nameSel.value = String(guessCol(headers, ['name', 'اسم', 'full']));
      genderSel.value = '-1';
      const foundGenderCol = findColByPattern(headers, ['gender', 'جنس', 'النوع', 'sex']);
      if (foundGenderCol !== -1 && String(foundGenderCol) !== codeSel.value && String(foundGenderCol) !== nameSel.value) {
        genderSel.value = String(foundGenderCol);
      }
      $('import-pickers').style.display = 'block';
      applyImportPreview();
    } catch (err) {
      showToast('تعذر قراءة الملف: ' + String(err?.message || err), 'error');
    }
  });

  $('apply-cols-btn')?.addEventListener('click', applyImportPreview);

  $('import-btn')?.addEventListener('click', async () => {
    const rows = state.parsedRows || [];
    if (!rows.length) {
      showToast('مفيش صفوف للاستيراد.', 'error');
      return;
    }
    if (!confirm('استيراد ' + rows.length + ' صف؟')) return;
    const btn = $('import-btn');
    const summary = $('import-summary');
    btn.disabled = true;
    btn.textContent = '...';
    const existing = new Set(state.rows.map((r) => normKey(r.code)));
    let inserted = 0,
      skippedExisting = 0,
      skippedDup = 0,
      skippedInvalid = 0,
      failed = 0;
    const seen = new Set();
    const toInsert = [];
    for (const r of rows) {
      if (!r.code || !r.full_name) {
        skippedInvalid++;
        continue;
      }
      const k = normKey(r.code);
      if (seen.has(k)) {
        skippedDup++;
        continue;
      }
      seen.add(k);
      if (existing.has(k)) {
        skippedExisting++;
        continue;
      }
      toInsert.push({ code: r.code, full_name: r.full_name, role: 'student', ...(r.gender ? { gender: r.gender } : {}) });
    }
    try {
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error } = await supabase.from('student_codes').insert(chunk);
        if (error) {
          failed += chunk.length;
          console.error(error);
        } else inserted += chunk.length;
      }
      await loadCodes();
      summary.textContent =
        'تم استيراد ' +
        inserted +
        (skippedExisting ? ' · اتخطى ' + skippedExisting + ' موجود' : '') +
        (skippedDup ? ' · ' + skippedDup + ' مكرر' : '') +
        (skippedInvalid ? ' · ' + skippedInvalid + ' فاضي' : '') +
        (failed ? ' · فشل ' + failed : '');
      summary.className = 'import-summary' + (failed ? ' error' : '');
      summary.style.display = 'block';
      showToast('انتهى الاستيراد: ' + inserted, failed ? 'error' : 'success');
    } catch (err) {
      summary.textContent = 'فشل الاستيراد: ' + String(err?.message || err);
      summary.className = 'import-summary error';
      summary.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'استيراد الكل';
    }
  });
}

(async function init() {
  const ok = await protectAdminPage();
  if (!ok) return;
  document.documentElement.classList.remove('admin-auth-pending');
  initIcons();
  bindUi();
  await loadCodes();
})();
