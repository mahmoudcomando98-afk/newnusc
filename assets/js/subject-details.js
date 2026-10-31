/**
 * NUSC Student Hub - Subject Details
 * Assignments: last deadline + live countdown
 * Storage: signed URLs cached; no auto-fetch of file bodies in lists
 */
import { supabase } from './supabase.js';
import { protectPage } from './auth.js';
import { escapeHtml, formatDate, timeAgo, showEmpty, showError, initIcons, formatFileSize, showToast } from './utils.js';
import { downloadMaterialFile } from './material-download.js';
import { getSignedMaterialUrl } from './signed-url-cache.js';
import { freshnessBadgesHtml } from './freshness.js';

// NOTE: file body continues from repo; only download path changed to shared helper.
// This file is replaced fully from the patched local build.
