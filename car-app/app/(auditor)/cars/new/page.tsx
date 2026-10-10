import { createCar, importCars } from '../../actions';
import { Banner } from '../../ui';
import { CarFields } from '../../CarFields';

export default async function NewCar({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <div className="head"><div><h1>CAR baharu / New CAR</h1><div className="muted small">One finding = one CAR.</div></div></div>
      <Banner ok={sp.ok} err={sp.err} />
      <div className="panel">
        <h2>Satu penemuan / Single finding</h2>
        <form action={createCar} style={{ display: 'grid', gap: 14 }}>
          <CarFields />
          <div className="row">
            <label className="check"><input type="checkbox" name="send_now" defaultChecked /> Hantar sekarang / Send to owner now</label>
            <button className="primary" type="submit">Simpan / Save</button>
          </div>
        </form>
      </div>
      <div className="panel">
        <h2>Import banyak / Bulk import from Excel</h2>
        <p className="muted small">
          Copy rows from Excel <b>including the header row</b> and paste below (or paste the walkthrough skill CSV).
          Recognised headers: Area / Kawasan, Finding / Description / Penemuan, Requirement / Reference / Rujukan, Severity / Tahap,
          Owner Name / PIC / Nama, Owner Email / Emel, HOD Name / Pengurus, HOD Email / Emel Pengurus, CAR No.
          Imported CARs are saved as <b>New</b>. Nothing is emailed until you click &quot;Hantar CAR baharu&quot;.
        </p>
        <form action={importCars} style={{ display: 'grid', gap: 12 }}>
          <textarea name="paste" className="mono" required placeholder={'Area\tFinding\tReference\tSeverity\tOwner Name\tOwner Email\tHOD Name\tHOD Email'} />
          <div><button type="submit">Import</button></div>
        </form>
      </div>
    </>
  );
}
