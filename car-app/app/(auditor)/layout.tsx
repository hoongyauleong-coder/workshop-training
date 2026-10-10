import Link from 'next/link';
import { requireAuditor } from '@/lib/auth';
import { signOut } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function AuditorLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAuditor();
  return (
    <>
      <nav className="nav">
        <div className="wrap">
          <Link href="/" className="brand">CAR/PAR <span>·</span> Jabatan Pematuhan</Link>
          <Link href="/" className="link">Dashboard</Link>
          <Link href="/cars/new" className="link">+ CAR baharu</Link>
          <Link href="/log" className="link">Log</Link>
          <Link href="/settings" className="link">Settings</Link>
          <form action={signOut}><button className="small" type="submit" title={me.email}>Log keluar</button></form>
        </div>
      </nav>
      <main className="wrap">{children}</main>
    </>
  );
}
