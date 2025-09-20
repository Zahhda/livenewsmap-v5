// public/auth.js

// --- Toast (self-contained) ---
(function(){
  if (window.toast) return;
  function ensureToastStyles(){
    if (document.getElementById('toastStyle')) return;
    const css = `
      #toastRoot{position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-8px);z-index:9999;pointer-events:none}
      .toast{min-width:260px;max-width:86vw;margin:0 auto;background:#0b0b0b;border:1px solid #333;color:#ddd;padding:10px 14px;border-radius:12px;box-shadow:0 6px 30px rgba(0,0,0,.45);font-size:14px;line-height:1.35;display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(-8px);transition:opacity .14s ease,transform .14s ease,border-color .14s ease;pointer-events:auto}
      .toast.show{opacity:1;transform:translateY(0)}
      .toast .dot{width:10px;height:10px;border-radius:50%}
      .toast.info{border-color:#3ea6ff}.toast.info .dot{background:#3ea6ff}
      .toast.success{border-color:#00b37e}.toast.success .dot{background:#00b37e}
      .toast.error{border-color:#e10600}.toast.error .dot{background:#e10600}
    `;
    const s = document.createElement('style');
    s.id = 'toastStyle';
    s.textContent = css;
    document.head.appendChild(s);
  }
  function ensureRoot(){
    let root = document.getElementById('toastRoot');
    if (!root){ root = document.createElement('div'); root.id = 'toastRoot'; document.body.appendChild(root); }
    return root;
  }
  window.toast = function(message, type='info', ttl=1800){
    ensureToastStyles();
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${message}</span>`;
    root.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    const t = setTimeout(()=>{
      el.classList.remove('show');
      setTimeout(()=> el.remove(), 180);
    }, Math.max(800, ttl));
    el.addEventListener('click', ()=>{ clearTimeout(t); el.classList.remove('show'); setTimeout(()=> el.remove(), 180); });
  };
})();

// -----------------------------------------------------

async function fetchMe() {
  try {
    const r = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.user || null;
  } catch { return null; }
}

function ensureModal() {
  let modal = document.getElementById('authModal');
  if (!modal) {
    const created = document.createElement('div');
    created.id = 'authModal';
    created.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);align-items:center;justify-content:center;z-index:60';
    created.setAttribute('aria-hidden', 'true');

    created.innerHTML = `
      <div id="authDialog" role="dialog" aria-modal="true" aria-labelledby="authTabs"
           style="background:#0b0b0b;border:1px solid #333;border-radius:12px;width:420px;max-width:90vw;box-shadow:0 10px 30px rgba(0,0,0,.5)">
        <div id="authTabs" style="display:flex;border-bottom:1px solid #222;align-items:center">
          <button class="tabBtn" data-tab="login" style="flex:1;padding:10px;background:#111;border:0;color:#ddd;cursor:pointer">Login</button>
          <button class="tabBtn" data-tab="signup" style="flex:1;padding:10px;background:#0b0b0b;border:0;color:#aaa;cursor:pointer">Sign up</button>
          <button id="closeAuth" type="button" aria-label="Close"
                  style="padding:10px;border:0;background:transparent;color:#999;font-size:18px;cursor:pointer">✕</button>
        </div>
        <div id="authBody" style="padding:16px"></div>
      </div>`;
    document.body.appendChild(created);
    modal = created;
  }

  // ✅ Always bind close handlers (even if modal pre-exists in HTML)
  const closeBtn = modal.querySelector('#closeAuth');
  if (closeBtn && !closeBtn._bound) {
    closeBtn.addEventListener('click', closeModal);
    closeBtn._bound = true;
  }

  if (!modal._backdropBound) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modal._backdropBound = true;
  }

  if (!modal._escBound) {
    const onEscClose = (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
    };
    document.addEventListener('keydown', onEscClose);
    window.addEventListener('unload', () => {
      document.removeEventListener('keydown', onEscClose);
    });
    modal._escBound = true;
  }
}

function show(tab) {
  const body = document.getElementById('authBody');
  const login = `
    <form id="loginForm" class="stack" style="display:grid;gap:10px">
      <input class="input" name="email" type="email" placeholder="Email" required />
      <input class="input" name="password" type="password" placeholder="Password" required />
      <button type="submit" class="btn btn-white">Login</button>
      <div id="authErr" style="color:#e66"></div>
      <div style="font-size:12px;color:#888">New here? <a href="#" id="gotoSignup">Create an account</a></div>
    </form>`;
  const signup = `
    <form id="signupForm" class="stack" style="display:grid;gap:10px">
      <input class="input" name="name" placeholder="Full name" required />
      <input class="input" name="email" type="email" placeholder="Email" required />
      <input class="input" name="phone" placeholder="Phone number" />
      <input class="input" name="password" type="password" placeholder="Password (min 6 chars)" required minlength="6" />
      <button type="submit" class="btn btn-white">Create account</button>
      <div id="authErr" style="color:#e66"></div>
      <div style="font-size:12px;color:#888">Already have an account? <a href="#" id="gotoLogin">Login</a></div>
    </form>`;
  body.innerHTML = tab === 'signup' ? signup : login;

  document.querySelectorAll('.tabBtn').forEach(b => {
    b.style.background = b.dataset.tab === tab ? '#111' : '#0b0b0b';
    b.style.color = b.dataset.tab === tab ? '#ddd' : '#aaa';
  });

  wire(tab);
}

function wire(tab) {
  const err = document.getElementById('authErr');

  if (tab === 'login') {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const data = Object.fromEntries(new FormData(form).entries());

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin', // persist cookie
          headers: { 'Content-Type':'application/json','Accept':'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) {
          const j = await res.json().catch(()=>({ error:'Login failed' }));
          const msg = j.error || 'Login failed';
          err.textContent = msg;
          toast(msg, 'error');
          return;
        }
        toast('Logged in successfully', 'success');
        closeModal();
        await renderAuthArea();
        // Update location icon visibility after login
        if (typeof window.updateLocationIconVisibility === 'function') {
          window.updateLocationIconVisibility();
        }
        // Close the forced login modal if it exists
        if (window.forcedLoginOverlay) {
          window.forcedLoginOverlay.remove();
          window.forcedLoginOverlay = null;
        }
        // Reload the page to initialize the application properly
        location.reload();
      } catch (ex) {
        err.textContent = 'Network error';
        toast('Network error', 'error');
      }
    });

    document.getElementById('gotoSignup').addEventListener('click', (e) => {
      e.preventDefault(); show('signup');
    });

  } else {
    const form = document.getElementById('signupForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.password || String(data.password).length < 6) {
        const msg = 'Password must be at least 6 characters.';
        err.textContent = msg;
        toast(msg, 'error');
        return;
      }

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type':'application/json','Accept':'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) {
          const j = await res.json().catch(()=>({ error:'Signup failed' }));
          const msg = j.error || 'Signup failed';
          err.textContent = msg;
          toast(msg, 'error');
          return;
        }
        toast('Account created. You are logged in.', 'success');
        closeModal();
        await renderAuthArea();
        // Update location icon visibility after signup
        if (typeof window.updateLocationIconVisibility === 'function') {
          window.updateLocationIconVisibility();
        }
        // Close the forced login modal if it exists
        if (window.forcedLoginOverlay) {
          window.forcedLoginOverlay.remove();
          window.forcedLoginOverlay = null;
        }
        // Reload the page to initialize the application properly
        location.reload();
      } catch (ex) {
        err.textContent = 'Network error';
        toast('Network error', 'error');
      }
    });

    document.getElementById('gotoLogin').addEventListener('click', (e) => {
      e.preventDefault(); show('login');
    });
  }
}

function openModal(){
  ensureModal();
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden','false');
  show('login');
  // focus first input for accessibility
  setTimeout(() => {
    const first = document.querySelector('#authBody input');
    if (first) first.focus();
  }, 0);
}

function closeModal(){
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden','true');
}

async function renderAuthArea() {
  const area = document.getElementById('authArea');
  if (!area) return;
  const user = await fetchMe();
  if (user) {
    area.innerHTML = `
      <a href="/account" id="accountLink" class="btn" style="text-decoration:none;color:inherit;">
        <svg class="account-icon" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        Account
      </a>`;
  } else {
    area.innerHTML = `
      <button id="openAuth" class="btn" title="Login or Sign up">
        <svg class="account-icon" viewBox="0 0 24 24">
          <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v12z"/>
        </svg>
        Login
      </button>`;
    document.getElementById('openAuth').addEventListener('click', openModal);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureModal();
  renderAuthArea();
  window.openModal = openModal; // external trigger support
});

// Session checker to swap Login → Account when already authenticated
async function checkSession() {
  try {
    const r = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    if (r.ok) {
      const btn = document.getElementById('openAuth');
      if (btn) {
        const a = document.createElement('a');
        a.href = '/account';
        a.textContent = 'Account';
        a.className = 'btn';
        a.style.padding = '8px 12px';
        a.style.border = '1px solid #333';
        a.style.borderRadius = '8px';
        a.style.background = '#0b0b0b';
        a.style.color = '#ddd';
        btn.replaceWith(a);
      }
    }
  } catch (e) {}
}
checkSession();
