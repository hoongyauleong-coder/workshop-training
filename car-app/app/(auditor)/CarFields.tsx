import { SEVERITIES, type Car } from '@/lib/types';

/** The finding fields, shared by "new CAR" and "edit CAR". */
export function CarFields({ car, lockOwner }: { car?: Partial<Car>; lockOwner?: boolean }) {
  return (
    <div className="fields">
      <label>Kawasan / Area / Dept<input name="area" defaultValue={car?.area} placeholder="Stor Buangan Terjadual" /></label>
      <label>Tahap / Severity
        <select name="severity" defaultValue={car?.severity || ''}>
          <option value="">–</option>
          {SEVERITIES.map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="wide">Penemuan / Finding *<textarea name="finding" required defaultValue={car?.finding} placeholder="Spill kit di stor SW kosong semasa pemeriksaan." /></label>
      <label className="wide">Rujukan / Requirement / Ref<input name="requirement_ref" defaultValue={car?.requirement_ref} placeholder="EQ (Scheduled Wastes) Regulations 2005, Reg. 10" /></label>
      <label>Pemilik / Owner name<input name="owner_name" defaultValue={car?.owner_name} disabled={lockOwner} /></label>
      <label>Owner email<input name="owner_email" type="email" defaultValue={car?.owner_email} disabled={lockOwner} /></label>
      <label>Ketua Jabatan / HOD name<input name="hod_name" defaultValue={car?.hod_name} /></label>
      <label>HOD email<input name="hod_email" type="email" defaultValue={car?.hod_email} /></label>
      {!lockOwner && <label>CAR No (blank = auto)<input name="car_no" defaultValue={car?.car_no ?? ''} placeholder="CAR-2026-10-001" /></label>}
    </div>
  );
}
