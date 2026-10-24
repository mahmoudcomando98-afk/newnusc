# NUSC Audit & Page Requirements

## Scope and architecture

NUSC is a static multi-page HTML/CSS/JavaScript application built with Vite. Supabase provides Authentication, PostgreSQL, and Storage; there is no separate trusted application server in this repository. Therefore, browser-side checks are UX controls only. Authorization and data isolation must be enforced by Supabase RLS, database functions, and Storage policies.

## Audit findings (static review)

### Fixed in this change
- Authentication forms now declare `method="post"`. The JavaScript handlers prevent normal submission and call Supabase Auth; if JavaScript fails, the browser will not put credentials in the URL query string.
- Added dedicated not-found and server-error fallback pages for static hosting.
- Added a repeatable static audit command and wired it into CI before the production build.
- Removed no business logic solely on the basis of names or guesses; dead-code removal requires reference analysis and behavior tests.

### Dependency audit
- Upgraded Vite from 5.4.21 to 8.3.5 and regenerated the lockfile after CI reported a High Vite advisory and Moderate esbuild advisory. The current CI dependency audit reports no known package vulnerabilities.
- CI now runs on Node 22 to match the current Supabase SDK engine requirement.

### Risks that still require runtime/database verification
- `signInWithPassword` is called through the Supabase SDK. The SDK uses the Auth token endpoint with POST; the observed GET risk was the HTML form's implicit default when JavaScript is unavailable, not the SDK sign-in call itself.
- The app calls Supabase directly from the browser. Every table, RPC, and Storage operation must be reviewed against the live schema and RLS policies.
- SQL files in `supabase/` are migrations/scripts, not proof of the live database state. This audit does not execute SQL or modify the live Supabase project.
- Profile fields, publication flags, RPC signatures, and Storage object paths must be tested against the actual deployed schema before merge.
- `maintenance.html` is retained as a small compatibility redirect to `maintenance-mode.html`, avoiding two copies of the same maintenance page.
- A successful Vite build checks bundling, not sign-in behavior, RLS isolation, or all page workflows.

## Page requirements and acceptance criteria

| Page / group | Requirements | Failure / access behavior |
| --- | --- | --- |
| `index.html` | Read session only after Supabase config is valid; route authenticated users to home and guests to login. | Show usable login/register links when config or network is unavailable; never leave a permanent loader. |
| `login.html` | Email + password; POST form semantics; SDK sign-in; generic credential errors; safe local redirect only. | Never place password in URL; show config/network/auth errors without exposing secrets. |
| `register.html` | Validate name/email/password confirmation; sign up through Supabase Auth; no client-assigned role. | Handle email-confirmation and duplicate/rate-limit responses. |
| `forgot-password.html` | Validate email and request password reset with an allowlisted same-origin redirect. | Use a non-enumerating success message. |
| `reset-password.html` | Require a valid recovery session; validate confirmation and minimum password length. | Explain expired/invalid recovery link and provide a path back to login. |
| `home.html` | Require a valid session; load profile and published dashboard data. | Distinguish unauthenticated, empty-data, and service-error states. |
| `subjects.html`, `subject-details.html`, `lecture-details.html` | Only show published content to students; validate IDs before queries; escape user-generated text. | Not-found state for invalid/missing IDs; no unpublished content leakage. |
| `quizzes.html`, `quiz-rules.html` | Read published quizzes/rules; validate quiz IDs and time/status data. | Empty state, closed-quiz state, and recoverable query errors. |
| `schedule.html`, `announcements.html` | Show published/current records only; handle empty/expired content. | Friendly empty and service-error states. |
| `notifications.html`, `favorites.html` | Require session; scope rows to the current user; mark/read and favorite operations must be idempotent and authorized by RLS/RPC. | No cross-user data; failed mutations keep UI state consistent. |
| `profile.html` | Show only the current profile; validate editable fields; admin links are not authorization controls. | Missing profile and update failures are visible and recoverable. |
| `faq.html` | Show published FAQ entries; escape content. | Empty/error state. |
| `admin/*.html` | Require an authenticated, active admin before revealing data or enabling mutations; recheck all writes server-side via RLS/RPC. | Deny by default and redirect unauthorized users; never rely on hidden buttons alone. |
| `maintenance-mode.html`, `maintenance.html` | Explain maintenance without leaking settings; preserve admin recovery path. | Remain available while maintenance is enabled. |
| `404.html`, `500.html` | Give concise Arabic error message and links to home/login. | Work without JavaScript or Supabase. |

## Refactoring rules

1. Configuration and endpoints come from environment/configuration, never a real project's fallback URL/key in browser code.
2. Never send passwords, tokens, or private profile data in query strings or logs.
3. Centralize error normalization, but preserve useful distinctions between validation, authorization, not-found, network, and configuration errors.
4. Avoid swallowing errors into indistinguishable `null` values where the page needs to render an actionable state.
5. Remove functions/files only after checking all imports, HTML module entry points, route/build references, and tests.
6. Use `textContent` for untrusted strings; use parameterized Supabase queries and narrow RLS policies.
7. Any SQL changes must be reviewed and tested in a staging project before being applied to production.

## Verification checklist

- [ ] `npm run audit`
- [ ] `npm run build`
- [ ] Sign in with valid and invalid credentials; confirm no credential appears in URL/history.
- [ ] Register with email confirmation enabled and disabled.
- [ ] Test expired password-reset links.
- [ ] Test student A cannot read/update student B's profile, favorites, notifications, or private records.
- [ ] Test anonymous users cannot call protected RPCs or read private Storage objects.
- [ ] Test inactive admin and student accounts cannot enter admin routes or perform admin mutations.
- [ ] Test maintenance mode on/off and configuration/network failure.
- [ ] Compare required columns and RPC signatures with the actual Supabase schema.
