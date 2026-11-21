/* =========================================================================
   Optional account: log in with an email + password or a Google account
   (Firebase Authentication, in the Android app: Account.java).
   - "Account" card at the top of Settings and a slim row on Home
   - a full-screen Account page: log in, create an account, forgot password,
     confirm the email, log out
   Logging in is optional: everything works without it, CVs stay on the phone.
   In the web version, or before Firebase is set up, all of this stays hidden.
   ========================================================================= */
(function () {
  const B = window.AndroidBridge;
  const has = (() => { try { return !!(B && typeof B.authStatus === 'function' && JSON.parse(B.authStatus() || '{}').available); } catch (e) { return false; } })();
  const $ = s => document.querySelector(s);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = (m, bad) => { if (window.RichApp) window.RichApp.toast(m, bad); };
  const status = () => { try { return JSON.parse(B.authStatus() || '{}'); } catch (e) { return {}; } };
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const ERR = {
    network: 'No internet connection. Check it and try again.',
    'email-in-use': 'An account with this email already exists. Log in instead.',
    'weak-password': 'Use a password with at least 6 characters.',
    'bad-email': 'Enter a valid email, like name@example.com.',
    'wrong-login': 'Wrong email or password.',
    disabled: 'This account has been turned off.',
    'too-many': 'Too many tries. Wait a few minutes and try again.',
    'other-method': 'This email already uses Google login. Tap Continue with Google.',
    'method-off': 'This login method is not switched on yet.',
    'google-not-enabled': 'Google login is not set up yet.',
    'google-failed': 'Google login did not work on this phone. Try again, or log in with your email instead.',
    'not-set-up': 'Login is not set up yet.',
    'recent-login': 'For your safety, log out, log in again, then delete the account.',
    failed: 'Something went wrong. Try again.'
  };

  const USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z"/></svg>';
  const G = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"/></svg>';
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>';

  let st = has ? status() : {};
  let mode = 'login';                  // 'login' | 'create'
  let busy = false, page = null;
  const nameOf = s => s.name || (s.email || '').split('@')[0] || '';
  const initial = s => esc((nameOf(s) || '?').charAt(0).toUpperCase());
  // (v4.97) the Google profile picture in the round avatar; the first letter shows if it cannot load (offline)
  const avatar = s => /^https:\/\//.test(s.photo || '') ? '<img class="av-img" src="' + esc(s.photo) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' + initial(s) : initial(s);

  // ---------------- the Account page ----------------
  function open(m) {
    if (!has) return;
    if (m) mode = m;
    if (!page) {
      page = document.createElement('div');
      page.className = 'settings-page auth-page'; page.id = 'authPage';
      page.setAttribute('role', 'dialog'); page.setAttribute('aria-modal', 'true'); page.setAttribute('aria-labelledby', 'authTitle');
      page.innerHTML =
        '<header class="sp-bar"><button class="back-btn sp-back" id="authBack" type="button" aria-label="Back" title="Back">' +
          '<span class="back-ring" aria-hidden="true"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path class="back-shaft" d="M20 12H5"/><path class="back-head" d="M11 5l-7 7 7 7"/></svg></button>' +
          '<h2 id="authTitle">Account</h2></header><div class="sp-body au-body" id="authBody"></div>';
      document.body.appendChild(page);
      page.addEventListener('click', onClick);
      page.addEventListener('submit', onSubmit);
    }
    page.hidden = false;
    document.body.classList.add('auth-open');
    render();
  }
  function close() {
    if (!page) return;
    page.hidden = true;
    document.body.classList.remove('auth-open');
  }
  const isOpen = () => !!(page && !page.hidden);

  function render(msg, bad) {
    if (!page) return;
    st = status();
    const box = $('#authBody');
    const note = msg ? '<p class="au-msg' + (bad ? ' bad' : '') + '" role="' + (bad ? 'alert' : 'status') + '">' + esc(msg) + '</p>' : '';
    if (st.signedIn) {
      const needVerify = st.provider === 'password' && !st.verified;
      box.innerHTML =
        '<section class="sp-card au-card">' +
          '<div class="au-me"><span class="au-av">' + avatar(st) + '</span><span class="au-id"><b>' + esc(nameOf(st)) + '</b><small>' + esc(st.email) + '</small>' +
          '<em class="au-via">' + (st.provider === 'google' ? G + '<span>Google account</span>' : '<span>Email and password</span>') + '</em></span></div>' +
          note +
          (needVerify
            ? '<div class="au-verify"><p><b>Confirm your email</b><br><span>We sent a link to ' + esc(st.email) + '. Open it to confirm your email.</span></p>' +
              '<div class="row"><button type="button" class="btn btn-tonal" id="auReload"' + (busy ? ' disabled' : '') + '>I have confirmed it</button>' +
              '<button type="button" class="btn btn-ghost" id="auResend"' + (busy ? ' disabled' : '') + '>Send again</button></div></div>'
            : (st.provider === 'password' ? '<p class="au-ok">✓ <span>Email confirmed</span></p>' : '')) +
          '<p class="sp-note">Your CVs are saved on this phone. Use Google Drive backup in Settings to keep a copy online.</p>' +
          '<button type="button" class="btn btn-ghost au-out" id="auOut">Log out</button>' +
          '<button type="button" class="link au-del" id="auDelete">Delete my account</button>' +
        '</section>';
      return;
    }
    const create = mode === 'create';
    box.innerHTML =
      '<section class="sp-card au-card">' +
        '<div class="au-head"><span class="au-logo">' + USER + '</span><h3>' + (create ? 'Create an account' : 'Log in') + '</h3>' +
        '<p>Logging in is optional. Your CVs stay on this phone either way.</p></div>' +
        '<button type="button" class="btn gbtn au-google" id="auGoogle"' + (busy ? ' disabled' : '') + '>' + G + '<span>Continue with Google</span></button>' +
        '<div class="au-or"><span>or</span></div>' +
        '<div class="seg au-seg" role="tablist">' +
          '<button type="button" role="tab" data-amode="login" aria-checked="' + !create + '">Log in</button>' +
          '<button type="button" role="tab" data-amode="create" aria-checked="' + create + '">Create account</button></div>' +
        '<form class="au-form" id="auForm" novalidate>' +
          (create ? '<label class="au-f"><span>Your name</span><input id="auName" autocomplete="name" maxlength="60" placeholder="John Smith"></label>' : '') +
          '<label class="au-f"><span>Email</span><input id="auEmail" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="name@example.com"></label>' +
          '<label class="au-f"><span>Password</span><span class="au-pw"><input id="auPass" type="password" autocomplete="' + (create ? 'new-password' : 'current-password') + '" maxlength="100" placeholder="' + (create ? 'At least 6 characters' : 'Your password') + '">' +
            '<button type="button" class="au-eye" id="auEye" aria-label="Show password">' + EYE + '</button></span></label>' +
          note +
          '<button type="submit" class="btn btn-primary au-go"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Please wait…' : (create ? 'Create account' : 'Log in')) + '</button>' +
          (create ? '' : '<button type="button" class="link au-forgot" id="auForgot">Forgot password?</button>') +
        '</form>' +
      '</section>';
  }

  function fields() {
    const v = id => { const el = $('#' + id); return el ? el.value : ''; };
    return { name: v('auName').trim(), email: v('auEmail').trim(), pass: v('auPass') };
  }
  function keepFields(f) {                 // keep what was typed when the page is drawn again
    if ($('#auName') && f.name) $('#auName').value = f.name;
    if ($('#auEmail')) $('#auEmail').value = f.email || '';
  }
  function start() { busy = true; const f = fields(); render(); keepFields(f); }

  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const f = fields();
    if (!EMAIL.test(f.email)) { render(ERR['bad-email'], true); keepFields(f); $('#auEmail').focus(); return; }
    if (f.pass.length < 6) { render(ERR['weak-password'], true); keepFields(f); $('#auPass').focus(); return; }
    start(); keepFields(f);
    if (mode === 'create') B.authSignUp(f.name, f.email, f.pass); else B.authSignIn(f.email, f.pass);
  }
  function onClick(e) {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'authBack') { close(); return; }
    if (busy) return;
    if (t.dataset.amode) { const f = fields(); mode = t.dataset.amode; render(); keepFields(f); return; }
    if (t.id === 'auEye') {
      const p = $('#auPass'); const show = p.type === 'password';
      p.type = show ? 'text' : 'password'; t.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); t.classList.toggle('on', show);
      return;
    }
    if (t.id === 'auGoogle') { busy = true; render(); B.authGoogle(); return; }
    if (t.id === 'auForgot') {
      const f = fields();
      if (!EMAIL.test(f.email)) { render('Type your email above, then tap Forgot password? again.', true); keepFields(f); $('#auEmail').focus(); return; }
      start(); B.authReset(f.email); return;
    }
    if (t.id === 'auResend') { busy = true; render(); B.authResendVerify(); return; }
    if (t.id === 'auReload') { busy = true; render(); B.authReload(); return; }
    if (t.id === 'auOut') { B.authSignOut(); return; }
    if (t.id === 'auDelete') {
      const ask = window.RichApp && window.RichApp.confirm
        ? window.RichApp.confirm('Delete your account?', 'Your account and login are deleted for good. Your CVs stay on this phone.', 'Delete account', 'Cancel')
        : Promise.resolve(window.confirm('Delete your account?'));
      ask.then(ok => { if (ok) { busy = true; render(); B.authDelete(); } });
      return;
    }
  }

  // ---------------- answers from the Android app ----------------
  function onNative(kind, state, error) {
    const f = page && !page.hidden ? fields() : {};
    busy = false;
    st = state || status();
    renderCards();
    if (kind === 'state') { if (isOpen()) { render(); keepFields(f); } return; }
    if (error === 'cancelled') { if (isOpen()) { render(); keepFields(f); } return; }
    if (error) {
      // (v4.95) "google-failed:Code" keeps a short code so a problem can be found from a screenshot
      let msg = ERR[error] || ERR.failed;
      if (/^google-failed:/.test(error)) msg = ERR['google-failed'] + ' (' + error.split(':')[1] + ')';
      if (!isOpen()) { toast(msg, true); return; }
      render(msg, true); keepFields(f); return;
    }
    if (kind === 'signin' || kind === 'google') {
      toast('Signed in as ' + nameOf(st));
      close(); return;
    }
    if (kind === 'signup') { render('Account created. We sent a confirmation link to ' + st.email + '.'); return; }
    if (kind === 'reset') { render('We sent a link to reset your password to ' + f.email + '.'); keepFields(f); return; }
    if (kind === 'verify') { render('Confirmation email sent again.'); return; }
    if (kind === 'reload') { render(st.verified ? 'Email confirmed.' : 'Not confirmed yet. Tap the link in the email first.', !st.verified); return; }
    if (kind === 'signout') { close(); toast('Logged out. Your CVs stay on this phone.'); }
    if (kind === 'delete') { close(); toast('Your account was deleted. Your CVs stay on this phone.'); }
  }

  // ---------------- Settings card + Home row ----------------
  function renderCards() {
    const card = $('#accountCard');
    if (card) {
      card.hidden = !has;
      const body = $('#accountBody');
      if (has && body) body.innerHTML = st.signedIn
        ? '<div class="au-me small"><span class="au-av">' + avatar(st) + '</span><span class="au-id"><b>' + esc(nameOf(st)) + '</b><small>' + esc(st.email) + '</small></span>' +
          '<button type="button" class="btn btn-ghost btn-small" data-auth-open>Manage</button></div>'
        : '<p class="sp-note">Optional. Log in with your email or Google account.</p>' +
          '<button type="button" class="btn gbtn au-google ac-google" id="acGoogle"' + (busy ? ' disabled' : '') + '>' + G + '<span>Continue with Google</span></button>' +
          '<div class="row"><button type="button" class="btn btn-tonal" data-auth-open="login">Log in</button><button type="button" class="btn btn-ghost" data-auth-open="create">Create account</button></div>';
    }
    const row = $('#homeAccount');
    if (row) {
      row.hidden = !has;
      if (has) row.innerHTML = st.signedIn
        ? '<span class="ha-av">' + avatar(st) + '</span><span class="ha-t"><b>' + esc(nameOf(st)) + '</b><small>' + esc(st.email) + '</small></span><span class="ha-go" aria-hidden="true">›</span>'
        : '<span class="ha-ic">' + USER + '</span><span class="ha-t"><b>Log in or create an account</b><small>Optional</small></span><span class="ha-go" aria-hidden="true">›</span>';
    }
  }

  window.RichAuth = { available: has, open, close, isOpen, onNative, status: () => st };

  const wireUp = () => {
    renderCards();
    if (!has) return;
    try { if (B.authLanguage) B.authLanguage((window.RichI18n && window.RichI18n.lang) || 'en'); } catch (e) { /* ignore */ }
    document.addEventListener('richlang', e => { try { if (B.authLanguage) B.authLanguage(e.detail || 'en'); } catch (x) { /* ignore */ } });   // emails in the new language
    document.addEventListener('click', e => {
      if (e.target.closest('#acGoogle')) {                 // Settings: Google login straight away, no extra page
        if (busy) return;
        busy = true; renderCards(); B.authGoogle(); return;
      }
      const t = e.target.closest('[data-auth-open], #homeAccount');
      if (t) open(t.dataset.authOpen || (st.signedIn ? null : 'login'));
    });
    // phone Back closes the Account page first
    const back = window.RichAndroidBack;
    if (typeof back === 'function') window.RichAndroidBack = function () { if (isOpen()) { close(); return true; } return back(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUp); else wireUp();
})();
