import { defineConfig, loadEnv } from 'vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, ['VITE_', 'NEXT_PUBLIC_']);

  return {
    root: projectRoot,
    publicDir: 'public',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
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
          main: resolve(projectRoot, 'index.html'),
          '404': resolve(projectRoot, '404.html'),
          '500': resolve(projectRoot, '500.html'),
          login: resolve(projectRoot, 'login.html'),
          register: resolve(projectRoot, 'register.html'),
          'forgot-password': resolve(projectRoot, 'forgot-password.html'),
          'reset-password': resolve(projectRoot, 'reset-password.html'),
          home: resolve(projectRoot, 'home.html'),
          subjects: resolve(projectRoot, 'subjects.html'),
          'subject-details': resolve(projectRoot, 'subject-details.html'),
          'lecture-details': resolve(projectRoot, 'lecture-details.html'),
          quizzes: resolve(projectRoot, 'quizzes.html'),
          'quiz-rules': resolve(projectRoot, 'quiz-rules.html'),
          schedule: resolve(projectRoot, 'schedule.html'),
          announcements: resolve(projectRoot, 'announcements.html'),
          notifications: resolve(projectRoot, 'notifications.html'),
          favorites: resolve(projectRoot, 'favorites.html'),
          faq: resolve(projectRoot, 'faq.html'),
          profile: resolve(projectRoot, 'profile.html'),
          'maintenance-mode': resolve(projectRoot, 'maintenance-mode.html'),
          maintenance: resolve(projectRoot, 'maintenance.html'),
          'admin-index': resolve(projectRoot, 'admin/index.html'),
          'admin-students': resolve(projectRoot, 'admin/students.html'),
          'admin-subjects': resolve(projectRoot, 'admin/subjects.html'),
          'admin-materials': resolve(projectRoot, 'admin/materials.html'),
          'admin-quizzes': resolve(projectRoot, 'admin/quizzes.html'),
          'admin-schedule': resolve(projectRoot, 'admin/schedule.html'),
          'admin-announcements': resolve(projectRoot, 'admin/announcements.html'),
          'admin-faq': resolve(projectRoot, 'admin/faq.html'),
          'admin-settings': resolve(projectRoot, 'admin/settings.html')
        }
      }
    },
    server: {
      port: 5173,
      open: true
    }
  };
});
