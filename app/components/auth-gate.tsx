"use client";

import {useCallback, useEffect, useRef, useState} from 'react';
import type {FormEvent, ReactNode} from 'react';

type User = {id: string; username: string};
type Session = {user?: User; legacyClaimPending?: boolean};

async function authRequest(path: string, body?: object): Promise<Session> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as {code?: string} | null;
    const error = new Error(response.status === 429
      ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
      : response.status === 400 && detail?.code === 'OWNER_SETUP_REQUIRED'
      ? '기존 기록 연결 확인코드가 필요합니다. 아래 확인코드를 입력하거나 입력한 코드를 확인해 주세요.'
      : response.status >= 500
      ? '서버 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.'
      : '요청을 완료하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.');
    Object.assign(error, {status: response.status});
    throw error;
  }
  return response.status === 204 ? {} : response.json();
}

function PasswordField({label, name, autoComplete, minLength = 1, required=true}: {
  label: string; name: string; autoComplete: string; minLength?: number;required?:boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field"><span>{label}</span><span className="auth-password">
    <input name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
      required={required} minLength={minLength} maxLength={128} />
    <button type="button" aria-label={`${label} ${visible ? '숨기기' : '보기'}`}
      aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? '숨기기' : '보기'}</button>
  </span></label>;
}

export function AuthGate({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [legacyPending, setLegacyPending] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const accountButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const resetSession = useCallback(() => {
    generation.current++;
    setUser(null); setSignup(false); setAccountOpen(false); setLegacyPending(false); setLoading(false);
    setError(''); setNotice('로그인이 필요합니다. 다시 로그인해 주세요.');
  }, []);

  const loadSession = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setSessionError(false);
    try {
      const session = await authRequest('session');
      if (current !== generation.current) return;
      setUser(session.user || null); setLegacyPending(!!session.legacyClaimPending);
    } catch (cause) {
      if (current !== generation.current) return;
      setUser(null);
      if ((cause as {status?: number}).status !== 401) setSessionError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
    window.addEventListener('pds-session-expired', resetSession);
    return () => {generation.current++; window.removeEventListener('pds-session-expired', resetSession);};
  }, [loadSession, resetSession]);

  useEffect(() => {
    if (!accountOpen) return;
    dialog.current?.showModal();
    return () => {accountButton.current?.focus();};
  }, [accountOpen]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    setError(''); setNotice('');
    if (signup && password !== data.get('confirmPassword')) {
      setError('비밀번호 확인이 일치하지 않습니다.'); return;
    }
    inFlight.current = true; setBusy(true);
    try {
      const ownerSetupKey=String(data.get('ownerSetupKey')||'').trim();
      if (signup && username === 'eldi96' && !ownerSetupKey) {
        form.querySelector<HTMLDetailsElement>('details')?.setAttribute('open', '');
        form.querySelector<HTMLInputElement>('[name="ownerSetupKey"]')?.focus();
        throw new Error('eldi96은 기존 기록을 보호하는 아이디입니다. 기존 기록 연결 확인코드를 입력해 주세요.');
      }
      const session = await authRequest(signup ? 'sign-up' : 'sign-in', {username, password, ...(signup&&ownerSetupKey?{ownerSetupKey}:{})});
      if(ownerSetupKey){
        const claim=await fetch('/api/owner-claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupKey:ownerSetupKey})});
        if(!claim.ok)throw new Error('가입 또는 로그인은 되었지만 기존 기록 연결을 완료하지 못했습니다. 계정 메뉴에서 다시 시도해 주세요.');
      }
      form.reset();
      setSignup(false);
      if (session.user) {
        setUser(session.user); setLegacyPending(!!session.legacyClaimPending);
      } else {
        await loadSession();
        if (signup) {setSignup(false); setNotice('가입이 완료되었습니다. 아이디로 로그인해 주세요.');}
      }
    } catch (cause) {setError((cause as Error).message);}
    finally {inFlight.current = false; setBusy(false);}
  }

  async function accountAction(path: string, body: object) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await authRequest(path, body);
      resetSession();
      setNotice(path === 'change-password' ? '비밀번호가 변경되었습니다. 다시 로그인해 주세요.'
        : path === 'delete-account' ? '계정이 삭제되었습니다.' : '로그아웃되었습니다.');
    } catch (cause) {setError((cause as Error).message);}
    finally {inFlight.current = false; setBusy(false);}
  }

  if (loading || sessionError) return <main className="auth-screen"><section className="auth-card auth-status" aria-live="polite">
    <p className="auth-brand">PDS / diary</p><h1>{sessionError ? '연결을 확인해 주세요.' : '로그인 상태 확인 중'}</h1>
    {sessionError && <><p>로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      <button className="auth-primary" onClick={() => void loadSession()}>다시 시도</button></>}
  </section></main>;

  if (!user) return <main className="auth-screen"><section className="auth-card" aria-labelledby="auth-title">
    <p className="auth-brand">PDS / diary</p><h1 id="auth-title">오늘의 기록,<br/><em>나만의 공간에.</em></h1>
    <p className="auth-intro">로그인하고 계획과 기록을 이어가세요.<br/>내 기록은 로그인한 나에게만 보입니다.</p>
    <div className="auth-mode" aria-label="계정 이용 방식">
      <button type="button" aria-pressed={!signup} disabled={busy} onClick={() => {setSignup(false); setError(''); setNotice('');}}>로그인</button>
      <button type="button" aria-pressed={signup} disabled={busy} onClick={() => {setSignup(true); setError(''); setNotice('');}}>회원가입</button>
    </div>
    <form key={signup ? 'signup' : 'login'} onSubmit={submitLogin}>
      <fieldset disabled={busy}>
        <label className="auth-field"><span>아이디</span><input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
          required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" aria-describedby={signup ? 'auth-id-hint' : undefined}/></label>
        {signup && <p className="auth-hint" id="auth-id-hint">영문·숫자·밑줄·마침표로 3~30자 · 영문은 소문자로 저장됩니다.</p>}
        <PasswordField label="비밀번호" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 4 : 1}/>
        {signup && <><p className="auth-hint">비밀번호는 4자 이상으로 설정해 주세요.</p><PasswordField label="비밀번호 확인" name="confirmPassword" autoComplete="new-password" minLength={4}/></>}
        <details open={signup}><summary className="auth-hint">기존 기록 연결 · 해당하는 경우만</summary>
          <p className="auth-hint">기존 기록의 주인인 eldi96으로 처음 가입할 때는 별도로 전달된 연결 확인코드가 필요합니다. 다른 아이디로 가입할 때는 비워 두세요.</p>
          <PasswordField label="기존 기록 연결 확인코드" name="ownerSetupKey" autoComplete="off" required={false}/></details>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <button className="auth-primary" type="submit">{busy ? '확인 중…' : signup ? '내 공간 만들기' : '로그인'}</button>
      </fieldset>
    </form>
    {signup && <p className="auth-footnote">현재 아이디·비밀번호 찾기는 지원하지 않습니다. 가입 정보를 안전하게 보관해 주세요.</p>}
  </section></main>;

  return <>
    <div className="auth-account-strip"><button ref={accountButton} type="button" className="auth-account-button"
      aria-haspopup="dialog" onClick={event => {setKeyboard(event.detail === 0); setError(''); setAccountOpen(true);}}>
      <span className="auth-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span><span>{user.username}</span><span aria-hidden="true">⌄</span>
    </button></div>
    {legacyPending && <p className="auth-legacy-notice" role="status">기존 기록의 계정 연결을 준비 중입니다. 연결 전에는 기존 기록이 표시되지 않습니다.</p>}
    <div key={user.id}>{children}</div>
    {accountOpen && <dialog ref={dialog} className="auth-dialog" data-keyboard={keyboard} aria-labelledby="auth-account-title"
      onCancel={event => {event.preventDefault(); if (!busy) setAccountOpen(false);}}>
      <div className="auth-dialog-header"><div><p className="auth-brand">내 계정</p><h2 id="auth-account-title">{user.username}</h2></div>
        <button type="button" className="auth-close" aria-label="계정 설정 닫기" disabled={busy} onClick={() => setAccountOpen(false)}>×</button></div>
      <p className="auth-hint">비밀번호를 변경하면 모든 기기에서 로그아웃됩니다. 현재 계정 복구 기능은 지원하지 않습니다.</p>
      <form onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        if (data.get('newPassword') !== data.get('confirmPassword')) {setError('비밀번호 확인이 일치하지 않습니다.'); return;}
        void accountAction('change-password', {currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword')});
      }}><fieldset disabled={busy}><h3>비밀번호 변경</h3>
        <PasswordField label="현재 비밀번호" name="currentPassword" autoComplete="current-password"/>
        <PasswordField label="새 비밀번호 · 4자 이상" name="newPassword" autoComplete="new-password" minLength={4}/>
        <PasswordField label="새 비밀번호 확인" name="confirmPassword" autoComplete="new-password" minLength={4}/>
        <button className="auth-secondary" type="submit">비밀번호 변경</button>
      </fieldset></form>
      <div className="auth-divider"/>
      <button className="auth-secondary" type="button" disabled={busy} onClick={() => void accountAction('sign-out', {})}>로그아웃</button>
      <details className="auth-delete"><summary>계정 삭제</summary><p>계정과 연결된 기록이 삭제됩니다. 필요한 기록을 먼저 내보내 주세요. 이 작업은 되돌릴 수 없습니다.</p>
        <form onSubmit={event => {event.preventDefault(); const data = new FormData(event.currentTarget); void accountAction('delete-account', {password: data.get('password')});}}>
          <fieldset disabled={busy}><PasswordField label="비밀번호 확인" name="password" autoComplete="current-password"/>
            <label className="auth-delete-confirm"><input type="checkbox" required/>계정과 기록을 삭제하는 데 동의합니다.</label>
            <button className="auth-danger" type="submit">계정과 기록 삭제</button>
          </fieldset>
        </form>
      </details>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </dialog>}
  </>;
}

