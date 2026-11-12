import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

const CAIRO_HEAD_SNIPPET = `
  <link rel="stylesheet" href="/comando-cairo.css?v=3" />
  <style id="comando-cairo-boot">html,body,button,input,select,textarea{font-family:"Cairo",Tahoma,Arial,sans-serif!important}</style>
`;

/* يُحقن في كل صفحة: سكربت تهيئة الوضع الليلي (قبل الرسم لمنع الوميض) + ملف أنماطه + سكربت الزر
   الافتراضي دائمًا نهاري — الطالب يقدر يبدّل بنفسه ويحفظ اختياره */
const THEME_HEAD_SNIPPET = `
  <script id="comando-theme-init">(function(){try{var t=localStorage.getItem('comando-theme');if(t!=='dark'&&t!=='light'){t='light';}}catch(e){t='light';}document.documentElement.setAttribute('data-theme',t);})();</script>
  <link rel="stylesheet" href="/assets/css/dark-theme.css?v=2" />
`;
const THEME_BODY_SNIPPET = `<script type="module" src="/assets/js/theme.js?v=2"></script>`;
const AI_ASSISTANT_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/ai-assistant.css?v=10" />`;
const AI_ASSISTANT_BODY_SNIPPET = `<script type="module" src="/assets/js/ai-assistant.js?v=11"></script>`;

function injectAiAssistantPlugin() {
  return {
    name: 'inject-ai-assistant',
    transformIndexHtml(html) {
      let out = html;
      if (!out.includes('ai-assistant.css')) {
        if (out.includes('</head>')) {
          out = out.replace('</head>', `${AI_ASSISTANT_HEAD_SNIPPET}\n</head>`);
        } else if (out.includes('<head>')) {
          out = out.replace('<head>', `<head>${AI_ASSISTANT_HEAD_SNIPPET}`);
        }
      }
      if (!out.includes('/assets/js/ai-assistant.js') && out.includes('</body>')) {
        out = out.replace('</body>', `${AI_ASSISTANT_BODY_SNIPPET}\n</body>`);
      }
      return out;
    }
  };
}

function injectThemePlugin() {
  return {
    name: 'inject-theme',
    transformIndexHtml(html) {
      let out = html;
      if (!out.includes('comando-theme-init')) {
        if (out.includes('<head>')) {
          out = out.replace('<head>', `<head>${THEME_HEAD_SNIPPET}`);
        } else if (out.includes('<head ')) {
          out = out.replace(/<head([^>]*)>/i, `<head$1>${THEME_HEAD_SNIPPET}`);
        }
      }
      if (!out.includes('/assets/js/theme.js') && out.includes('</body>')) {
        out = out.replace('</body>', `${THEME_BODY_SNIPPET}\n</body>`);
      }
      return out;
    }
  };
}

function injectCairoPlugin() {
  return {
    name: 'inject-cairo-font',
    transformIndexHtml(html) {
      if (html.includes('comando-cairo.css')) return html;
      if (html.includes('<head>')) {
        return html.replace('<head>', `<head>${CAIRO_HEAD_SNIPPET}`);
      }
      if (html.includes('<head ')) {
        return html.replace(/<head([^>]*)>/i, `<head$1>${CAIRO_HEAD_SNIPPET}`);
      }
      return html;
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);

  return {
    root: '.',
    publicDir: 'public',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [injectCairoPlugin(), injectThemePlugin(), injectAiAssistantPlugin()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          env.VITE_SUPABASE_ANON_KEY ||
          env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          ''
      )
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          '404': resolve(import.meta.dirname, '404.html'),
          '500': resolve(import.meta.dirname, '500.html'),
          offline: resolve(import.meta.dirname, 'offline.html'),
          banned: resolve(import.meta.dirname, 'banned.html'),
          'devtools-blocked': resolve(import.meta.dirname, 'devtools-blocked.html'),
          'chrome-required': resolve(import.meta.dirname, 'chrome-required.html'),
          about: resolve(import.meta.dirname, 'about.html'),
          contact: resolve(import.meta.dirname, 'contact.html'),
          privacy: resolve(import.meta.dirname, 'privacy.html'),
          login: resolve(import.meta.dirname, 'login.html'),
          home: resolve(import.meta.dirname, 'home.html'),
          subjects: resolve(import.meta.dirname, 'subjects.html'),
          'past-exams': resolve(import.meta.dirname, 'past-exams.html'),
          'past-exam-subject': resolve(import.meta.dirname, 'past-exam-subject.html'),
          'subject-details': resolve(import.meta.dirname, 'subject-details.html'),
          'file-view': resolve(import.meta.dirname, 'file-view.html'),
          'lecture-details': resolve(import.meta.dirname, 'lecture-details.html'),
          quizzes: resolve(import.meta.dirname, 'quizzes.html'),
          'quiz-take': resolve(import.meta.dirname, 'quiz-take.html'),
          'quiz-rules': resolve(import.meta.dirname, 'quiz-rules.html'),
          schedule: resolve(import.meta.dirname, 'schedule.html'),
          'online-sections': resolve(import.meta.dirname, 'online-sections.html'),
          'online-schedule': resolve(import.meta.dirname, 'online-schedule.html'),
          announcements: resolve(import.meta.dirname, 'announcements.html'),
          notifications: resolve(import.meta.dirname, 'notifications.html'),
          updates: resolve(import.meta.dirname, 'updates.html'),
          favorites: resolve(import.meta.dirname, 'favorites.html'),
          faq: resolve(import.meta.dirname, 'faq.html'),
          profile: resolve(import.meta.dirname, 'profile.html'),
          'teacher-upload': resolve(import.meta.dirname, 'teacher-upload.html'),
          'maintenance-mode': resolve(import.meta.dirname, 'maintenance-mode.html'),
          maintenance: resolve(import.meta.dirname, 'maintenance.html'),
          'admin-index': resolve(import.meta.dirname, 'admin/index.html'),
          'admin-codes': resolve(import.meta.dirname, 'admin/codes.html'),
          'admin-statistics': resolve(import.meta.dirname, 'admin/statistics.html'),
          'admin-subjects': resolve(import.meta.dirname, 'admin/subjects.html'),
          'admin-materials': resolve(import.meta.dirname, 'admin/materials.html'),
          'admin-teacher-links': resolve(import.meta.dirname, 'admin/teacher-links.html'),
          'admin-quizzes': resolve(import.meta.dirname, 'admin/quizzes.html'),
          'admin-quiz-questions': resolve(import.meta.dirname, 'admin/quiz-questions.html'),
          'admin-quiz-results': resolve(import.meta.dirname, 'admin/quiz-results.html'),
          'admin-schedule': resolve(import.meta.dirname, 'admin/schedule.html'),
          'admin-online-sections': resolve(import.meta.dirname, 'admin/online-sections.html'),
          'admin-online-schedule': resolve(import.meta.dirname, 'admin/online-schedule.html'),
          'admin-announcements': resolve(import.meta.dirname, 'admin/announcements.html'),
          'admin-notifications': resolve(import.meta.dirname, 'admin/notifications.html'),
          'admin-ai': resolve(import.meta.dirname, 'admin/ai.html'),
          'admin-faq': resolve(import.meta.dirname, 'admin/faq.html'),
          'admin-settings': resolve(import.meta.dirname, 'admin/settings.html'),
          'admin-hackers': resolve(import.meta.dirname, 'admin/hackers.html')
        }
      }
    },
    server: {
      port: 5173,
      open: true
    }
  };
});
