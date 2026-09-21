# Security & Safety

Per §28, §34, §54, §55 and ADR 0013.

- **Never** run untrusted generated code on the host → ephemeral containers with fs isolation,
  resource limits, timeouts, default-deny network policy, per-job secret injection (server
  side only; provider keys never reach the browser).
- **Human checkpoints** before destructive actions, production deploy, public publish,
  spending money, high-cost generation, deleting data, sending external comms.
- **Web hardening:** HttpOnly/SameSite cookies, CSRF on mutations, CSP, output encoding (XSS),
  SSRF allow-listing for web/browser fetchers, file validation, rate limiting, RBAC, secret
  management, content moderation + reporting + abuse controls.
- **Content policy:** general-purpose platform; not designed around prohibited/exploitative
  content; age-appropriate handling; no copying of copyrighted commercial assets/branding.

Status: **Proposed** — the Milestone 0/1 slice runs no untrusted code and stores nothing
server-side, so there is currently no attack surface these controls guard. They are specified
up front so M2+ implements rather than retrofits. A real security review is a Quality Gate
(§31) before any publish.
