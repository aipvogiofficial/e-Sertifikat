/* =========================================================
 * Backend tiruan untuk MODE DEMO.
 * Meniru perilaku Apps Script, data disimpan di localStorage
 * perangkat ini saja. Login demo: demo / demo
 * ========================================================= */
const DemoApi = (() => {
  const KEY = 'eserti_demo_db';
  const DEFAULT_PENG = {
    kode_nomor: 'AIPVOGI/Sek',
    label_diberikan: 'Diberikan Kepada :',
    label_sebagai: 'Atas Partisipasinya Sebagai',
    ttd_jabatan_1: 'Ketua Umum',
    ttd_jabatan_2: 'Asosiasi Institusi Pendidikan Tinggi Vokasi Gizi Indonesia',
    ttd_nama: 'Joko Susilo, SKM, M.Kes',
    kota_default: 'Jakarta',
    paragraf_default: 'Pada Kegiatan {kegiatan} yang diselenggarakan oleh Asosiasi Institusi Pendidikan Tinggi Vokasi Gizi Indonesia (AIPVOGI) secara {moda} pada Tanggal {tanggal}{jpl}'
  };

  function db() {
    let d;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!d) {
      d = {
        kegiatan: [{
          id: 'KDEMO1', nama: 'Peningkatan Kompetensi di Bidang Pendidikan Tinggi Vokasi Gizi',
          tgl_mulai: '2026-03-07', tgl_selesai: '2026-03-07', moda: 'Daring', kota: 'Jakarta', jpl: '9',
          tgl_terbit: '2026-03-07', paragraf: DEFAULT_PENG.paragraf_default, dibuat_oleh: 'demo', dibuat_pada: '', diubah_pada: ''
        }],
        sertifikat: [], pengaturan: { ...DEFAULT_PENG }, aset: { ttd: null, stempel: null }
      };
      simpan(d);
    }
    return d;
  }
  function simpan(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { console.warn('Penyimpanan demo penuh', e); }
  }
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  const uid = p => p + Math.random().toString(36).slice(2, 10).toUpperCase();

  async function panggil(aksi, p) {
    await new Promise(r => setTimeout(r, 150));
    const d = db();
    switch (aksi) {
      case 'login':
        if (p.username === 'demo' && p.password === 'demo') return { ok: true, token: 'demo', user: { username: 'demo', nama: 'Pengguna Demo' } };
        return { ok: false, pesan: 'Login demo: username "demo", password "demo".' };
      case 'logout': return { ok: true };
      case 'bootstrap':
        return { ok: true, user: { username: 'demo', nama: 'Pengguna Demo' }, kegiatan: d.kegiatan, pengaturan: d.pengaturan, aset: d.aset };
      case 'listSertifikat': return { ok: true, data: d.sertifikat };
      case 'saveKegiatan': {
        const k = { ...p.data, id: p.data.id || uid('K'), tgl_selesai: p.data.tgl_selesai || p.data.tgl_mulai, diubah_pada: now() };
        k.tgl_terbit = k.tgl_terbit || k.tgl_selesai;
        const i = d.kegiatan.findIndex(x => x.id === k.id);
        if (i >= 0) d.kegiatan[i] = { ...d.kegiatan[i], ...k }; else d.kegiatan.push({ ...k, dibuat_oleh: 'demo', dibuat_pada: now() });
        simpan(d); return { ok: true, data: k };
      }
      case 'deleteKegiatan': d.kegiatan = d.kegiatan.filter(x => x.id !== p.id); simpan(d); return { ok: true };
      case 'saveSertifikat': {
        const s = p.data;
        const b = d.sertifikat.find(x => x.nomor === s.nomor && x.id !== s.id);
        if (b && !p.force) return { ok: false, kode: 'DUPLIKAT', pesan: `Nomor ${s.nomor} sudah dipakai untuk ${b.nama_penerima} (${b.nama_kegiatan}).` };
        const rec = { id: s.id || uid('S'), nomor: s.nomor, nomor_urut: s.nomor_urut, id_kegiatan: s.id_kegiatan, nama_kegiatan: s.nama_kegiatan,
          nama_penerima: s.nama_penerima, peran: s.peran, data_json: JSON.stringify(s.data), dibuat_oleh: 'demo', dibuat_pada: now(), diubah_oleh: '', diubah_pada: '' };
        const i = d.sertifikat.findIndex(x => x.id === rec.id);
        if (i >= 0) { rec.dibuat_pada = d.sertifikat[i].dibuat_pada; rec.diubah_oleh = 'demo'; rec.diubah_pada = now(); d.sertifikat[i] = rec; }
        else d.sertifikat.push(rec);
        simpan(d); return { ok: true, data: rec };
      }
      case 'deleteSertifikat': d.sertifikat = d.sertifikat.filter(x => x.id !== p.id); simpan(d); return { ok: true };
      case 'savePengaturan': d.pengaturan = { ...d.pengaturan, ...p.data }; simpan(d); return { ok: true, pengaturan: d.pengaturan };
      case 'uploadAset': d.aset[p.jenis] = p.dataUrl; simpan(d); return { ok: true, dataUrl: p.dataUrl };
      case 'gantiPassword': return { ok: false, pesan: 'Tidak tersedia di mode demo.' };
      default: return { ok: false, pesan: 'Aksi tidak dikenal' };
    }
  }
  return { panggil, reset: () => localStorage.removeItem(KEY) };
})();
