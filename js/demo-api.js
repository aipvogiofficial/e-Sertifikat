/* =========================================================
 * Backend tiruan untuk MODE DEMO (meniru Apps Script v1.3).
 * Data disimpan di localStorage perangkat ini saja.
 * Login demo: demo / demo
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
    paragraf_default: 'Pada Kegiatan {kegiatan} yang diselenggarakan oleh Asosiasi Institusi Pendidikan Tinggi Vokasi Gizi Indonesia (AIPVOGI) secara {moda} pada Tanggal {tanggal}{jpl}',
    latar_file_id: ''
  };

  function db() {
    let d;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!d) {
      d = {
        kegiatan: [{
          id: 'KDEMO1', nama: 'Peningkatan Kompetensi di Bidang Pendidikan Tinggi Vokasi Gizi',
          tgl_mulai: '2026-03-07', tgl_selesai: '2026-03-07', moda: 'Daring', kota: 'Jakarta', jpl: '9',
          tgl_terbit: '2026-03-07', paragraf: DEFAULT_PENG.paragraf_default, dibuat_oleh: 'demo', dibuat_pada: '', diubah_pada: '',
          nomor_peran: JSON.stringify({ Peserta: '046', Narasumber: '047', Moderator: '048', Panitia: '049' }), buka_publik: '1', latar_id: ''
        }],
        sertifikat: [], pengaturan: { ...DEFAULT_PENG }, aset: { ttd: null, stempel: null }, latar: {}
      };
      simpan(d);
    }
    d.latar = d.latar || {};
    return d;
  }
  function simpan(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { console.warn('Penyimpanan demo penuh', e); }
  }
  const now = () => new Date().toLocaleString('sv-SE').slice(0, 19);
  const uid = p => p + Math.random().toString(36).slice(2, 10).toUpperCase();
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function kode(d) {
    const h = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let k;
    do { k = ''; for (let i = 0; i < 10; i++) k += h[Math.floor(Math.random() * h.length)]; }
    while (d.sertifikat.some(s => s.kode === k));
    return k;
  }
  const bentrok = (d, nomor, idKeg, peran, id) => d.sertifikat.find(r => r.nomor === nomor && r.id !== id && (r.id_kegiatan !== idKeg || r.peran !== peran));
  function rec(d, s, lama) {
    return {
      id: s.id || uid('S'), nomor: s.nomor, nomor_urut: s.nomor_urut, id_kegiatan: s.id_kegiatan, nama_kegiatan: s.nama_kegiatan,
      nama_penerima: s.nama_penerima, peran: s.peran, data_json: JSON.stringify(s.data || {}),
      dibuat_oleh: lama ? lama.dibuat_oleh : 'demo', dibuat_pada: lama ? lama.dibuat_pada : now(),
      diubah_oleh: lama ? 'demo' : '', diubah_pada: lama ? now() : '', kode: (lama && lama.kode) || kode(d)
    };
  }
  function kegPublik(d, k) {
    const keg = d.kegiatan.find(x => x.id === k);
    if (!keg) return { err: { ok: false, pesan: 'Kegiatan tidak ditemukan. Periksa kembali link yang Anda terima.' } };
    const ring = { id: keg.id, nama: keg.nama, tgl_mulai: keg.tgl_mulai, tgl_selesai: keg.tgl_selesai, moda: keg.moda, kota: keg.kota };
    if (keg.buka_publik !== '1') return { err: { ok: false, kode: 'TUTUP', pesan: 'Pengunduhan sertifikat untuk kegiatan ini belum dibuka.', kegiatan: ring } };
    return { keg, ring };
  }

  async function panggil(aksi, p) {
    await new Promise(r => setTimeout(r, 120));
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
        const lama = d.kegiatan.find(x => x.id === p.data.id);
        const k = { ...p.data, id: p.data.id || uid('K'), tgl_selesai: p.data.tgl_selesai || p.data.tgl_mulai, diubah_pada: now() };
        k.tgl_terbit = k.tgl_terbit || k.tgl_selesai;
        k.buka_publik = k.buka_publik === '1' ? '1' : '';
        k.latar_id = (lama && lama.latar_id) || d.pengaturan.latar_file_id || '';
        if (lama) Object.assign(lama, k); else d.kegiatan.push({ ...k, dibuat_oleh: 'demo', dibuat_pada: now() });
        simpan(d); return { ok: true, data: k };
      }
      case 'deleteKegiatan': d.kegiatan = d.kegiatan.filter(x => x.id !== p.id); simpan(d); return { ok: true };
      case 'saveSertifikat': {
        const s = p.data;
        const b = bentrok(d, s.nomor, s.id_kegiatan, s.peran, s.id);
        if (b && !p.force) return { ok: false, kode: 'DUPLIKAT', pesan: `Nomor ${s.nomor} sudah dipakai untuk peran ${b.peran} pada kegiatan ${b.nama_kegiatan}.` };
        const i = d.sertifikat.findIndex(x => x.id === s.id);
        const r = rec(d, s, i >= 0 ? d.sertifikat[i] : null);
        if (i >= 0) d.sertifikat[i] = r; else d.sertifikat.push(r);
        simpan(d); return { ok: true, data: r };
      }
      case 'saveSertifikatBatch': {
        const sudah = {};
        d.sertifikat.forEach(r => (sudah[r.id_kegiatan + '|' + r.peran + '|' + norm(r.nama_penerima)] = r));
        const baru = [], dilewati = [];
        for (const s of p.items) {
          const kunci = s.id_kegiatan + '|' + s.peran + '|' + norm(s.nama_penerima);
          if (sudah[kunci]) { dilewati.push(sudah[kunci]); continue; }
          const b = !p.force && bentrok(d, s.nomor, s.id_kegiatan, s.peran, null);
          if (b) return { ok: false, kode: 'DUPLIKAT', pesan: `Nomor ${s.nomor} sudah dipakai untuk peran ${b.peran} pada kegiatan ${b.nama_kegiatan}.` };
          const r = rec(d, s, null);
          d.sertifikat.push(r); sudah[kunci] = r; baru.push(r);
        }
        simpan(d); return { ok: true, baru, dilewati };
      }
      case 'deleteSertifikat': d.sertifikat = d.sertifikat.filter(x => x.id !== p.id); simpan(d); return { ok: true };
      case 'perbaruiNomor': {
        let n = 0;
        (p.ubah || []).forEach(u => {
          const s = d.sertifikat.find(x => x.id === u.id); if (!s) return;
          s.nomor = u.nomor; s.nomor_urut = u.nomor_urut;
          const dj = JSON.parse(s.data_json || '{}'); dj.nomor = u.nomor; s.data_json = JSON.stringify(dj); n++;
        });
        simpan(d); return { ok: true, diperbarui: n };
      }
      case 'deleteSertifikatBatch': {
        const set = new Set(p.ids || []); const awal = d.sertifikat.length;
        d.sertifikat = d.sertifikat.filter(x => !set.has(x.id)); simpan(d);
        return { ok: true, terhapus: awal - d.sertifikat.length };
      }
      case 'savePengaturan': d.pengaturan = { ...d.pengaturan, ...p.data }; simpan(d); return { ok: true, pengaturan: d.pengaturan };
      case 'uploadAset': d.aset[p.jenis] = p.dataUrl; simpan(d); return { ok: true, dataUrl: p.dataUrl };
      case 'uploadLatar': {
        const id = uid('L');
        d.latar = { [id]: p.dataUrl }; // simpan satu saja agar localStorage tidak penuh
        d.pengaturan.latar_file_id = id;
        d.kegiatan.forEach(k => (k.latar_id = id));
        simpan(d); return { ok: true, id };
      }
      case 'gantiPassword': return { ok: false, pesan: 'Tidak tersedia di mode demo.' };
      // ---- publik ----
      case 'publikKegiatan': { const r = kegPublik(d, p.k); return r.err || { ok: true, kegiatan: r.ring }; }
      case 'cariPublik': {
        const r = kegPublik(d, p.k); if (r.err) return r.err;
        const q = norm(p.q); if (q.length < 4) return { ok: false, pesan: 'Ketik minimal 4 huruf nama Anda.' };
        const h = d.sertifikat.filter(s => s.id_kegiatan === p.k && norm(s.nama_penerima).includes(q));
        return { ok: true, lebih: h.length > 10, data: h.slice(0, 10).map(s => ({ kode: s.kode, nama: s.nama_penerima, peran: s.peran })) };
      }
      case 'ambilPublik': {
        const r = kegPublik(d, p.k); if (r.err) return r.err;
        const s = d.sertifikat.find(x => x.id_kegiatan === p.k && x.kode === p.kode);
        if (!s) return { ok: false, pesan: 'Sertifikat tidak ditemukan.' };
        const latar = d.latar[r.keg.latar_id] || d.latar[d.pengaturan.latar_file_id];
        if (!latar) return { ok: false, pesan: 'Sertifikat belum siap diunduh. Hubungi panitia.' };
        return { ok: true, data: { ...JSON.parse(s.data_json || '{}'), kode: s.kode }, latar, latar_id: r.keg.latar_id };
      }
      case 'verifikasi': {
        const s = d.sertifikat.find(x => x.kode === String(p.kode || '').toUpperCase());
        if (!s) return { ok: true, sah: false };
        const keg = d.kegiatan.find(k => k.id === s.id_kegiatan) || {};
        const dj = JSON.parse(s.data_json || '{}');
        return { ok: true, sah: true, data: { nomor: s.nomor, nama: s.nama_penerima, peran: s.peran, kegiatan: s.nama_kegiatan, tgl_mulai: keg.tgl_mulai || '', tgl_selesai: keg.tgl_selesai || '', tempat_tanggal: dj.tempat_tanggal || '', penandatangan: dj.ttd_nama || '', kode: s.kode } };
      }
      default: return { ok: false, pesan: 'Aksi tidak dikenal' };
    }
  }
  return { panggil, reset: () => localStorage.removeItem(KEY) };
})();
