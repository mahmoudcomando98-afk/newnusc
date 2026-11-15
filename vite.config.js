import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

function collectHtml(dir, base = '') {
  const out = {};
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === 'dist' || name.name === 'public' || name.name === '.git') {
      continue;
    }
    const rel = base ? `${base}/${name.name}` : name.name;
    const full = resolve(dir, name.name);
    if (name.isDirectory()) {
      Object.assign(out, collectHtml(full, rel));
    } else if (name.name.endsWith('.html')) {
      const key = rel.replace(/\.html$/, '').replace(/[\\/]/g, '-');
      out[key] = full;
    }
  }
  return out;
}

const CAIRO_HEAD_SNIPPET = `
  <link rel="stylesheet" href="/comando-cairo.css?v=3" />
  <style id="comando-cairo-boot">html,body,button,input,select,textarea{font-family:"Cairo",Tahoma,Arial,sans-serif!important}</style>
`;

const THEME_HEAD_SNIPPET = `
  <script id="comando-theme-init">(function(){try{var t=localStorage.getItem('comando-theme');if(t!=='dark'&&t!=='light'){t='light';}}catch(e){t='light';}document.documentElement.setAttribute('data-theme',t);try{var p=localStorage.getItem('comando-palette');var path=(window.location.pathname||'').toLowerCase();var skip=/login|register|signup|sign-up|welcome/.test(path);if(p==='girl'&&!skip){document.documentElement.setAttribute('data-palette','girl');}}catch(e){}})();</script>
  <link rel="stylesheet" href="/assets/css/dark-theme.css?v=4" />
  <link rel="stylesheet" href="/assets/css/girl-theme.css?v=2" />
`;
const THEME_BODY_SNIPPET = `<script type="module" src="/assets/js/theme.js?v=3"></script>`;
const AI_ASSISTANT_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/ai-assistant.css?v=16" />`;
const AI_ASSISTANT_BODY_SNIPPET = `<script type="module" src="/assets/js/ai-assistant.js?v=20"></script>`;
const CHAT_ICON_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/chat-icon.css?v=1" />`;
const CHAT_ICON_BODY_SNIPPET = `<script type="module" src="/assets/js/chat-icon.js?v=1"></script>`;
const REDESIGN_HEAD_SNIPPET = `<link rel="stylesheet" href="/assets/css/redesign.css?v=12" />`;

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
    `<meta property="og:locale" content="ar_EG" />`,
    ...(siteUrl ? [`<meta property="og:url" content="${siteUrl}${pagePath || '/'}" />`] : []),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${OG_DEFAULT_TITLE}" />`,
    `<meta name="twitter:description" content="${OG_DEFAULT_DESC}" />`,
    `<meta name="twitter:image" content="${image}" />`
  ].join('\n  ');
}

function injectOgPlugin() {
  return {
    name: 'inject-og-absolute',
    transformIndexHtml(html, ctx) {
      let out = html;
      const pagePath = pagePathFromFilename(ctx?.filename);
      if (SITE_URL) {
        out = out.replace(/(<meta property="og:image" content=")\/([^\"]+)(")/g, `$1${SITE_URL}/$2$3`);
        out = out.replace(/(<meta name="twitter:image" content=")\/([^\"]+)(")/g, `$1${SITE_URL}/$2$3`);
        if (/<meta property="og:image"/.test(out) && !/property="og:url"/.test(out)) {
          out = out.replace('</head>', `  <meta property="og:url" content="${SITE_URL}${pagePath}" />\n</head>`);
        }
      }
      if (!out.includes('og:title')) {
        const block = buildOgBlock(SITE_URL, pagePath);
        if (out.includes('</head>')) out = out.replace('</head>', `  ${block}\n</head>`);
        else if (out.includes('<head>')) out = out.replace('<head>', `<head>${block}`);
      }
      if (!/name="twitter:card"/.test(out) && /og:title/.test(out)) {
        out = out.replace('</head>', '  <meta name="twitter:card" content="summary_large_image" />\n</head>');
      }
      return out;
    }
  };
}

function injectAiAssistantPlugin() {
  return {
    name: 'inject-ai-assistant',
    transformIndexHtml(html) {
      let out = html;
      if (!out.includes('ai-assistant.css')) {
        if (out.includes('</head>')) out = out.replace('</head>', `${AI_ASSISTANT_HEAD_SNIPPET}\n</head>`);
        else if (out.includes('<head>')) out = out.replace('<head>', `<head>${AI_ASSISTANT_HEAD_SNIPPET}`);
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
        if (out.includes('<head>')) out = out.replace('<head>', `<head>${THEME_HEAD_SNIPPET}`);
        else if (out.includes('<head ')) out = out.replace(/<head([^>]*)>/i, `<head$1>${THEME_HEAD_SNIPPET}`);
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
          if (out.includes('</head>')) out = out.replace('</head>', `${REDESIGN_HEAD_SNIPPET}\n</head>`);
          else if (out.includes('<head>')) out = out.replace('<head>', `<head>${REDESIGN_HEAD_SNIPPET}`);
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
        if (out.includes('</head>')) out = out.replace('</head>', `${CHAT_ICON_HEAD_SNIPPET}\n</head>`);
        else if (out.includes('<head>')) out = out.replace('<head>', `<head>${CHAT_ICON_HEAD_SNIPPET}`);
      }
      if (!out.includes('/assets/js/chat-icon.js') && out.includes('</body>')) {
        out = out.replace('</body>', `${CHAT_ICON_BODY_SNIPPET}\n</body>`);
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
      if (html.includes('<head>')) return html.replace('<head>', `<head>${CAIRO_HEAD_SNIPPET}`);
      if (html.includes('<head ')) return html.replace(/<head([^>]*)>/i, `<head$1>${CAIRO_HEAD_SNIPPET}`);
      return html;
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const input = collectHtml(resolve(import.meta.dirname));

  return {
    root: '.',
    publicDir: 'public',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [
      injectCairoPlugin(),
      injectThemePlugin(),
      injectAiAssistantPlugin(),
      injectChatIconPlugin(),
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
      )
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: { input }
    },
    server: { port: 5173, open: true }
  };
});
