import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

const CAIRO_HEAD_SNIPPET = `
  <link rel="stylesheet" href="/comando-cairo.css?v=3" />
  <style id="comando-cairo-boot">html,body,button,input,select,textarea{font-family:"Cairo",Tahoma,Arial,sans-serif!important}</style>
`;

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
    plugins: [injectCairoPlugin()],
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
          main: resolve(__dirname, 'index.html'),
          '404': resolve(__dirname, '404.html'),
          '500': resolve(__dirname, '500.html'),
          offline: resolve(__dirname, 'offline.html'),
          banned: resolve(__dirname, 'banned.html'),
          'devtools-blocked': resolve(__dirname, 'devtools-blocked.html'),
          'chrome-required': resolve(__dirname, 'chrome-required.html'),
          about: resolve(__dirname, 'about.html'),
          contact: resolve(__dirname, 'contact.html'),
          privacy: resolve(__dirname, 'privacy.html'),
          login: resolve(__dirname, 'login.html'),
          register: resolve(__dirname, 'register.html'),
          'forgot-password': resolve(__dirname, 'forgot-password.html'),
          'reset-password': resolve(__dirname, 'reset-password.html'),
          home: resolve(__dirname, 'home.html'),
          subjects: resolve(__dirname, 'subjects.html'),
          'past-exams': resolve(__dirname, 'past-exams.html'),
          'past-exam-subject': resolve(__dirname, 'past-exam-subject.html'),
          'subject-details': resolve(__dirname, 'subject-details.html'),
          'file-view': resolve(__dirname, 'file-view.html'),
          'lecture-details': resolve(__dirname, 'lecture-details.html'),
          quizzes: resolve(__dirname, 'quizzes.html'),
          'quiz-take': resolve(__dirname, 'quiz-take.html'),
          'quiz-rules': resolve(__dirname, 'quiz-rules.html'),
          schedule: resolve(__dirname, 'schedule.html'),
          'online-sections': resolve(__dirname, 'online-sections.html'),
          'online-schedule': resolve(__dirname, 'online-schedule.html'),
          'midterm-schedule': resolve(__dirname, 'midterm-schedule.html'),
          store: resolve(__dirname, 'store.html'),
          'store-item': resolve(__dirname, 'store-item.html'),
          'my-orders': resolve(__dirname, 'my-orders.html'),
          announcements: resolve(__dirname, 'announcements.html'),
          notifications: resolve(__dirname, 'notifications.html'),
          updates: resolve(__dirname, 'updates.html'),
          favorites: resolve(__dirname, 'favorites.html'),
          faq: resolve(__dirname, 'faq.html'),
          profile: resolve(__dirname, 'profile.html'),
          'teacher-upload': resolve(__dirname, 'teacher-upload.html'),
          'maintenance-mode': resolve(__dirname, 'maintenance-mode.html'),
          maintenance: resolve(__dirname, 'maintenance.html'),
          'admin-index': resolve(__dirname, 'admin/index.html'),
          'admin-statistics': resolve(__dirname, 'admin/statistics.html'),
          'admin-students': resolve(__dirname, 'admin/students.html'),
          'admin-subjects': resolve(__dirname, 'admin/subjects.html'),
          'admin-materials': resolve(__dirname, 'admin/materials.html'),
          'admin-teacher-links': resolve(__dirname, 'admin/teacher-links.html'),
          'admin-quizzes': resolve(__dirname, 'admin/quizzes.html'),
          'admin-quiz-questions': resolve(__dirname, 'admin/quiz-questions.html'),
          'admin-quiz-results': resolve(__dirname, 'admin/quiz-results.html'),
          'admin-schedule': resolve(__dirname, 'admin/schedule.html'),
          'admin-online-sections': resolve(__dirname, 'admin/online-sections.html'),
          'admin-online-schedule': resolve(__dirname, 'admin/online-schedule.html'),
          'admin-midterm-schedule': resolve(__dirname, 'admin/midterm-schedule.html'),
          'admin-store': resolve(__dirname, 'admin/store.html'),
          'admin-announcements': resolve(__dirname, 'admin/announcements.html'),
          'admin-notifications': resolve(__dirname, 'admin/notifications.html'),
          'admin-faq': resolve(__dirname, 'admin/faq.html'),
          'admin-settings': resolve(__dirname, 'admin/settings.html'),
          'admin-hackers': resolve(__dirname, 'admin/hackers.html')
        }
      }
    },
    server: {
      port: 5173,
      open: true
    }
  };
});
