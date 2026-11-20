import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

const CAIRO_HEAD_SNIPPET = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="stylesheet" href="/comando-cairo.css?v=3" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/mahmoudcomando98-afk/newnusc@d4c287642f0327f903a447de0c6cf37f484dedfb/assets/css/main.css" />
  <link rel="stylesheet" href="/assets/css/mobile-polish.css?v=2" />
  <link rel="stylesheet" href="/assets/css/app-compact.css?v=2" />
  <link rel="stylesheet" href="/assets/css/perf.css?v=2" />
  <style id="comando-cairo-boot">html,body,button,input,select,textarea{font-family:"Cairo",Tahoma,Arial,sans-serif!important}</style>
`;

const THEME_HEAD_SNIPPET = `
  <script id="comando-theme-init">(function(){try{var t=localStorage.getItem('comando-theme');if(t!=='dark'&&t!=='light'){t='light';}}catch(e){t='light';}document.documentElement.setAttribute('data-theme',t);try{var p=localStorage.getItem('comando-palette');var path=(window.location.pathname||'').toLowerCase();var skip=/login|register|signup|sign-up/.test(path);if(p==='girl'&&!skip){document.documentElement.setAttribute('data-palette','girl');}}catch(e){}})();</script>
  <link rel="stylesheet" href="/assets/css/dark-theme.css?v=5" />
  <link rel="stylesheet" href="/assets/css/girl-theme.css?v=2" />
`;
const THEME_BODY_SNIPPET = `<script type="module" src="/assets/js/theme.js?v=4"></script>`;
const AI_ASSISTANT_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/ai-assistant.css?v=17" />`;
const AI_ASSISTANT_BODY_SNIPPET = `<script type="module" src="/assets/js/ai-assistant.js?v=21"></script>`;
const CHAT_ICON_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/chat-icon.css?v=1" />`;
const CHAT_ICON_BODY_SNIPPET = `<script type="module" src="/assets/js/chat-icon.js?v=1"></script>`;
const REDESIGN_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/redesign.css?v=12" />`;
const APP_LIKE_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/app-like.css?v=1" />`;
const APP_LIKE_BODY_SNIPPET = `<script type="module" src="/assets/js/app-like.js?v=1"></script>`;
const DEVTOOLS_GUARD_BODY_SNIPPET = `<script type="module" src="/assets/js/devtools-guard.js?v=1"></script>`;

const SITE_URL = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  ''
).replace(/\/+$/, '');

const OG_DEFAULT_TITLE = 'COMANDO — منصة COMANDO التعليمية';
const OG_DEFAULT_DESC = 'ملفات المواد، مواعيد الكويزات، والإعلانات في مكان واحد.';
const OG_IMAGE = '/nusc.png.jpeg';

function pagePathFromFilename(filename) {
  if (!filename) return '/';
  const normalized = String(filename).replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  const rel = idx >= 0 ? normalized.slice(idx) : '/';
  return rel || '/';
}

function buildOgBlock(siteUrl, pagePath) {
  const image = `${siteUrl || ''}${OG_IMAGE}`;
  return [
    `<meta property="og:title" content="${OG_DEFAULT_TITLE}" />`,
    `<meta property="og:description" content="${OG_DEFAULT_DESC}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="COMANDO" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${OG_DEFAULT_TITLE}" />`,
    `<meta name="twitter:description" content="${OG_DEFAULT_DESC}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join('\n    ');
}

function injectOgPlugin() {
  return {
    name: 'inject-og',
    transformIndexHtml(html, ctx) {
      if (html.includes('og:title')) return html;
      const path = pagePathFromFilename(ctx?.filename || ctx?.path || '');
      const block = buildOgBlock(SITE_URL, path);
      if (html.includes('</head>')) {
        return html.replace('</head>', `    ${block}\n  </head>`);
      }
      return html;
    }
  };
}

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

function injectRedesignPlugin() {
  return {
    name: 'inject-redesign',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let out = html;
        if (!out.includes('redesign.css')) {
          if (out.includes('</head>')) {
            out = out.replace('</head>', `${REDESIGN_HEAD_SNIPPET}\n</head>`);
          } else if (out.includes('<head>')) {
            out = out.replace('<head>', `<head>${REDESIGN_HEAD_SNIPPET}`);
          }
        }
        return out;
      }
    }
  };
}

function injectChatIconPlugin() {
  return {
    name: 'inject-chat-icon',
    transformIndexHtml(html) {
      let out = html;
      if (!out.includes('chat-icon.css')) {
        if (out.includes('</head>')) {
          out = out.replace('</head>', `${CHAT_ICON_HEAD_SNIPPET}\n</head>`);
        } else if (out.includes('<head>')) {
          out = out.replace('<head>', `<head>${CHAT_ICON_HEAD_SNIPPET}`);
        }
      }
      if (!out.includes('/assets/js/chat-icon.js') && out.includes('</body>')) {
        out = out.replace('</body>', `${CHAT_ICON_BODY_SNIPPET}\n</body>`);
      }
      return out;
    }
  };
}

function injectDevtoolsGuardPlugin() {
  return {
    name: 'inject-devtools-guard',
    transformIndexHtml(html) {
      if (html.includes('/assets/js/devtools-guard.js') || !html.includes('</body>')) return html;
      return html.replace('</body>', `${DEVTOOLS_GUARD_BODY_SNIPPET}\n</body>`);
    }
  };
}

function injectAppLikePlugin() {
  return {
    name: 'inject-app-like',
    transformIndexHtml(html) {
      let out = html;
      if (!out.includes('app-like.css')) {
        if (out.includes('</head>')) out = out.replace('</head>', `${APP_LIKE_HEAD_SNIPPET}\n</head>`);
        else if (out.includes('<head>')) out = out.replace('<head>', `<head>${APP_LIKE_HEAD_SNIPPET}`);
      }
      if (!out.includes('/assets/js/app-like.js') && out.includes('</body>')) {
        out = out.replace('</body>', `${APP_LIKE_BODY_SNIPPET}\n</body>`);
      }
      return out;
    }
  };
}

function injectCairoPlugin() {
  return {
    name: 'inject-cairo-font',
    transformIndexHtml(html) {
      let out = html;
      if (!out.includes('comando-cairo.css')) {
        if (out.includes('<head>')) {
          out = out.replace('<head>', `<head>${CAIRO_HEAD_SNIPPET}`);
        } else if (out.includes('<head ')) {
          out = out.replace(/<head([^>]*)>/i, `<head$1>${CAIRO_HEAD_SNIPPET}`);
        }
      } else if (!out.includes('/assets/css/perf.css')) {
        const extra = `
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/mahmoudcomando98-afk/newnusc@d4c287642f0327f903a447de0c6cf37f484dedfb/assets/css/main.css" />
  <link rel="stylesheet" href="/assets/css/mobile-polish.css?v=2" />
  <link rel="stylesheet" href="/assets/css/app-compact.css?v=2" />
  <link rel="stylesheet" href="/assets/css/perf.css?v=2" />
`;
        if (out.includes('</head>')) {
          out = out.replace('</head>', `${extra}</head>`);
        }
      }
      return out;
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);

  return {
    root: '.',
    publicDir: 'public',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [
      injectCairoPlugin(),
      injectThemePlugin(),
      injectAiAssistantPlugin(),
      injectChatIconPlugin(),
      injectAppLikePlugin(),
      injectDevtoolsGuardPlugin(),
      injectOgPlugin(),
      injectRedesignPlugin()
    ],
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
      ),
      'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(env.VITE_VAPID_PUBLIC_KEY || '')
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          login: resolve(import.meta.dirname, 'login.html'),
          home: resolve(import.meta.dirname, 'home.html'),
          subjects: resolve(import.meta.dirname, 'subjects.html'),
          'subject-details': resolve(import.meta.dirname, 'subject-details.html'),
          'lecture-details': resolve(import.meta.dirname, 'lecture-details.html'),
          quizzes: resolve(import.meta.dirname, 'quizzes.html'),
          'quiz-take': resolve(import.meta.dirname, 'quiz-take.html'),
          'quiz-rules': resolve(import.meta.dirname, 'quiz-rules.html'),
          schedule: resolve(import.meta.dirname, 'schedule.html'),
          'online-sections': resolve(import.meta.dirname, 'online-sections.html'),
          'online-schedule': resolve(import.meta.dirname, 'online-schedule.html'),
          notifications: resolve(import.meta.dirname, 'notifications.html'),
          updates: resolve(import.meta.dirname, 'updates.html'),
          favorites: resolve(import.meta.dirname, 'favorites.html'),
          faq: resolve(import.meta.dirname, 'faq.html'),
          profile: resolve(import.meta.dirname, 'profile.html'),
          'teacher-upload': resolve(import.meta.dirname, 'teacher-upload.html'),
          'maintenance-mode': resolve(import.meta.dirname, 'maintenance-mode.html'),
          maintenance: resolve(import.meta.dirname, 'maintenance.html'),
          status: resolve(import.meta.dirname, 'status.html'),
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
          'admin-hackers': resolve(import.meta.dirname, 'admin/hackers.html'),
          about: resolve(import.meta.dirname, 'about.html'),
          contact: resolve(import.meta.dirname, 'contact.html'),
          privacy: resolve(import.meta.dirname, 'privacy.html'),
          chat: resolve(import.meta.dirname, 'chat.html'),
          'file-view': resolve(import.meta.dirname, 'file-view.html'),
          'past-exams': resolve(import.meta.dirname, 'past-exams.html'),
          'past-exam-subject': resolve(import.meta.dirname, 'past-exam-subject.html'),
          'study-plan': resolve(import.meta.dirname, 'study-plan.html'),
          offline: resolve(import.meta.dirname, 'offline.html')
        }
      }
    },
    server: {
      port: 5173,
      open: true
    }
  };
});
