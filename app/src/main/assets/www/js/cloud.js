/* =========================================================================
   Google account + backup of the CVs to the user's own Google Drive (Android app).
   The Android side (Cloud.java) signs in and reads/writes one hidden backup file
   in the Drive "app data" folder. This file:
     - shows the "Google Drive backup" card in Settings
     - backs up automatically a few seconds after a CV is saved, changed or deleted
     - restores (merges) the backup after signing in, e.g. after reinstalling the app
   In the web version (no Android app) the card stays hidden.
   ========================================================================= */
(function () {
  const B = window.AndroidBridge;
  const has = (() => { try { return !!(B && typeof B.cloudStatus === 'function'); } catch (e) { return false; } })();
  const Store = window.CVStore;
  const $ = s => document.querySelector(s);
  const TOMB = 'richDeletedCvs';            // ids deleted on this phone, so a restore does not bring them back
  const AUTO = 'richAutoBackup';
  let busy = false, timer = null, lastErr = '';

  // Google's own error text is long and technical: show a short, clear message instead
  function nice(err) {
    const e = String(err || '');
    if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(e)) return 'Google Drive backup is not switched on for this app yet.';
    if (/network|timeout|unable to resolve|failed to connect|Unable to resolve host/i.test(e)) return 'No internet connection. Check it and try again.';
    if (/storageQuota|quota/i.test(e)) return 'Your Google Drive is full.';
    if (/401|403|auth|permission|scope/i.test(e)) return 'Google Drive did not allow the backup. Sign in again and try once more.';
    return 'Something went wrong. Try again.';
  }
  const status = () => { try { return JSON.parse(B.cloudStatus() || '{}'); } catch (e) { return {}; } };
  const toast = (m, bad) => { if (window.RichApp) window.RichApp.toast(m, bad); };
  const tombs = () => { try { return JSON.parse(localStorage.getItem(TOMB) || '{}'); } catch (e) { return {}; } };
  const saveTombs = t => { try { localStorage.setItem(TOMB, JSON.stringify(t)); } catch (e) { /* ignore */ } };
  const WANT = 'richBackupAfterSignIn';
  let wantT = 0;
  function watchWant() {
    clearInterval(wantT);
    wantT = setInterval(() => {
      let w = 0; try { w = +localStorage.getItem(WANT) || 0; } catch (e) { /* ignore */ }
      if (!w || Date.now() - w > 30 * 60000) { clearInterval(wantT); try { localStorage.removeItem(WANT); } catch (e) { /* ignore */ } return; }
      if (has && status().signedIn && proNow()) {
        clearInterval(wantT);
        try { localStorage.setItem(AUTO, '1'); localStorage.removeItem(WANT); } catch (e) { /* ignore */ }
        render(); backupNow(false);
        toast('Google Drive backup is on. Your CVs are being saved to your Drive.');
      }
    }, 1500);
  }
  setTimeout(watchWant, 2000);
  const autoOn = () => { try { return localStorage.getItem(AUTO) !== '0'; } catch (e) { return true; } };

  async function payload() {
    return JSON.stringify({ app: 'rich-cv-maker', version: 2, exportedAt: new Date().toISOString(), cvs: await Store.all(), deleted: tombs() });
  }

  // merge a backup into this phone: newer copy of each CV wins; CVs deleted on either side stay deleted
  async function merge(text) {
    let data; try { data = JSON.parse(text); } catch (e) { throw new Error('The backup in Google Drive could not be read.'); }
    const list = Array.isArray(data) ? data : (data && data.cvs) || [];
    const gone = Object.assign({}, (data && data.deleted) || {}, tombs());
    let added = 0, updated = 0;
    for (const r of list) {
      if (!r || !r.id || !r.fullName) continue;
      if (gone[r.id] && gone[r.id] >= (r.updatedAt || '')) continue;
      const mine = await Store.get(r.id);
      // (v4.97) the same number but a different CV (another creation time): keep both, the backup one with a new number
      if (mine && mine.createdAt && r.createdAt && mine.createdAt !== r.createdAt) {
        await orig.put.call(Store, Object.assign({}, r, { id: window.RichNewCvId ? window.RichNewCvId() : r.id + '-2' })); added++; continue;
      }
      if (!mine) { await orig.put.call(Store, r); added++; }
      else if ((r.updatedAt || '') > (mine.updatedAt || '')) { await orig.put.call(Store, r); updated++; }
    }
    for (const id of Object.keys(gone)) {                        // deleted on another phone
      const mine = await Store.get(id);
      if (mine && gone[id] >= (mine.updatedAt || '')) await orig.remove.call(Store, id);
    }
    saveTombs(gone);
    if (window.RichApp) await window.RichApp.refreshList();
    return { added, updated };
  }

  // ---------------- calls to the Android app ----------------
  // A backup always reads Drive first and merges it in, then uploads. If Drive can't be read,
  // nothing is uploaded, so a backup can never replace CVs it has not seen (e.g. from another phone).
  let uploadAfterRead = false, uploadInteractive = false;
  // (v4.97) Google Drive backup and restore are Pro: checked here, so no path (start-up sync, auto backup, buttons) runs without it
  const proNow = () => !!(window.RichPremium && window.RichPremium.isPremium());
  function backupNow(interactive) {
    if (!has || !proNow()) return;
    if (busy) { uploadAfterRead = true; return; }
    uploadAfterRead = true; uploadInteractive = !!interactive;
    restoreNow(interactive, true);
  }
  function uploadNow() {
    busy = true; render('Backing up…');
    payload().then(json => B.cloudUpload(json, uploadInteractive)).catch(e => { busy = false; render(); toast(e.message, true); });
  }
  function restoreNow(interactive, quiet) {
    if (!has || busy || !proNow()) return;
    busy = true; render('Checking Google Drive…');
    restoreQuiet = !!quiet;
    B.cloudDownload(!!interactive);
  }
  let restoreQuiet = false, afterSignIn = false;

  const handlers = {
    signin(d) {
      if (!d.ok) { busy = false; render(); if (d.error !== 'cancelled') toast(nice(d.error), true); return; }
      toast('Signed in as ' + (d.email || 'your Google account'));
      afterSignIn = true; busy = false;
      restoreNow(true, false);                              // bring back CVs saved before (reinstall / new phone), then back up
    },
    signout() { busy = false; lastErr = ''; render(); toast('Google Drive backup is off. Your CVs stay on this phone.'); },
    async download(d) {
      busy = false;
      const wantUpload = uploadAfterRead || afterSignIn;
      uploadAfterRead = false;
      if (!d.ok) {                                       // Drive could not be read: upload nothing
        afterSignIn = false; lastErr = d.error; render();
        if ((!restoreQuiet || wantUpload) && d.error !== 'signin-needed') toast(nice(d.error), true);
        return;
      }
      lastErr = '';
      if (d.empty) { if (!restoreQuiet) toast(afterSignIn ? 'No backup in Google Drive yet. Your CVs will be backed up now.' : 'No backup in Google Drive yet.'); }
      else {
        try {
          const r = await merge(typeof d.data === 'string' ? d.data : JSON.stringify(d.data));
          const n = r.added + r.updated;
          if (n || !restoreQuiet) toast(n ? n + (n === 1 ? ' CV' : ' CVs') + ' restored from Google Drive.' : 'Your CVs are already up to date.');
        } catch (e) {                                    // unreadable backup: keep it, upload nothing
          afterSignIn = false; render(); toast(e.message, true); return;
        }
      }
      if (afterSignIn) uploadInteractive = true;
      afterSignIn = false;
      if (wantUpload) uploadNow(); else render();
    },
    upload(d) {
      busy = false;
      if (!d.ok) { lastErr = d.error; if (d.error !== 'signin-needed') toast(nice(d.error), true); }
      else lastErr = '';
      render();
    }
  };
  window.RichCloud = {
    available: has,
    onNative(kind, data) { const h = handlers[kind]; if (h) h(data || {}); },
    backupNow: () => backupNow(true),
    // (v4.97) after buying Pro: is the account connected, is automatic backup on, turn it on
    signedIn: () => has && !!status().signedIn,
    autoOn: () => autoOn(),
    // (v4.97) the same as Settings > "Turn on Google Drive backup": link Google Drive first (that is what Settings shows
    // as connected), then restore + back up; already linked: back up straight away
    turnOn() {
      try { localStorage.setItem(AUTO, '1'); localStorage.removeItem(WANT); } catch (e) { /* ignore */ }
      if (!has) return;
      if (status().signedIn) { render(); backupNow(true); return; }
      if (busy) return;
      busy = true; render('Opening Google…'); B.cloudSignIn();
    },
    // the user chose "Connect Google account" on the thank-you page: turn backup on as soon as the sign-in finishes
    wantAfterSignIn() { try { localStorage.setItem(WANT, String(Date.now())); } catch (e) { /* ignore */ } watchWant(); },
    restoreNow: () => restoreNow(true, false)
  };

  // ---------------- automatic backup after every change ----------------
  const orig = { put: Store.put, remove: Store.remove };
  function schedule() {
    if (!has || !autoOn() || !status().signedIn || !(window.RichPremium && window.RichPremium.isPremium())) return;
    clearTimeout(timer);
    timer = setTimeout(() => backupNow(false), 4000);
  }
  if (has) {
    Store.put = function (rec) { const p = orig.put.call(this, rec); p.then(schedule, () => {}); return p; };
    Store.remove = function (id) {
      const t = tombs(); t[id] = new Date().toISOString(); saveTombs(t);
      const p = orig.remove.call(this, id); p.then(schedule, () => {}); return p;
    };
  }

  // ---------------- Settings card + My CVs note ----------------
  const G = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"/></svg>';
  const DRIVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0F9D58" d="M8.2 3h7.6l6.2 10.8-3.8 6.6z"/><path fill="#FFC107" d="M8.2 3L2 13.8 5.8 20.4 12 9.6z"/><path fill="#4285F4" d="M5.8 20.4h12.4L22 13.8H9.6z"/></svg>';
  const when = t => { if (!t) return 'not yet'; const d = new Date(t); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render(working) {
    const card = $('#cloudCard'); if (!card || !has) return;
    card.classList.toggle('pro-locked', !(window.RichPremium && window.RichPremium.isPremium()));
    card.hidden = false;
    const st = status();
    const box = $('#cloudBody');
    if (!st.signedIn) {
      box.innerHTML =
        '<p class="sp-note">Keep a copy of your CVs in your own Google Drive. If you reinstall the app or get a new phone, turn it on again and your CVs come back.</p>' +
        '<button type="button" class="btn btn-tonal cloud-on" id="cloudSignIn"' + (busy ? ' disabled' : '') + '>' + DRIVE + '<span>' + (working || 'Turn on Google Drive backup') + '</span></button>' +
        '<p class="sp-fine">Your CVs go to a private app folder in your Google Drive. Only this app can open it.</p>';
    } else if (!proNow()) {
      // (v4.97) signed in, but no Pro (e.g. Pro was refunded or removed): backups are paused until Pro is active again
      box.innerHTML =
        '<div class="cl-acc">' +
          '<span class="cl-drive">' + DRIVE + '</span>' +
          '<span class="cl-id"><b>' + esc(st.email || 'Google account') + '</b><small class="cl-paused">● <span>Paused</span></small></span>' +
        '</div>' +
        '<p class="sp-note">Google Drive backup is part of Pro. Your CVs stay safe on this phone, and the copy already in Google Drive is kept. Backups start again when Pro is active.</p>' +
        '<button type="button" class="btn btn-tonal cloud-on" id="cloudGetPro">' + DRIVE + '<span>Upgrade to Pro</span></button>' +
        '<button type="button" class="cl-off" id="cloudSignOut">Turn off Google Drive backup</button>';
    } else {
      const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 10A7.5 7.5 0 0 0 5.4 8 6 6 0 0 0 6 20h13a5 5 0 0 0 .4-10zM13 13v4h-2v-4H8l4-4 4 4z"/></svg>';
      const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 10A7.5 7.5 0 0 0 5.4 8 6 6 0 0 0 6 20h13a5 5 0 0 0 .4-10zM11 9h2v4h3l-4 4-4-4h3z"/></svg>';
      const bad = lastErr && lastErr !== 'signin-needed';
      box.innerHTML =
        '<div class="cl-acc">' +
          '<span class="cl-drive">' + DRIVE + '</span>' +
          '<span class="cl-id"><b>' + esc(st.email || 'Google account') + '</b><small class="cl-on">● <span>Connected</span></small></span>' +
        '</div>' +
        '<div class="cl-last' + (bad ? ' bad' : '') + '">' + (working ? '<i class="cl-spin" aria-hidden="true"></i>' + esc(working)
          : (bad ? esc(nice(lastErr)) : '<span>Last backup</span><b>' + esc(when(st.lastBackup)) + '</b>')) + '</div>' +
        '<div class="row cloud-btns cl-btns">' +
          '<button type="button" class="btn btn-tonal" id="cloudBackup"' + (busy ? ' disabled' : '') + '>' + UP + '<span>Back up now</span></button>' +
          '<button type="button" class="btn btn-ghost" id="cloudRestore"' + (busy ? ' disabled' : '') + '>' + DOWN + '<span>Restore</span></button>' +
        '</div>' +
        '<label class="cl-auto" for="cloudAuto">' +
          '<span class="cl-auto-t"><b>Automatic backup</b><small>Back up automatically when a CV is saved</small></span>' +
          '<input type="checkbox" class="cl-switch" id="cloudAuto" role="switch"' + (autoOn() ? ' checked' : '') + '>' +
        '</label>' +
        '<p class="sp-fine cl-fine">Your CVs go to a private app folder in your Google Drive. Only this app can open it.</p>' +
        '<button type="button" class="cl-off" id="cloudSignOut">Turn off Google Drive backup</button>';
    }
    const note = document.querySelector('#view-list .storage-note span:last-child');
    if (note) note.innerHTML = st.signedIn && !proNow()
      ? 'CVs are saved on this phone. Google Drive backup is paused (it is part of Pro).'
      : st.signedIn
      ? 'Backed up to Google Drive (' + esc(st.email) + '). Last backup: ' + esc(when(st.lastBackup)) + '.'
      : 'CVs are saved only on this phone. <button class="link" type="button" data-open-settings>Turn on Google Drive backup</button> to keep them after reinstalling.';
  }

  if (has) {
    document.addEventListener('richpro', () => render());
    const wireUp = () => {
      document.addEventListener('click', e => {
        const t = e.target.closest('#cloudSignIn, #cloudSignOut, #cloudBackup, #cloudRestore, #cloudGetPro, [data-open-settings]');
        if (!t) return;
        if (t.id === 'cloudGetPro') { if (window.RichPremium) (window.RichPremium.openPage || window.RichPremium.offer)('drive'); return; }
        // (v4.43) Google Drive backup is a Pro feature
        const pro = window.RichPremium && window.RichPremium.isPremium();
        if (!pro && (t.id === 'cloudSignIn' || t.id === 'cloudBackup' || t.id === 'cloudRestore')) { if (window.RichPremium) window.RichPremium.offer('drive'); return; }
        if (t.id === 'cloudSignIn') { busy = true; render('Opening Google…'); B.cloudSignIn(); }
        else if (t.id === 'cloudSignOut') B.cloudSignOut();
        else if (t.id === 'cloudBackup') backupNow(true);
        else if (t.id === 'cloudRestore') restoreNow(true, false);
        else if (t.hasAttribute('data-open-settings')) { const o = document.getElementById('openSettings'); if (o) o.click(); }
      });
      document.addEventListener('change', e => {
        if (e.target.id === 'cloudAuto') { try { localStorage.setItem(AUTO, e.target.checked ? '1' : '0'); } catch (x) { /* ignore */ } if (e.target.checked) backupNow(false); }
      });
      render();
      // keep this phone in step with Drive (e.g. CVs made on another phone), quietly
      if (status().signedIn) setTimeout(() => restoreNow(false, true), 2500);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireUp); else wireUp();
  }
})();
