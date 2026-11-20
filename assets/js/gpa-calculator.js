/**
 * COMANDO — حاسبة GPA (فصلي + تراكمي)
 * حساب محلي بالكامل — لا يلمس قاعدة البيانات.
 */
import { protectPage } from './auth.js';
import { initIcons, setActiveNav, showToast } from './utils.js';

const STORAGE_KEY = 'comando_gpa_v1';
const MAX_GPA = 4;

const PRESETS = {
  standard4: {
    label: 'نظام 4.00 القياسي (A+/A = 4.00)',
    grades: [
      ['A+', 4.0], ['A', 4.0], ['A-', 3.7], ['B+', 3.3], ['B', 3.0], ['B-', 2.7],
      ['C+', 2.3], ['C', 2.0], ['C-', 1.7], ['D+', 1.3], ['D', 1.0], ['D-', 0.7], ['F', 0]
    ]
  },
  simple4: {
    label: 'نظام 4.00 المبسّط (A=4 / B=3 / C=2 / D=1)',
    grades: [['A', 4], ['B', 3], ['C', 2], ['D', 1], ['F', 0]]
  },
  arabic4: {
    label: 'تقديرات عربية (امتياز / جيد جدًا / جيد / مقبول)',
    grades: [['امتياز', 4], ['جيد جدًا', 3.5], ['جيد', 3], ['مقبول', 2], ['ضعيف', 0]]
  }
};

/* جدول تحويل النسبة المئوية — قياسي ومعلن للمستخدم في صندوق المساعدة */
const PERCENT_BANDS = [
  { min: 90, points: 4.0, mid: 95, label: '90 – 100' },
  { min: 85, points: 3.7, mid: 87, label: '85 – 89' },
  { min: 80, points: 3.3, mid: 82, label: '80 – 84' },
  { min: 75, points: 3.0, mid: 77, label: '75 – 79' },
  { min: 70, points: 2.7, mid: 72, label: '70 – 74' },
  { min: 65, points: 2.3, mid: 67, label: '65 – 69' },
  { min: 60, points: 2.0, mid: 62, label: '60 – 64' },
  { min: 0, points: 0, mid: 50, label: 'أقل من 60' }
];

const state = {
  mode: 'letter', // letter | points | percent
  preset: 'standard4', // standard4 | simple4 | arabic4 | custom
  scale: [], // [{ letter, points }]
  courses: [], // [{ id, name, value, hours }]
  cum: { enabled: false, gpa: '', hours: '' }
};

let saveTimer = null;
const $ = (id) => document.getElementById(id);

/* ===== أدوات مساعدة ===== */
function uid() {
  return 'c' + Math.random().toString(36).slice(2, 9);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round(n, digits = 2) {
  const p = 10 ** digits;
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}

function fmt(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const v = round(n, digits);
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

function presetScale(key) {
  const preset = PRESETS[key] || PRESETS.standard4;
  return preset.grades.map(([letter, points]) => ({ letter, points }));
}

function courseWord(n) {
  return n === 1 ? 'مادة واحدة' : n === 2 ? 'مادتان' : `${n} مواد`;
}

function hoursWord(n) {
  if (n === 1) return 'ساعة معتمدة واحدة';
  if (n === 2) return 'ساعتان معتمدتان';
  return `${fmt(n, 1)} ساعات معتمدة`;
}

/* ===== الحالة الافتراضية والحفظ ===== */
function newCourse() {
  return { id: uid(), name: '', value: defaultGradeValue(), hours: 3 };
}

function defaultGradeValue() {
  if (state.mode === 'letter') return state.scale[0]?.letter || 'A';
  if (state.mode === 'points') return 4;
  return 90;
}

function loadState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }

  if (saved && typeof saved === 'object') {
    if (['letter', 'points', 'percent'].includes(saved.mode)) state.mode = saved.mode;

    state.scale = Array.isArray(saved.scale)
      ? saved.scale
          .filter((g) => g && typeof g.letter === 'string' && Number.isFinite(Number(g.points)))
          .map((g) => ({ letter: g.letter, points: clamp(Number(g.points), 0, MAX_GPA) }))
      : [];

    if (!state.scale.length) state.scale = presetScale(saved?.preset);
    state.preset = saved.preset && (PRESETS[saved.preset] || saved.preset === 'custom') ? saved.preset : 'custom';

    state.courses = Array.isArray(saved.courses)
      ? saved.courses
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            id: String(c.id || uid()),
            name: String(c.name || '').slice(0, 80),
            value: c.value === undefined || c.value === null ? '' : c.value,
            hours: c.hours === undefined || c.hours === null ? 3 : c.hours
          }))
      : [];

    state.cum = {
      enabled: !!(saved.cum && saved.cum.enabled),
      gpa: saved.cum && saved.cum.gpa !== undefined && saved.cum.gpa !== null ? String(saved.cum.gpa) : '',
      hours: saved.cum && saved.cum.hours !== undefined && saved.cum.hours !== null ? String(saved.cum.hours) : ''
    };
  }

  if (!state.courses.length) state.courses = [newCourse()];
  state.courses.forEach((course) => {
    course.value = normalizeValue(course.value);
    const h = Number(course.hours);
    if (!Number.isFinite(h) || h < 0) course.hours = 3;
  });
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* التخزين المحلي مش متاح — الحاسبة بتشتغل عادي في الجلسة */
    }
  }, 200);
}

/* ===== تحويل القيم بين أنماط الإدخال ===== */
function normalizeValue(raw) {
  if (state.mode === 'letter') {
    const found = state.scale.find((g) => g.letter === raw);
    return found ? found.letter : state.scale[0]?.letter || 'A';
  }
  const n = Number(raw);
  if (state.mode === 'points') {
    return Number.isFinite(n) ? clamp(round(n, 2), 0, MAX_GPA) : 0;
  }
  return Number.isFinite(n) ? clamp(round(n, 1), 0, 100) : 90;
}

function percentToPoints(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return NaN;
  const band = PERCENT_BANDS.find((b) => n >= b.min);
  return band ? band.points : 0;
}

function pointsToPercent(points) {
  const n = Number(points);
  if (!Number.isFinite(n)) return 60;
  let best = PERCENT_BANDS[0];
  PERCENT_BANDS.forEach((band) => {
    if (Math.abs(band.points - n) < Math.abs(best.points - n)) best = band;
  });
  return best.mid;
}

function nearestLetter(points) {
  const n = Number(points);
  if (!Number.isFinite(n) || !state.scale.length) return state.scale[0]?.letter || 'A';
  let best = state.scale[0];
  state.scale.forEach((g) => {
    if (Math.abs(g.points - n) < Math.abs(best.points - n)) best = g;
  });
  return best.letter;
}

function valueToPoints(value, mode) {
  if (mode === 'letter') {
    const g = state.scale.find((x) => x.letter === value);
    return g ? Number(g.points) : NaN;
  }
  if (mode === 'percent') return percentToPoints(Number(value));
  return Number(value);
}

function convertValue(value, from, to) {
  const points = valueToPoints(value, from);
  if (to === 'letter') return nearestLetter(points);
  if (to === 'points') return Number.isFinite(points) ? clamp(round(points, 1), 0, MAX_GPA) : 0;
  return Number.isFinite(points) ? pointsToPercent(points) : 60;
}

/* ===== الحساب ===== */
function pointsForCourse(course) {
  return valueToPoints(course.value, state.mode);
}

function gradeLabel(gpa) {
  if (gpa == null || !Number.isFinite(gpa)) return '—';
  if (gpa >= 3.7) return 'امتياز';
  if (gpa >= 3.3) return 'جيد جدًا';
  if (gpa >= 2.7) return 'جيد';
  if (gpa >= 2.0) return 'مقبول';
  return 'ضعيف — إنذار';
}

function calculate() {
  let hours = 0;
  let points = 0;
  let counted = 0;
  let invalidRows = 0;

  state.courses.forEach((course) => {
    const h = Number(course.hours);
    const pts = pointsForCourse(course);
    const hoursOk = Number.isFinite(h) && h > 0 && h <= 30;
    const gradeOk = Number.isFinite(pts) && pts >= 0 && pts <= MAX_GPA;
    if (!hoursOk || !gradeOk) {
      invalidRows += 1;
      return;
    }
    hours += h;
    points += pts * h;
    counted += 1;
  });

  const gpa = hours > 0 ? points / hours : null;

  const cum = state.cum;
  const prevGpaRaw = Number(cum.gpa);
  const prevHoursRaw = Number(cum.hours);
  const prevGpaOk =
    cum.gpa !== '' && Number.isFinite(prevGpaRaw) && prevGpaRaw >= 0 && prevGpaRaw <= MAX_GPA;
  const prevHoursOk = cum.hours !== '' && Number.isFinite(prevHoursRaw) && prevHoursRaw >= 0;

  let cumGpa = null;
  let cumHours = 0;
  let cumValid = false;

  if (cum.enabled && prevGpaOk && prevHoursOk) {
    cumHours = prevHoursRaw + hours;
    cumGpa = cumHours > 0 ? (prevGpaRaw * prevHoursRaw + points) / cumHours : null;
    cumValid = cumGpa != null;
  }

  return {
    gpa,
    hours,
    points,
    counted,
    invalidRows,
    cumEnabled: cum.enabled,
    cumValid,
    cumGpa,
    cumHours,
    prevGpaOk,
    prevHoursOk
  };
}

/* ===== عرض النتائج ===== */
function updateResult(result) {
  const gpaValue = $('gpa-value');
  const gradeBadge = $('gpa-grade-label');
  const note = $('gpa-result-note');
  const progress = $('gpa-progress-bar');

  if (result.gpa == null) {
    gpaValue.textContent = '0.00';
    gradeBadge.textContent = '—';
    gradeBadge.classList.remove('is-warn');
    progress.style.width = '0%';
    note.textContent = 'ضيف موادك وساعاتها عشان يظهر المعدل.';
  } else {
    gpaValue.textContent = result.gpa.toFixed(2);
    gradeBadge.textContent = gradeLabel(result.gpa);
    gradeBadge.classList.toggle('is-warn', result.gpa < 2);
    progress.style.width = clamp((result.gpa / MAX_GPA) * 100, 0, 100) + '%';
    note.textContent = result.invalidRows
      ? 'في صفوف فيها بيانات غير صحيحة — صحّحها عشان الحساب يبقى دقيق.'
      : `محسوب على ${courseWord(result.counted)} و ${hoursWord(result.hours)}.`;
  }

  $('gpa-hours').textContent = fmt(result.hours, 1);
  $('gpa-points').textContent = fmt(result.points, 2);
  const courseCount = state.courses.length;
  $('gpa-course-count').textContent = courseWord(courseCount);

  const alertEl = $('gpa-alert');
  if (result.invalidRows > 0) {
    alertEl.textContent =
      'في بيانات محتاجة تصحيح: الساعات لازم تكون أكبر من 0 وأقل من أو تساوي 30، والدرجة لازم تكون في حدود المقياس.';
    alertEl.classList.remove('hidden');
  } else {
    alertEl.classList.add('hidden');
  }

  const cumBox = $('gpa-cum-box');
  cumBox.classList.toggle('hidden', !result.cumEnabled);
  if (result.cumEnabled) {
    $('gpa-cum-value').textContent = result.cumValid ? result.cumGpa.toFixed(2) : '—';
    $('gpa-cum-hours').textContent = result.cumValid
      ? `${fmt(result.cumHours, 1)} ساعة إجمالية`
      : 'دخّل معدل وساعات صحيحة';
    $('gpa-cum-label').textContent = result.cumValid ? gradeLabel(result.cumGpa) : '—';
  }

  /* تمييز الحقول غير الصحيحة */
  state.courses.forEach((course) => {
    const row = document.querySelector(`.gpa-course[data-id="${cssEscape(course.id)}"]`);
    if (!row) return;
    const h = Number(course.hours);
    const pts = pointsForCourse(course);
    const hoursOk = Number.isFinite(h) && h > 0 && h <= 30;
    const gradeOk = Number.isFinite(pts) && pts >= 0 && pts <= MAX_GPA;
    const hoursInput = row.querySelector('[data-field="hours"]');
    const gradeInput = row.querySelector('[data-field="grade"]');
    if (hoursInput) hoursInput.closest('.gpa-field')?.classList.toggle('is-invalid', !hoursOk);
    if (gradeInput) gradeInput.closest('.gpa-field')?.classList.toggle('is-invalid', !gradeOk);
  });

  const prevGpaInput = $('gpa-prev-gpa');
  const prevHoursInput = $('gpa-prev-hours');
  if (prevGpaInput) prevGpaInput.classList.toggle('is-invalid', result.cumEnabled && !result.prevGpaOk);
  if (prevHoursInput) prevHoursInput.classList.toggle('is-invalid', result.cumEnabled && !result.prevHoursOk);
}

function syncCalc() {
  updateResult(calculate());
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

/* ===== رسم المواد ===== */
function makeField(labelText, control, extraClass) {
  const wrap = document.createElement('div');
  wrap.className = 'gpa-field' + (extraClass ? ' ' + extraClass : '');
  const label = document.createElement('span');
  label.className = 'gpa-field-label';
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function makeGradeControl(course) {
  if (state.mode === 'letter') {
    const select = document.createElement('select');
    select.className = 'form-select';
    select.dataset.field = 'grade';
    select.setAttribute('aria-label', 'تقدير المادة');
    state.scale.forEach((g) => {
      const option = document.createElement('option');
      option.value = g.letter;
      option.textContent = `${g.letter} (${fmt(g.points, 2)})`;
      select.appendChild(option);
    });
    select.value = course.value;
    select.addEventListener('change', () => {
      course.value = select.value;
      afterChange();
    });
    return select;
  }

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'form-input';
  input.dataset.field = 'grade';
  input.min = '0';
  input.max = state.mode === 'percent' ? '100' : '4';
  input.step = state.mode === 'percent' ? '1' : '0.1';
  input.inputMode = 'decimal';
  input.setAttribute('aria-label', state.mode === 'percent' ? 'نسبة المادة' : 'نقاط المادة');
  input.placeholder = state.mode === 'percent' ? '90' : '3.5';
  input.value = course.value;
  input.addEventListener('input', () => {
    course.value = input.value === '' ? '' : Number(input.value.replace(',', '.'));
    afterChange();
  });
  return input;
}

function createCourseRow(course) {
  const row = document.createElement('div');
  row.className = 'gpa-course';
  row.dataset.id = course.id;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-input';
  nameInput.dataset.field = 'name';
  nameInput.maxLength = 80;
  nameInput.placeholder = 'اسم المادة (اختياري)';
  nameInput.setAttribute('aria-label', 'اسم المادة');
  nameInput.value = course.name || '';
  nameInput.addEventListener('input', () => {
    course.name = nameInput.value.slice(0, 80);
    afterChange();
  });

  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.className = 'form-input';
  hoursInput.dataset.field = 'hours';
  hoursInput.min = '0.5';
  hoursInput.max = '30';
  hoursInput.step = '0.5';
  hoursInput.inputMode = 'decimal';
  hoursInput.setAttribute('aria-label', 'عدد الساعات المعتمدة');
  hoursInput.value = course.hours;
  hoursInput.addEventListener('input', () => {
    course.hours = hoursInput.value === '' ? '' : Number(hoursInput.value.replace(',', '.'));
    afterChange();
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'gpa-remove';
  remove.innerHTML = '&times;';
  remove.title = 'حذف المادة';
  remove.setAttribute('aria-label', 'حذف المادة');
  remove.addEventListener('click', () => {
    if (state.courses.length === 1) {
      const fresh = newCourse();
      state.courses[0] = { ...fresh, id: state.courses[0].id };
    } else {
      state.courses = state.courses.filter((c) => c.id !== course.id);
    }
    renderCourses();
    save();
  });

  row.append(
    makeField('المادة', nameInput, 'gpa-field-name'),
    makeField(state.mode === 'letter' ? 'التقدير' : state.mode === 'percent' ? 'النسبة %' : 'النقاط', makeGradeControl(course), 'gpa-field-grade'),
    makeField('الساعات', hoursInput, 'gpa-field-hours'),
    remove
  );
  return row;
}

function renderCourses() {
  const list = $('gpa-courses');
  list.textContent = '';
  state.courses.forEach((course) => list.appendChild(createCourseRow(course)));
  syncCalc();
}

/* ===== محرر نظام التقديرات ===== */
function renderPresetOptions() {
  const select = $('gpa-preset');
  select.textContent = '';
  Object.entries(PRESETS).forEach(([key, preset]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = preset.label;
    select.appendChild(option);
  });
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'نظام مخصص (بتعدّله بنفسك)';
  select.appendChild(custom);
  select.value = state.preset;
}

function renderScaleEditor() {
  const box = $('gpa-scale-editor');
  box.textContent = '';
  state.scale.forEach((grade) => {
    const row = document.createElement('div');
    row.className = 'gpa-scale-row';

    const label = document.createElement('span');
    label.className = 'gpa-scale-letter';
    label.textContent = grade.letter;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'form-input';
    input.min = '0';
    input.max = '4';
    input.step = '0.1';
    input.inputMode = 'decimal';
    input.value = grade.points;
    input.setAttribute('aria-label', `نقاط تقدير ${grade.letter}`);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      grade.points = clamp(value, 0, MAX_GPA);
      state.preset = 'custom';
      $('gpa-preset').value = 'custom';
      renderCourses();
      save();
    });

    row.append(label, input);
    box.appendChild(row);
  });
}

/* ===== واجهة التحكم العامة ===== */
function syncControls() {
  $('gpa-mode').value = state.mode;
  $('gpa-preset').value = state.preset;
  $('gpa-cum-enabled').checked = state.cum.enabled;
  $('gpa-prev-gpa').value = state.cum.gpa;
  $('gpa-prev-hours').value = state.cum.hours;
  syncCumFields();
}

function syncCumFields() {
  const fields = $('gpa-cum-fields');
  const disabled = !state.cum.enabled;
  fields.classList.toggle('is-disabled', disabled);
  $('gpa-prev-gpa').disabled = disabled;
  $('gpa-prev-hours').disabled = disabled;
}

function afterChange() {
  syncCalc();
  save();
}

function resetToDefaults(persist = true) {
  state.mode = 'letter';
  state.preset = 'standard4';
  state.scale = presetScale('standard4');
  state.courses = [newCourse()];
  state.cum = { enabled: false, gpa: '', hours: '' };
  syncControls();
  renderPresetOptions();
  renderScaleEditor();
  renderCourses();
  if (persist) save();
}

/* ===== الأحداث ===== */
function bindEvents() {
  $('gpa-mode').addEventListener('change', (event) => {
    const next = event.target.value;
    if (!['letter', 'points', 'percent'].includes(next) || next === state.mode) return;
    state.courses.forEach((course) => {
      course.value = convertValue(course.value, state.mode, next);
    });
    state.mode = next;
    renderCourses();
    save();
  });

  $('gpa-preset').addEventListener('change', (event) => {
    const key = event.target.value;
    if (key === 'custom') {
      state.preset = 'custom';
      save();
      return;
    }
    if (!PRESETS[key]) return;
    state.preset = key;
    state.scale = presetScale(key);
    if (state.mode === 'letter') {
      const letters = state.scale.map((g) => g.letter);
      state.courses.forEach((course) => {
        if (!letters.includes(course.value)) course.value = letters[0];
      });
    }
    renderScaleEditor();
    renderCourses();
    save();
  });

  $('gpa-add').addEventListener('click', () => {
    state.courses.push(newCourse());
    renderCourses();
    save();
    const rows = document.querySelectorAll('.gpa-course');
    const last = rows[rows.length - 1];
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      last.querySelector('input[data-field="name"]')?.focus();
    }
  });

  $('gpa-cum-enabled').addEventListener('change', (event) => {
    state.cum.enabled = event.target.checked;
    syncCumFields();
    afterChange();
  });

  $('gpa-prev-gpa').addEventListener('input', (event) => {
    state.cum.gpa = event.target.value;
    afterChange();
  });

  $('gpa-prev-hours').addEventListener('input', (event) => {
    state.cum.hours = event.target.value;
    afterChange();
  });

  $('gpa-calc').addEventListener('click', () => {
    syncCalc();
    const result = calculate();
    if (result.gpa == null) {
      showToast('ضيف مادة صحيحة الأول عشان نقدر نحسب المعدل');
      return;
    }
    showToast('تم حساب المعدل بنجاح');
    if (window.matchMedia('(max-width: 980px)').matches) {
      $('gpa-result-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('gpa-reset').addEventListener('click', () => {
    if (!window.confirm('هتعيد ضبط الحاسبة وتمسح المواد اللي أدخلتها. متأكد؟')) return;
    resetToDefaults(true);
    showToast('تمت إعادة ضبط الحاسبة');
  });

  $('gpa-clear-storage').addEventListener('click', () => {
    if (!window.confirm('هتمسح البيانات المحفوظة على الجهاز نهائيًا. متأكد؟')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    resetToDefaults(false);
    showToast('تم مسح البيانات المحفوظة');
  });
}

/* ===== التشغيل ===== */
async function init() {
  initIcons();
  setActiveNav('gpa');

  loadState();
  syncControls();
  renderPresetOptions();
  renderScaleEditor();
  renderCourses();
  bindEvents();

  try {
    const result = await protectPage();
    if (!result) return;
  } catch {
    /* لو التحقق فشل بسبب الشبكة، الحاسبة تفضل شغالة محليًا */
  }
}

init();
