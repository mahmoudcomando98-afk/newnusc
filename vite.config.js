import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);

  return {
    root: '.',
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
          main: resolve(__dirname, 'index.html'),
          login: resolve(__dirname, 'login.html'),
          register: resolve(__dirname, 'register.html'),
          'forgot-password': resolve(__dirname, 'forgot-password.html'),
          'reset-password': resolve(__dirname, 'reset-password.html'),
          home: resolve(__dirname, 'home.html'),
          subjects: resolve(__dirname, 'subjects.html'),
          'subject-details': resolve(__dirname, 'subject-details.html'),
          'lecture-details': resolve(__dirname, 'lecture-details.html'),
          quizzes: resolve(__dirname, 'quizzes.html'),
          'quiz-rules': resolve(__dirname, 'quiz-rules.html'),
          schedule: resolve(__dirname, 'schedule.html'),
          announcements: resolve(__dirname, 'announcements.html'),
          notifications: resolve(__dirname, 'notifications.html'),
          favorites: resolve(__dirname, 'favorites.html'),
          faq: resolve(__dirname, 'faq.html'),
          profile: resolve(__dirname, 'profile.html'),
          'admin-index': resolve(__dirname, 'admin/index.html'),
          'admin-students': resolve(__dirname, 'admin/students.html'),
          'admin-subjects': resolve(__dirname, 'admin/subjects.html'),
          'admin-materials': resolve(__dirname, 'admin/materials.html'),
          'admin-quizzes': resolve(__dirname, 'admin/quizzes.html'),
          'admin-schedule': resolve(__dirname, 'admin/schedule.html'),
          'admin-announcements': resolve(__dirname, 'admin/announcements.html'),
          'admin-faq': resolve(__dirname, 'admin/faq.html'),
          'admin-settings': resolve(__dirname, 'admin/settings.html')
        }
      }
    },
    server: {
      port: 5173,
      open: true
    }
  };
});
