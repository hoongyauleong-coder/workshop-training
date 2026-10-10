import { signIn } from './actions';

const MESSAGES: Record<string, string> = {
  'bad-login': 'E-mel atau kata laluan salah / Wrong email or password.',
  'not-auditor': 'This account is not on the auditor list. Ask an auditor to add you in Settings.'
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="owner">
      <div className="card">
        <div className="eyebrow">Jabatan Pematuhan</div>
        <h1>CAR/PAR Log Masuk</h1>
        <p className="muted">Auditor sign-in. Owners don&apos;t need an account: they use the link in their email.</p>
        {e && MESSAGES[e] && <div className="banner err">{MESSAGES[e]}</div>}
        <form action={signIn} style={{ display: 'grid', gap: 12 }}>
          <label>E-mel / Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Kata laluan / Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="primary" type="submit">Log masuk / Sign in</button>
        </form>
      </div>
    </div>
  );
}
