/* =========================================================
 * e-Serti AIPVOGI — logika aplikasi admin (v1.3)
 * ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const LS = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const jeda = () => new Promise(r => setTimeout(r, 0));

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const PERAN_STANDAR = ['Peserta', 'Narasumber', 'Moderator', 'Panitia', 'Pemateri', 'Fasilitator', 'Juri', 'Pembicara', 'Reviewer'];
  const PERAN_AWAL = ['Peserta', 'Narasumber', 'Moderator', 'Panitia'];

  const API_TETAP = ((window.ESERTI_CONFIG && window.ESERTI_CONFIG.API_URL) || '').trim();
  const BASIS = new URL('.', location.href).href;
  Sertifikat.setBasisVerif(BASIS);

  const S = {
    api: API_TETAP || LS.get('eserti_api') || '',
    token: LS.get('eserti_token'),
    user: JSON.parse(LS.get('eserti_user') || 'null'),
    kegiatan: [], pengaturan: {}, sertifikat: null,
    editId: null, kode: null, teksManual: false, nomorManual: false, terakhir: null,
    np: [], bulk: null, mode: 'satu', pilih: new Set()
  };
  const demo = () => S.api === 'demo';

  /* ---------------- util ---------------- */
  function tgl(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${BULAN[m - 1]} ${y}`;
  }
  function rentang(a, b) {
    if (!a) return '';
    if (!b || a === b) return tgl(a);
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BULAN[m1 - 1]} ${y1}`;
    if (y1 === y2) return `${d1} ${BULAN[m1 - 1]} – ${d2} ${BULAN[m2 - 1]} ${y1}`;
    return `${tgl(a)} – ${tgl(b)}`;
  }
  // bulan & tahun nomor mengikuti tanggal terbit (tanggal sertifikat ditandatangani)
  const tanggalNomor = keg => keg ? (keg.tgl_terbit || keg.tgl_selesai || keg.tgl_mulai || '') : '';
  const pad3 = n => { const s = String(n || '').replace(/\D/g, ''); return s ? s.padStart(3, '0') : ''; };
  function nomorLengkap(urut, keg) {
    const n = pad3(urut);
    const t = tanggalNomor(keg);
    if (!n || !t) return '';
    const [y, m] = t.split('-').map(Number);
    return `${n}/${S.pengaturan.kode_nomor || 'AIPVOGI/Sek'}/${ROMAWI[m - 1]}/${y}`;
  }
  function isiParagraf(pola, keg) {
    const jpl = String(keg.jpl || '').trim();
    return String(pola || '')
      .replace(/\{kegiatan\}/g, keg.nama || '')
      .replace(/\{moda\}/g, keg.moda || '')
      .replace(/\{tanggal\}/g, rentang(keg.tgl_mulai, keg.tgl_selesai))
      .replace(/\{jpl\}/g, jpl ? `, dengan Jumlah ${jpl} Jam Pelajaran` : '')
      .replace(/[ \t]{2,}/g, ' ').trim();
  }
  function tempatTanggal(keg) {
    const kota = keg.kota || S.pengaturan.kota_default || '';
    const t = tgl(keg.tgl_terbit || keg.tgl_selesai || keg.tgl_mulai);
    return [kota, t].filter(Boolean).join(', ');
  }
  function nomorPeran(keg) {
    if (!keg || !keg.nomor_peran) return {};
    if (typeof keg.nomor_peran === 'object') return keg.nomor_peran;
    try { return JSON.parse(keg.nomor_peran) || {}; } catch (e) { return {}; }
  }
  const nomorUntuk = (keg, peran) => nomorPeran(keg)[peran] || '';
  const linkPeserta = keg => BASIS + 'cek.html?k=' + encodeURIComponent(keg.id);
  const kanonPeran = p => {
    const t = String(p || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const std = PERAN_STANDAR.find(x => x.toLowerCase() === t.toLowerCase());
    return std || t.charAt(0).toUpperCase() + t.slice(1);
  };
  const normalNama = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const tahunNomor = n => (String(n || '').match(/\/(\d{4})$/) || [])[1] || '';
  function dataDariRec(s) {
    let d = {};
    try { d = JSON.parse(s.data_json || '{}'); } catch (e) {}
    d.kode = s.kode || d.kode;
    return d;
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bersihNamaFile = s => String(s || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 50);
  const namaFile = (d, ext) => `Sertifikat_${(d.nomor || '').split('/')[0]}_${bersihNamaFile(d.nama || 'penerima')}.${ext}`;

  let toastT;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6500 : 3500);
  }
  function loading(on, txt = 'Memproses…') { $('#loading').hidden = !on; $('#loading-txt').textContent = txt; }

  const skripDimuat = {};
  function muatSkrip(src) {
    if (!skripDimuat[src]) skripDimuat[src] = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src; el.onload = res; el.onerror = () => rej(new Error('Gagal memuat ' + src));
      document.head.appendChild(el);
    });
    return skripDimuat[src];
  }

  async function salin(teks) {
    try { await navigator.clipboard.writeText(teks); toast('Link disalin. Tempel di grup WA.'); }
    catch (e) { prompt('Salin link ini:', teks); }
  }

  /* ---------------- API ---------------- */
  async function api(aksi, payload = {}) {
    const body = { aksi, token: S.token, ...payload };
    let res;
    if (demo()) res = await DemoApi.panggil(aksi, body);
    else {
      if (!S.api) throw new Error('URL server belum diisi.');
      let r;
      try {
        r = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      } catch (e) {
        throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');
      }
      try { res = await r.json(); } catch (e) { throw new Error('Balasan server tidak valid. Pastikan Apps Script sudah di-deploy versi terbaru untuk "Siapa saja".'); }
    }
    if (res && res.kode === 'SESI') { keluar(true); throw new Error(res.pesan); }
    if (res && !res.ok && /Aksi tidak dikenal/.test(res.pesan || '')) {
      throw new Error('Server Apps Script belum diperbarui ke versi terbaru. Tempel Code.gs baru, jalankan setup, lalu deploy "Versi baru".');
    }
    return res;
  }

  /* ---------------- login ---------------- */
  function tampilLogin() {
    $('#v-app').hidden = true; $('#v-login').hidden = false;
    $('.server').hidden = !!API_TETAP;
    $('#in-api').value = demo() ? '' : S.api;
    if (!S.api) $('.server').open = true;
  }
  $('#b-simpan-api').onclick = () => {
    const v = $('#in-api').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(v)) return toast('URL harus diawali https://script.google.com/…', true);
    S.api = v; LS.set('eserti_api', v); toast('URL server disimpan');
  };
  $('#b-demo').onclick = () => {
    S.api = 'demo'; LS.set('eserti_api', 'demo');
    $('#f-login').username.value = 'demo'; $('#f-login').password.value = 'demo';
    toast('Mode demo aktif. Klik Masuk.');
  };
  $('#f-login').onsubmit = async e => {
    e.preventDefault();
    const f = e.target; $('#login-err').textContent = '';
    loading(true, 'Masuk…');
    try {
      const r = await api('login', { username: f.username.value.trim(), password: f.password.value });
      if (!r.ok) throw new Error(r.pesan);
      S.token = r.token; S.user = r.user;
      LS.set('eserti_token', r.token); LS.set('eserti_user', JSON.stringify(r.user));
      f.password.value = '';
      await mulai();
    } catch (err) { $('#login-err').textContent = err.message; }
    finally { loading(false); }
  };
  function keluar(sesiHabis = false) {
    if (!sesiHabis && S.token) api('logout').catch(() => {});
    S.token = null; S.user = null; S.sertifikat = null;
    ['eserti_token', 'eserti_user', 'eserti_cache'].forEach(LS.del);
    Sertifikat.setAset('ttd', null); Sertifikat.setAset('stempel', null);
    tampilLogin();
  }
  $('#b-petunjuk').onclick = () => { const p = $('#petunjuk-app'); p.hidden = !p.hidden; if (!p.hidden) window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#b-tutup-petunjuk').onclick = () => { $('#petunjuk-app').hidden = true; };
  $('#b-logout').onclick = () => { if (confirm('Keluar dari aplikasi?')) keluar(); };

  /* ---------------- mulai ---------------- */
  async function muatData() {
    const r = await api('bootstrap');
    if (!r.ok) throw new Error(r.pesan);
    S.kegiatan = r.kegiatan || []; S.pengaturan = r.pengaturan || {};
    await Promise.all([Sertifikat.setAset('ttd', r.aset && r.aset.ttd), Sertifikat.setAset('stempel', r.aset && r.aset.stempel)]);
    $('#img-ttd').src = (r.aset && r.aset.ttd) || '';
    $('#img-stempel').src = (r.aset && r.aset.stempel) || '';
    LS.set('eserti_cache', JSON.stringify({ kegiatan: S.kegiatan, pengaturan: S.pengaturan, aset: r.aset }));
  }

  async function mulai() {
    $('#v-login').hidden = true; $('#v-app').hidden = false;
    $('#u-nama').textContent = S.user ? S.user.nama : '';
    $('#badge-demo').hidden = !demo();
    $('#info-api').textContent = demo() ? 'Mode demo: data hanya tersimpan di perangkat ini.' : 'Terhubung ke: ' + S.api.replace(/(\/s\/.{8}).*(\/exec)/, '$1…$2');
    loading(true, 'Memuat data…');
    try {
      await Sertifikat.siapkan();
      try { await muatData(); }
      catch (err) {
        const c = JSON.parse(LS.get('eserti_cache') || 'null');
        if (!c) throw err;
        S.kegiatan = c.kegiatan; S.pengaturan = c.pengaturan;
        await Promise.all([Sertifikat.setAset('ttd', c.aset && c.aset.ttd), Sertifikat.setAset('stempel', c.aset && c.aset.stempel)]);
        toast('Offline: memakai data tersimpan. Menyimpan sertifikat butuh internet.', true);
      }
      isiSemua();
      bukaTab(S.kegiatan.length ? 'buat' : 'kegiatan');
      if (!LS.get('eserti_petunjuk_v13')) { $('#petunjuk-app').hidden = false; LS.set('eserti_petunjuk_v13', '1'); }
      muatRiwayat();
      if (!S.pengaturan.latar_file_id && Sertifikat.ada('ttd') && Sertifikat.ada('stempel')) perbaruiLatar(true);
    } catch (err) { toast(err.message, true); }
    finally { loading(false); }
  }

  function isiSemua() {
    isiPilihanKegiatan(); renderDaftarKegiatan(); isiFormPengaturan(); infoLatar();
    resetKegiatanForm(); cekAset(); isiPilihanPeran(); isiTeksBawaan(); isiNomorOtomatis(); gambarPratinjau();
  }

  /* ---------------- tabs ---------------- */
  function bukaTab(nama) {
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === nama));
    $$('.tab').forEach(t => (t.hidden = t.id !== 't-' + nama));
    if (nama === 'riwayat') { if (S.sertifikat) renderRiwayat(); else muatRiwayat(); }
    if (nama === 'buat') gambarPratinjau();
    window.scrollTo(0, 0);
  }
  $$('#tabs button').forEach(b => (b.onclick = () => bukaTab(b.dataset.tab)));
  document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) bukaTab(g.dataset.goto); });

  /* ============ TAB BUAT — satu per satu ============ */
  const F = $('#f-sert');
  const kegDipilih = () => S.kegiatan.find(k => k.id === F.id_kegiatan.value);
  const peranDipilih = () => F.peran.value === '__lain' ? kanonPeran(F.peran_lain.value) : F.peran.value;
  const kegiatanUrut = () => [...S.kegiatan].sort((a, b) => (b.tgl_mulai || '').localeCompare(a.tgl_mulai || ''));

  function opsiKegiatan() {
    return kegiatanUrut().map(k => `<option value="${esc(k.id)}">${esc(k.nama)} — ${esc(rentang(k.tgl_mulai, k.tgl_selesai))}</option>`).join('');
  }
  function isiPilihanKegiatan() {
    const lama = F.id_kegiatan.value, lamaB = $('#bk-kegiatan').value;
    const opsi = opsiKegiatan();
    F.id_kegiatan.innerHTML = opsi; $('#bk-kegiatan').innerHTML = opsi;
    if (lama && S.kegiatan.some(k => k.id === lama)) F.id_kegiatan.value = lama;
    if (lamaB && S.kegiatan.some(k => k.id === lamaB)) $('#bk-kegiatan').value = lamaB;
    else $('#bk-kegiatan').value = F.id_kegiatan.value;
    $('#kegiatan-kosong').hidden = S.kegiatan.length > 0;
    $('#f-keg').innerHTML = '<option value="">Semua kegiatan</option>' + kegiatanUrut().map(k => `<option value="${esc(k.id)}">${esc(k.nama)}</option>`).join('');
  }

  function opsiPeran(keg, dengan) {
    const np = nomorPeran(keg);
    const punya = Object.keys(np).filter(p => np[p]);
    const lain = PERAN_STANDAR.filter(p => !punya.includes(p));
    if (dengan && !punya.includes(dengan) && !lain.includes(dengan)) lain.unshift(dengan);
    return (punya.length ? `<optgroup label="Sudah punya nomor">${punya.map(p => `<option value="${esc(p)}">${esc(p)} · ${esc(pad3(np[p]))}</option>`).join('')}</optgroup>` : '') +
      `<optgroup label="${punya.length ? 'Peran lain' : 'Peran'}">${lain.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</optgroup>`;
  }

  function isiPilihanPeran(paksa) {
    const k = kegDipilih();
    const lama = paksa || peranDipilih() || '';
    F.peran.innerHTML = opsiPeran(k, lama) + '<option value="__lain">Lainnya…</option>';
    const np = nomorPeran(k);
    if (lama && [...F.peran.options].some(o => o.value === lama)) F.peran.value = lama;
    else F.peran.value = Object.keys(np).find(p => np[p]) || F.peran.options[0].value;
    $('#l-peran-lain').hidden = F.peran.value !== '__lain';
  }

  function isiNomorOtomatis() {
    const k = kegDipilih(), p = peranDipilih();
    const info = $('#nomor-sumber');
    const n = nomorUntuk(k, p);
    if (!S.nomorManual) F.nomor_urut.value = n ? pad3(n) : '';
    if (!k) { info.textContent = ''; info.className = 'hint'; return; }
    if (n) { info.textContent = `Nomor otomatis dari pengaturan kegiatan untuk peran ${p}.`; info.className = 'hint'; }
    else { info.innerHTML = `Peran <b>${esc(p || '-')}</b> belum punya nomor di kegiatan ini. Ketik manual, atau atur di <button type="button" class="link" data-goto="kegiatan">tab Kegiatan</button>.`; info.className = 'hint warn-txt'; }
  }

  function isiTeksBawaan() {
    const k = kegDipilih();
    if (!k) { F.paragraf.value = ''; F.tempat_tanggal.value = ''; return; }
    F.paragraf.value = isiParagraf(k.paragraf || S.pengaturan.paragraf_default, k);
    F.tempat_tanggal.value = tempatTanggal(k);
    S.teksManual = false;
  }

  function cekAset() { $('#aset-warn').hidden = Sertifikat.ada('ttd') && Sertifikat.ada('stempel'); }

  function dasarData(keg) {
    const p = S.pengaturan;
    return {
      paragraf: isiParagraf(keg.paragraf || p.paragraf_default, keg),
      tempat_tanggal: tempatTanggal(keg),
      label_diberikan: p.label_diberikan, label_sebagai: p.label_sebagai,
      ttd_jabatan_1: p.ttd_jabatan_1, ttd_jabatan_2: p.ttd_jabatan_2, ttd_nama: p.ttd_nama
    };
  }

  function dataSertifikat() {
    const k = kegDipilih() || {};
    return {
      ...dasarData(k),
      nomor: nomorLengkap(F.nomor_urut.value, k),
      nama: F.nama.value.trim(),
      peran: peranDipilih(),
      paragraf: F.paragraf.value,
      tempat_tanggal: F.tempat_tanggal.value,
      kode: S.kode || undefined
    };
  }

  let rafId;
  function gambarPratinjau() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      let d;
      if (S.mode === 'banyak') {
        const k = S.kegiatan.find(x => x.id === $('#bk-kegiatan').value) || {};
        const r = S.bulk && S.bulk.rows.find(x => !x.err);
        const peran = r ? r.peran : $('#bk-peran').value;
        d = { ...dasarData(k), nama: r ? r.nama : 'Nama Penerima', peran, nomor: nomorLengkap(nomorUntuk(k, peran), k) };
      } else {
        d = dataSertifikat();
        $('#o-nomor').textContent = d.nomor || '—';
        cekNomorGanda(d.nomor);
      }
      try { Sertifikat.gambarKe($('#cv'), d, { areaAman: $('#c-aman').checked, pratinjau: true }); } catch (e) { /* aset belum siap */ }
    });
  }

  function pemakaiNomor(nomor, idKeg, peran) {
    if (!nomor) return null;
    for (const k of S.kegiatan) {
      const np = nomorPeran(k);
      for (const p of Object.keys(np)) {
        if (np[p] && nomorLengkap(np[p], k) === nomor && (k.id !== idKeg || p !== peran)) return `peran ${p} pada kegiatan ${k.nama}`;
      }
    }
    const b = (S.sertifikat || []).find(s => s.nomor === nomor && s.id !== S.editId && (s.id_kegiatan !== idKeg || s.peran !== peran));
    return b ? `peran ${b.peran} pada kegiatan ${b.nama_kegiatan}` : null;
  }
  function cekNomorGanda(nomor) {
    const k = kegDipilih();
    const dipakai = k ? pemakaiNomor(nomor, k.id, peranDipilih()) : null;
    $('#nomor-warn').textContent = dipakai ? `Nomor ini sudah dipakai untuk ${dipakai}.` : '';
  }

  F.addEventListener('input', e => {
    if (e.target.name === 'paragraf' || e.target.name === 'tempat_tanggal') S.teksManual = true;
    if (e.target.name === 'nomor_urut') S.nomorManual = true;
    if (e.target.name === 'peran_lain') { S.nomorManual = false; isiNomorOtomatis(); }
    gambarPratinjau();
  });
  F.id_kegiatan.addEventListener('change', () => {
    S.nomorManual = false; isiPilihanPeran(); isiTeksBawaan(); isiNomorOtomatis(); gambarPratinjau();
    $('#bk-kegiatan').value = F.id_kegiatan.value;
  });
  F.peran.addEventListener('change', () => {
    $('#l-peran-lain').hidden = F.peran.value !== '__lain';
    S.nomorManual = false; isiNomorOtomatis(); gambarPratinjau();
  });
  $('#c-aman').onchange = gambarPratinjau;
  $('#b-reset-teks').onclick = () => { isiTeksBawaan(); gambarPratinjau(); };

  function sembunyikanStatus() { $('#ok-card').hidden = true; $('#edit-banner').hidden = true; }

  function kosongkanForm() {
    S.editId = null; S.kode = null; S.terakhir = null; S.nomorManual = false;
    F.nama.value = ''; F.peran_lain.value = '';
    sembunyikanStatus(); isiPilihanPeran(); isiTeksBawaan(); isiNomorOtomatis(); gambarPratinjau();
  }

  // berikutnya: kegiatan, peran, dan nomor tetap; nama dikosongkan
  function berikutnya() {
    S.editId = null; S.kode = null; S.terakhir = null;
    F.nama.value = '';
    sembunyikanStatus(); if (!S.teksManual) isiTeksBawaan(); gambarPratinjau();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    F.nama.focus();
  }

  async function unduhAutocrat(fmt) {
    const d = dataSertifikat();
    if (!kegDipilih()) return toast('Pilih kegiatan terlebih dahulu.', true);
    if (!d.peran) return toast('Isi peran terlebih dahulu.', true);
    if (!d.nomor) return toast('Isi nomor urut, atau atur nomor peran di tab Kegiatan.', true);
    if (!Sertifikat.ada('ttd') || !Sertifikat.ada('stempel')) return toast('Unggah TTD dan stempel dulu di tab Pengaturan.', true);
    loading(true, 'Membuat latar…');
    try {
      const cv = document.createElement('canvas');
      Sertifikat.gambarKe(cv, { ...d, kode: undefined }, { tanpaNama: true });
      const blob = fmt === 'png' ? await new Promise(r => cv.toBlob(r, 'image/png')) : await Sertifikat.keBlobJpg(cv, { mutu: 0.95 });
      unduh(blob, `Latar_Autocrat_${bersihNamaFile(d.peran)}_${(d.nomor || '').split('/')[0]}.${fmt}`);
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  }
  $('#b-autocrat-jpg').onclick = () => unduhAutocrat('jpg');
  $('#b-autocrat-png').onclick = () => unduhAutocrat('png');

  $('#b-baru').onclick = kosongkanForm;
  $('#b-batal-edit').onclick = kosongkanForm;
  $('#b-berikutnya').onclick = berikutnya;
  $('#b-unduh-lagi').onclick = async () => {
    if (!S.terakhir) return;
    loading(true, 'Membuat file…');
    try { await keluarkan(S.terakhir.data, S.terakhir.format); } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  function validasi(d) {
    if (!kegDipilih()) return 'Pilih kegiatan terlebih dahulu.';
    if (!d.peran) return 'Isi peran penerima.';
    if (!d.nomor) return 'Isi nomor urut sertifikat, atau atur nomor peran di tab Kegiatan.';
    if (!d.nama) return 'Isi nama penerima.';
    return null;
  }

  function perbaruiCacheSertifikat(recs) {
    if (!S.sertifikat) return;
    recs.forEach(rec => {
      const i = S.sertifikat.findIndex(s => s.id === rec.id);
      if (i >= 0) S.sertifikat[i] = rec; else S.sertifikat.unshift(rec);
    });
  }

  async function simpanSertifikat(d, force = false) {
    const k = kegDipilih();
    const salin = { ...d }; delete salin.kode;
    const r = await api('saveSertifikat', {
      force,
      data: {
        id: S.editId, nomor: d.nomor, nomor_urut: pad3(F.nomor_urut.value),
        id_kegiatan: k.id, nama_kegiatan: k.nama, nama_penerima: d.nama, peran: d.peran,
        data: { ...salin, id_kegiatan: k.id }
      }
    });
    if (!r.ok && r.kode === 'DUPLIKAT') {
      if (!confirm(r.pesan + '\n\nTetap simpan dengan nomor ini?')) return null;
      return simpanSertifikat(d, true);
    }
    if (!r.ok) throw new Error(r.pesan);
    perbaruiCacheSertifikat([r.data]);
    S.editId = r.data.id; S.kode = r.data.kode;
    return r.data;
  }

  async function keluarkan(d, jenis) {
    const cv = document.createElement('canvas');
    Sertifikat.gambarKe(cv, d);
    const ext = jenis === 'pdf' ? 'pdf' : 'jpg';
    const blob = ext === 'pdf' ? Sertifikat.kePdf(cv) : await Sertifikat.keBlobJpg(cv);
    const nama = namaFile(d, ext);
    if (jenis === 'share') {
      const file = new File([blob], nama, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Sertifikat ' + d.nama }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      toast('Perangkat ini tidak mendukung bagikan langsung. File diunduh.');
    }
    unduh(blob, nama);
  }

  function unduh(blob, nama) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  $$('[data-out]').forEach(b => (b.onclick = async () => {
    const d = dataSertifikat();
    const salah = validasi(d);
    if (salah) return toast(salah, true);
    if (!Sertifikat.ada('ttd') || !Sertifikat.ada('stempel')) {
      if (!confirm('TTD atau stempel belum diunggah, sertifikat akan tanpa tanda tangan. Lanjutkan?')) return;
    }
    $$('[data-out]').forEach(x => (x.disabled = true));
    loading(true, 'Menyimpan dan membuat file…');
    try {
      const rec = await simpanSertifikat(d);
      if (!rec) return;
      loading(false);
      d.kode = rec.kode;
      S.terakhir = { data: d, format: b.dataset.out };
      $('#edit-banner').hidden = true;
      $('#ok-nomor').textContent = rec.nomor;
      $('#ok-nama').textContent = `${rec.nama_penerima} · ${rec.peran}`;
      $('#b-unduh-lagi').textContent = b.dataset.out === 'share' ? 'Bagikan lagi' : 'Unduh lagi (' + b.dataset.out.toUpperCase() + ')';
      $('#ok-card').hidden = false;
      $('#ok-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      gambarPratinjau();
      await keluarkan(d, b.dataset.out);
    } catch (err) { toast(err.message, true); }
    finally { loading(false); $$('[data-out]').forEach(x => (x.disabled = false)); }
  }));

  function bukaUntukEdit(s) {
    const d = dataDariRec(s);
    setMode('satu');
    S.editId = s.id; S.kode = s.kode || null; S.nomorManual = true;
    if (S.kegiatan.some(k => k.id === s.id_kegiatan)) F.id_kegiatan.value = s.id_kegiatan;
    isiPilihanPeran(s.peran);
    if ([...F.peran.options].some(o => o.value === s.peran)) { F.peran.value = s.peran; $('#l-peran-lain').hidden = true; }
    else { F.peran.value = '__lain'; F.peran_lain.value = s.peran; $('#l-peran-lain').hidden = false; }
    F.nomor_urut.value = s.nomor_urut || String(s.nomor || '').split('/')[0];
    F.nama.value = s.nama_penerima;
    F.paragraf.value = d.paragraf || ''; F.tempat_tanggal.value = d.tempat_tanggal || '';
    S.teksManual = true;
    S.terakhir = null; $('#ok-card').hidden = true;
    $('#edit-banner').hidden = false; $('#edit-nomor').textContent = `${s.nomor} (${s.nama_penerima})`;
    isiNomorOtomatis();
    bukaTab('buat');
  }

  /* ============ TAB BUAT — banyak nama (Excel) ============ */
  function setMode(m) {
    S.mode = m;
    $$('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    F.hidden = m !== 'satu'; $('#bulk').hidden = m !== 'banyak';
    if (m === 'banyak') { $('#bk-kegiatan').value = F.id_kegiatan.value || $('#bk-kegiatan').value; isiPeranBulk(); }
    gambarPratinjau();
  }
  $$('[data-mode]').forEach(b => (b.onclick = () => setMode(b.dataset.mode)));

  const kegBulk = () => S.kegiatan.find(k => k.id === $('#bk-kegiatan').value);
  function isiPeranBulk() {
    const k = kegBulk();
    const lama = $('#bk-peran').value || 'Peserta';
    $('#bk-peran').innerHTML = opsiPeran(k, lama);
    $('#bk-peran').value = [...$('#bk-peran').options].some(o => o.value === lama) ? lama : $('#bk-peran').options[0].value;
  }
  $('#bk-kegiatan').onchange = () => { isiPeranBulk(); if (S.bulk) periksaBulk(); gambarPratinjau(); };
  $('#bk-peran').onchange = () => { if (S.bulk) periksaBulk(); gambarPratinjau(); };

  $('#bk-template').onclick = async () => {
    try {
      loading(true, 'Menyiapkan template…');
      await muatSkrip('vendor/xlsx.mini.min.js');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['No', 'Nama (dengan gelar)', 'Peran']]);
      ws['!cols'] = [{ wch: 5 }, { wch: 45 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Daftar Nama');
      const pt = XLSX.utils.aoa_to_sheet([
        ['Petunjuk pengisian'],
        ['1. Isi nama lengkap beserta gelar di kolom "Nama (dengan gelar)", satu orang per baris.'],
        ['2. Kolom "Peran" boleh dikosongkan; aplikasi memakai peran bawaan yang dipilih saat unggah.'],
        ['3. Jika diisi, gunakan: Peserta, Narasumber, Moderator, Panitia, Fasilitator, Juri, dll.'],
        ['4. Jangan mengubah baris judul (baris pertama).']
      ]);
      pt['!cols'] = [{ wch: 95 }];
      XLSX.utils.book_append_sheet(wb, pt, 'Petunjuk');
      XLSX.writeFile(wb, 'Template_Daftar_Nama_Sertifikat.xlsx');
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  $('#bk-file').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    loading(true, 'Membaca file…');
    try {
      await muatSkrip('vendor/xlsx.mini.min.js');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      S.bulk = { file: f.name, rows: bacaBaris(aoa), hasil: null };
      if (!S.bulk.rows.length) throw new Error('Tidak ada nama yang terbaca. Pastikan nama ada di kolom "Nama".');
      $('#bk-hasil').hidden = true;
      periksaBulk(); gambarPratinjau();
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  function bacaBaris(aoa) {
    let h = aoa.findIndex(r => r.some(c => /nama/i.test(String(c))));
    let iNama, iPeran = -1;
    if (h >= 0) {
      iNama = aoa[h].findIndex(c => /nama/i.test(String(c)));
      iPeran = aoa[h].findIndex(c => /peran|jabatan|sebagai/i.test(String(c)));
    } else {
      h = -1;
      const lebar = Math.max(...aoa.map(r => r.length));
      iNama = [...Array(lebar).keys()].find(i => aoa.some(r => /[a-z]{3,}/i.test(String(r[i] || '')))) ?? 0;
    }
    return aoa.slice(h + 1)
      .map(r => ({ nama: String(r[iNama] || '').trim().replace(/\s+/g, ' '), peranFile: iPeran >= 0 ? kanonPeran(r[iPeran]) : '' }))
      .filter(r => r.nama);
  }

  function periksaBulk() {
    const k = kegBulk();
    const bawaan = $('#bk-peran').value;
    const lihat = {};
    const arsip = {};
    (S.sertifikat || []).forEach(s => { arsip[s.id_kegiatan + '|' + s.peran + '|' + normalNama(s.nama_penerima)] = 1; });
    S.bulk.rows.forEach(r => {
      r.peran = r.peranFile || bawaan;
      r.urut = pad3(nomorUntuk(k, r.peran));
      r.nomor = nomorLengkap(r.urut, k);
      const kunci = (k ? k.id : '') + '|' + r.peran + '|' + normalNama(r.nama);
      r.err = ''; r.info = '';
      if (!r.urut) r.err = `Peran ${r.peran} belum punya nomor di kegiatan`;
      else if (lihat[kunci]) r.err = 'Nama ganda di file';
      else if (arsip[kunci]) r.info = 'Sudah ada di arsip, dilewati';
      lihat[kunci] = 1;
    });
    renderBulk();
  }

  function renderBulk() {
    const rows = S.bulk.rows;
    const salah = rows.filter(r => r.err).length;
    const ada = rows.filter(r => !r.err && r.info).length;
    const siap = rows.length - salah - ada;
    const perPeran = {};
    rows.filter(r => !r.err && !r.info).forEach(r => (perPeran[r.peran] = (perPeran[r.peran] || 0) + 1));
    $('#bk-info').innerHTML = `<b>${esc(S.bulk.file)}</b>: ${rows.length} nama terbaca · <span class="ok-txt">${siap} siap disimpan</span>` +
      (ada ? ` · ${ada} sudah ada` : '') + (salah ? ` · <span class="warn-txt">${salah} bermasalah (tidak diproses)</span>` : '') +
      (siap ? `<br><span class="muted">${Object.entries(perPeran).map(([p, n]) => `${esc(p)}: ${n}`).join(' · ')}</span>` : '');
    const tampil = rows.slice(0, 500);
    $('#bk-tabel').innerHTML = `<thead><tr><th>#</th><th>Nama</th><th>Peran</th><th>Nomor</th><th>Status</th></tr></thead><tbody>` +
      tampil.map((r, i) => `<tr class="${r.err ? 'baris-err' : r.info ? 'baris-info' : ''}"><td>${i + 1}</td><td>${esc(r.nama)}</td><td>${esc(r.peran)}</td><td>${esc(r.urut || '—')}</td><td>${esc(r.err || r.info || 'Siap')}</td></tr>`).join('') +
      (rows.length > 500 ? `<tr><td colspan="5" class="muted">… dan ${rows.length - 500} baris lainnya</td></tr>` : '') + '</tbody>';
    $('#bk-wrap').hidden = false; $('#bk-aksi').hidden = false;
    $('#bk-proses').textContent = `Simpan ${siap} sertifikat`;
    $('#bk-proses').hidden = !siap;
  }

  $('#bk-batal').onclick = () => {
    S.bulk = null; $('#bk-info').innerHTML = ''; $('#bk-wrap').hidden = true; $('#bk-aksi').hidden = true; $('#bk-hasil').hidden = true; gambarPratinjau();
  };

  function progres(i, n, teks) {
    $('#bk-progres').hidden = false;
    $('#bk-bar').style.width = Math.round(i / n * 100) + '%';
    $('#bk-progres-txt').textContent = `${teks} ${i} / ${n}`;
  }

  $('#bk-proses').onclick = async () => {
    const k = kegBulk();
    if (!k) return toast('Pilih kegiatan terlebih dahulu.', true);
    const siap = S.bulk.rows.filter(r => !r.err && !r.info);
    if (!siap.length) return;
    if (!Sertifikat.ada('ttd') || !Sertifikat.ada('stempel')) return toast('Unggah TTD dan stempel dulu di tab Pengaturan.', true);
    if (!confirm(`Simpan ${siap.length} sertifikat untuk kegiatan "${k.nama}"?`)) return;
    const dasar = dasarData(k);
    const items = siap.map(r => ({
      nomor: r.nomor, nomor_urut: r.urut, id_kegiatan: k.id, nama_kegiatan: k.nama,
      nama_penerima: r.nama, peran: r.peran,
      data: { ...dasar, nomor: r.nomor, nama: r.nama, peran: r.peran, id_kegiatan: k.id }
    }));
    $('#bk-proses').disabled = true; $('#bk-batal').disabled = true;
    const baru = [], dilewati = [];
    let force = false;
    try {
      for (let i = 0; i < items.length; i += 50) {
        progres(i, items.length, 'Menyimpan');
        let r = await api('saveSertifikatBatch', { items: items.slice(i, i + 50), force });
        if (!r.ok && r.kode === 'DUPLIKAT') {
          if (!confirm(r.pesan + '\n\nTetap simpan dengan nomor ini?')) throw new Error('Dibatalkan.');
          force = true;
          r = await api('saveSertifikatBatch', { items: items.slice(i, i + 50), force });
        }
        if (!r.ok) throw new Error(r.pesan);
        baru.push(...r.baru); dilewati.push(...r.dilewati);
      }
      progres(items.length, items.length, 'Menyimpan');
      perbaruiCacheSertifikat(baru);
      S.bulk.hasil = { keg: k, recs: [...baru, ...dilewati] };
      tampilHasilBulk(baru.length, dilewati.length);
      periksaBulk();
    } catch (err) { toast(err.message, true); }
    finally { $('#bk-proses').disabled = false; $('#bk-batal').disabled = false; setTimeout(() => ($('#bk-progres').hidden = true), 800); }
  };

  function tampilHasilBulk(nBaru, nLewat) {
    const k = S.bulk.hasil.keg;
    $('#bk-hasil-txt').innerHTML = `<b>${nBaru} sertifikat tersimpan</b>${nLewat ? ` · ${nLewat} sudah ada sebelumnya` : ''}<br><span class="muted">Kegiatan: ${esc(k.nama)}</span>`;
    renderLinkBox($('#bk-link-box'), k);
    $('#bk-hasil').hidden = false;
    $('#bk-hasil').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderLinkBox(el, k) {
    const kk = S.kegiatan.find(x => x.id === k.id) || k;
    if (kk.buka_publik === '1') {
      el.innerHTML = `<div class="muted">Link unduh untuk peserta (bagikan ke grup WA):</div>
        <div class="link-row"><input readonly value="${esc(linkPeserta(kk))}"><button type="button" class="btn sm primary" data-salin="${esc(linkPeserta(kk))}">Salin link</button></div>`;
    } else {
      el.innerHTML = `<div class="muted">Halaman unduh peserta untuk kegiatan ini masih <b>tertutup</b>.</div>
        <button type="button" class="btn sm" data-bukapublik="${esc(kk.id)}">Buka halaman unduh peserta</button>`;
    }
  }
  document.addEventListener('click', async e => {
    const s = e.target.closest('[data-salin]'); if (s) return salin(s.dataset.salin);
    const b = e.target.closest('[data-bukapublik]');
    if (b) {
      const k = S.kegiatan.find(x => x.id === b.dataset.bukapublik); if (!k) return;
      loading(true, 'Membuka halaman peserta…');
      try {
        const r = await api('saveKegiatan', { data: { ...k, buka_publik: '1' } });
        if (!r.ok) throw new Error(r.pesan);
        Object.assign(k, r.data);
        renderDaftarKegiatan();
        if (S.bulk && S.bulk.hasil) renderLinkBox($('#bk-link-box'), k);
        toast('Halaman unduh peserta dibuka.');
      } catch (err) { toast(err.message, true); } finally { loading(false); }
    }
  });

  async function buatMassal(jenis) {
    const recs = S.bulk && S.bulk.hasil && S.bulk.hasil.recs;
    if (!recs || !recs.length) return;
    if (jenis === 'pdf' && recs.length > 200 && !confirm(`PDF gabungan ${recs.length} halaman bisa berukuran besar (±${Math.round(recs.length * 0.18)} MB). Lanjutkan?`)) return;
    const k = S.bulk.hasil.keg;
    const cv = document.createElement('canvas');
    $('#bk-zip').disabled = $('#bk-pdf').disabled = true;
    try {
      if (jenis === 'zip') {
        await muatSkrip('vendor/jszip.min.js');
        const zip = new JSZip(), dipakai = {};
        for (let i = 0; i < recs.length; i++) {
          progres(i, recs.length, 'Membuat file');
          const d = dataDariRec(recs[i]);
          Sertifikat.gambarKe(cv, d);
          let nm = `${bersihNamaFile(d.nama)}_${bersihNamaFile(d.peran)}`;
          if (dipakai[nm]) nm += '_' + (++dipakai[nm]); else dipakai[nm] = 1;
          zip.file(nm + '.jpg', await Sertifikat.keBlobJpg(cv, { skala: 0.7, mutu: 0.85 }));
          if (i % 3 === 0) await jeda();
        }
        progres(recs.length, recs.length, 'Mengemas ZIP');
        unduh(await zip.generateAsync({ type: 'blob' }), `Sertifikat_${bersihNamaFile(k.nama)}.zip`);
      } else {
        const pdf = Sertifikat.pdfGabungan();
        for (let i = 0; i < recs.length; i++) {
          progres(i, recs.length, 'Membuat halaman');
          Sertifikat.gambarKe(cv, dataDariRec(recs[i]));
          pdf.tambah(cv);
          if (i % 3 === 0) await jeda();
        }
        unduh(pdf.selesai(), `Sertifikat_${bersihNamaFile(k.nama)}.pdf`);
      }
    } catch (err) { toast(err.message, true); }
    finally { $('#bk-zip').disabled = $('#bk-pdf').disabled = false; setTimeout(() => ($('#bk-progres').hidden = true), 800); }
  }
  $('#bk-zip').onclick = () => buatMassal('zip');
  $('#bk-pdf').onclick = () => buatMassal('pdf');

  /* ============ TAB RIWAYAT ============ */
  async function muatRiwayat() {
    $('#riwayat-info').textContent = 'Memuat…';
    try {
      const r = await api('listSertifikat');
      if (!r.ok) throw new Error(r.pesan);
      S.sertifikat = (r.data || []).reverse();
      renderRiwayat(); renderDaftarKegiatan(); gambarPratinjau();
      if (S.bulk) periksaBulk();
    } catch (err) { $('#riwayat-info').textContent = err.message; }
  }
  $('#b-muat-riwayat').onclick = muatRiwayat;
  $('#q').oninput = renderRiwayat;
  $('#f-keg').onchange = renderRiwayat;

  function hasilRiwayat() {
    const q = $('#q').value.toLowerCase().trim();
    const fk = $('#f-keg').value;
    return S.sertifikat.filter(s =>
      (!fk || s.id_kegiatan === fk) &&
      (!q || [s.nomor, s.nama_penerima, s.nama_kegiatan, s.peran, s.kode].join(' ').toLowerCase().includes(q)));
  }

  function renderPilih(hasil) {
    hasil = hasil || hasilRiwayat();
    const ids = new Set(S.sertifikat.map(s => s.id));
    [...S.pilih].forEach(id => { if (!ids.has(id)) S.pilih.delete(id); });
    const nTampil = hasil.filter(s => S.pilih.has(s.id)).length;
    const cs = $('#c-pilih-semua');
    cs.checked = hasil.length > 0 && nTampil === hasil.length;
    cs.indeterminate = nTampil > 0 && nTampil < hasil.length;
    $('#pilih-semua-txt').textContent = hasil.length ? `Pilih semua (${hasil.length})` : 'Pilih semua';
    const b = $('#b-hapus-pilih');
    b.hidden = !S.pilih.size;
    b.textContent = `Hapus yang dipilih (${S.pilih.size})`;
  }

  function renderRiwayat() {
    if (!S.sertifikat) return;
    const hasil = hasilRiwayat();
    $('#riwayat-info').textContent = `${hasil.length} dari ${S.sertifikat.length} sertifikat`;
    const tampil = hasil.slice(0, 300);
    $('#list-riwayat').innerHTML = tampil.length ? tampil.map(s => `
      <div class="item${S.pilih.has(s.id) ? ' dipilih' : ''}" data-id="${esc(s.id)}">
        <input type="checkbox" class="cek" ${S.pilih.has(s.id) ? 'checked' : ''} aria-label="Pilih ${esc(s.nama_penerima)}">
        <div class="item-main">
          <b>${esc(s.nama_penerima)}<span class="pill">${esc(s.peran)}</span></b>
          <div class="item-sub">${esc(s.nomor)} · ${esc(s.nama_kegiatan)}</div>
          <div class="item-sub">oleh ${esc(s.diubah_oleh || s.dibuat_oleh)} · ${esc((s.diubah_pada || s.dibuat_pada || '').slice(0, 16))}${s.kode ? ' · QR ' + esc(s.kode) : ''}</div>
        </div>
        <div class="item-act">
          <button class="btn sm" data-r="jpg">JPG</button>
          <button class="btn sm" data-r="pdf">PDF</button>
          <button class="btn sm" data-r="edit">Buka</button>
          <button class="btn sm ghost danger" data-r="hapus" title="Hapus">Hapus</button>
        </div>
      </div>`).join('') + (hasil.length > 300 ? `<p class="kosong">Menampilkan 300 teratas dari ${hasil.length}. "Pilih semua" tetap mencakup seluruh ${hasil.length} hasil.</p>` : '')
      : '<p class="kosong">Belum ada sertifikat.</p>';
    renderPilih(hasil);
  }

  $('#c-pilih-semua').onchange = e => {
    const hasil = hasilRiwayat();
    hasil.forEach(s => (e.target.checked ? S.pilih.add(s.id) : S.pilih.delete(s.id)));
    renderRiwayat();
  };

  $('#list-riwayat').addEventListener('change', e => {
    if (!e.target.classList.contains('cek')) return;
    const item = e.target.closest('.item');
    if (e.target.checked) S.pilih.add(item.dataset.id); else S.pilih.delete(item.dataset.id);
    item.classList.toggle('dipilih', e.target.checked);
    renderPilih();
  });

  async function hapusId(ids) {
    const r = await api('deleteSertifikatBatch', { ids });
    if (!r.ok) throw new Error(r.pesan);
    const set = new Set(ids);
    S.sertifikat = S.sertifikat.filter(x => !set.has(x.id));
    ids.forEach(id => S.pilih.delete(id));
    return r.terhapus;
  }

  $('#b-hapus-pilih').onclick = async () => {
    const ids = [...S.pilih];
    if (!ids.length) return;
    const contoh = S.sertifikat.filter(s => S.pilih.has(s.id)).slice(0, 5).map(s => `• ${s.nama_penerima} (${s.peran})`).join('\n');
    const pesan = `Hapus ${ids.length} arsip sertifikat?\n\n${contoh}${ids.length > 5 ? `\n… dan ${ids.length - 5} lainnya` : ''}\n\nQR pada sertifikat ini tidak akan terverifikasi lagi dan peserta tidak bisa mengunduhnya.`;
    if (!confirm(pesan)) return;
    if (ids.length > 20 && (prompt(`Untuk menghapus ${ids.length} sertifikat, ketik HAPUS`) || '').trim().toUpperCase() !== 'HAPUS') return toast('Penghapusan dibatalkan.');
    loading(true, `Menghapus ${ids.length} sertifikat…`);
    try {
      const n = await hapusId(ids);
      renderRiwayat(); if (S.bulk) periksaBulk();
      toast(`${n} arsip dihapus`);
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  $('#list-riwayat').addEventListener('click', async e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const s = S.sertifikat.find(x => x.id === b.closest('.item').dataset.id); if (!s) return;
    if (b.dataset.r === 'edit') return bukaUntukEdit(s);
    if (b.dataset.r === 'hapus') {
      if (!confirm(`Hapus arsip sertifikat ${s.nomor} (${s.nama_penerima})?\nQR pada sertifikat ini tidak akan terverifikasi lagi.`)) return;
      loading(true, 'Menghapus…');
      try {
        const r = await api('deleteSertifikat', { id: s.id });
        if (!r.ok) throw new Error(r.pesan);
        S.sertifikat = S.sertifikat.filter(x => x.id !== s.id); S.pilih.delete(s.id); renderRiwayat(); toast('Arsip dihapus');
      } catch (err) { toast(err.message, true); } finally { loading(false); }
      return;
    }
    loading(true, 'Membuat file…');
    try { await keluarkan(dataDariRec(s), b.dataset.r); } catch (err) { toast(err.message, true); } finally { loading(false); }
  });

  /* ============ TAB KEGIATAN ============ */
  const FK = $('#f-keg-form');

  const kegForm = () => ({ tgl_mulai: FK.tgl_mulai.value, tgl_selesai: FK.tgl_selesai.value, tgl_terbit: FK.tgl_terbit.value });

  function renderNp() {
    const k = kegForm();
    $('#np-list').innerHTML = S.np.map((r, i) => `
      <div class="np-row">
        <span class="np-peran">${esc(r.peran)}</span>
        <input data-np="${i}" inputmode="numeric" placeholder="contoh: 46" value="${esc(r.urut)}" aria-label="Nomor urut ${esc(r.peran)}">
        <span class="np-jadi">${esc(nomorLengkap(r.urut, k) || (tanggalNomor(k) ? '' : 'isi tanggal kegiatan'))}</span>
        <button type="button" class="np-x" data-npx="${i}" title="Hapus peran" aria-label="Hapus ${esc(r.peran)}">×</button>
      </div>`).join('') || '<p class="hint">Belum ada peran. Tambahkan lewat pilihan di bawah.</p>';
    const ada = S.np.map(r => r.peran);
    $('#np-tambah').innerHTML = '<option value="">＋ Tambah peran…</option>' +
      PERAN_STANDAR.filter(p => !ada.includes(p)).map(p => `<option>${esc(p)}</option>`).join('') + '<option value="__lain">Lainnya…</option>';
    cekNp();
  }

  function maksNomorTahun(tahun, kecualiId) {
    let maks = 0;
    S.kegiatan.forEach(k => {
      if (k.id === kecualiId || tanggalNomor(k).slice(0, 4) !== tahun) return;
      Object.values(nomorPeran(k)).forEach(v => (maks = Math.max(maks, parseInt(v, 10) || 0)));
    });
    (S.sertifikat || []).forEach(s => {
      if (s.id_kegiatan === kecualiId || tahunNomor(s.nomor) !== tahun) return;
      maks = Math.max(maks, parseInt(s.nomor_urut || String(s.nomor).split('/')[0], 10) || 0);
    });
    return maks;
  }

  function cekNp() {
    const info = $('#np-info');
    const tahun = tanggalNomor(kegForm()).slice(0, 4);
    const pesan = [];
    const urutan = S.np.filter(r => r.urut).map(r => pad3(r.urut));
    const ganda = urutan.filter((u, i) => urutan.indexOf(u) !== i);
    if (ganda.length) pesan.push(`<span class="warn-txt">Nomor ${[...new Set(ganda)].join(', ')} dipakai lebih dari satu peran.</span>`);
    if (tahun) {
      const k = { id: FK.id.value, ...kegForm() };
      S.np.forEach(r => {
        const n = nomorLengkap(r.urut, k);
        const dipakai = n && pemakaiNomorKegiatan(n, k.id);
        if (dipakai) pesan.push(`<span class="warn-txt">${esc(n)} sudah dipakai untuk ${esc(dipakai)}.</span>`);
      });
      const maks = maksNomorTahun(tahun, FK.id.value);
      pesan.push(maks ? `Nomor urut terbesar yang sudah dipakai tahun ${tahun}: <b>${pad3(maks)}</b>.` : `Belum ada nomor terpakai di tahun ${tahun}.`);
    }
    info.innerHTML = pesan.join('<br>');
    return !ganda.length;
  }
  function pemakaiNomorKegiatan(nomor, idKeg) {
    for (const k of S.kegiatan) {
      if (k.id === idKeg) continue;
      const np = nomorPeran(k);
      for (const p of Object.keys(np)) if (np[p] && nomorLengkap(np[p], k) === nomor) return `peran ${p} pada kegiatan ${k.nama}`;
    }
    const s = (S.sertifikat || []).find(x => x.nomor === nomor && x.id_kegiatan !== idKeg);
    return s ? `peran ${s.peran} pada kegiatan ${s.nama_kegiatan}` : null;
  }

  $('#np-list').addEventListener('input', e => {
    const i = e.target.dataset.np; if (i === undefined) return;
    S.np[i].urut = e.target.value.replace(/\D/g, '');
    e.target.nextElementSibling.textContent = nomorLengkap(S.np[i].urut, kegForm());
    cekNp();
  });
  $('#np-list').addEventListener('click', e => {
    const x = e.target.closest('[data-npx]'); if (!x) return;
    S.np.splice(+x.dataset.npx, 1); renderNp();
  });
  $('#np-tambah').onchange = e => {
    let p = e.target.value; if (!p) return;
    if (p === '__lain') { p = kanonPeran(prompt('Nama peran:') || ''); if (!p) { e.target.value = ''; return; } }
    if (!S.np.some(r => r.peran === p)) S.np.push({ peran: p, urut: '' });
    renderNp();
  };
  $('#np-otomatis').onclick = () => {
    const tahun = tanggalNomor(kegForm()).slice(0, 4);
    if (!tahun) return toast('Isi tanggal kegiatan dulu.', true);
    let n = Math.max(maksNomorTahun(tahun, FK.id.value), ...S.np.map(r => parseInt(r.urut, 10) || 0));
    S.np.forEach(r => { if (!r.urut) r.urut = pad3(++n); });
    renderNp();
  };

  function resetKegiatanForm() {
    FK.reset(); FK.id.value = '';
    FK.kota.value = S.pengaturan.kota_default || '';
    FK.paragraf.value = S.pengaturan.paragraf_default || '';
    S.np = PERAN_AWAL.map(p => ({ peran: p, urut: '' }));
    $('#keg-judul').textContent = 'Tambah kegiatan';
    renderNp(); contohParagraf();
  }
  $('#b-keg-baru').onclick = resetKegiatanForm;

  function dataKegiatanForm() {
    const o = Object.fromEntries(new FormData(FK).entries());
    o.tgl_selesai = o.tgl_selesai || o.tgl_mulai;
    o.tgl_terbit = o.tgl_terbit || o.tgl_selesai;
    o.buka_publik = FK.buka_publik.checked ? '1' : '';
    const np = {};
    S.np.forEach(r => { if (r.urut) np[r.peran] = pad3(r.urut); });
    o.nomor_peran = JSON.stringify(np);
    return o;
  }
  function contohParagraf() {
    const k = dataKegiatanForm();
    $('#o-paragraf').textContent = isiParagraf(k.paragraf, k) + '\n' + tempatTanggal(k);
  }
  FK.addEventListener('input', e => {
    if (e.target.dataset.np !== undefined) return;
    contohParagraf();
    if (['tgl_mulai', 'tgl_selesai', 'tgl_terbit'].includes(e.target.name)) renderNp();
  });

  FK.onsubmit = async e => {
    e.preventDefault();
    const d = dataKegiatanForm();
    if (d.tgl_selesai < d.tgl_mulai) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai.', true);
    if (!cekNp()) return toast('Ada nomor yang dipakai lebih dari satu peran. Perbaiki dulu.', true);
    if ($('#np-info .warn-txt') && !confirm('Ada nomor yang sudah dipakai kegiatan lain. Tetap simpan?')) return;
    if (d.nomor_peran === '{}' && !confirm('Belum ada nomor sertifikat untuk peran apa pun. Tetap simpan?')) return;
    const lamaK = S.kegiatan.find(k => k.id === d.id);
    if (lamaK) d.latar_id = lamaK.latar_id;
    loading(true, 'Menyimpan kegiatan…');
    try {
      const r = await api('saveKegiatan', { data: d });
      if (!r.ok) throw new Error(r.pesan);
      const i = S.kegiatan.findIndex(k => k.id === r.data.id);
      if (i >= 0) S.kegiatan[i] = { ...S.kegiatan[i], ...r.data }; else S.kegiatan.push(r.data);
      isiPilihanKegiatan(); renderDaftarKegiatan(); resetKegiatanForm();
      if (i < 0) {
        F.id_kegiatan.value = r.data.id; $('#bk-kegiatan').value = r.data.id;
        kosongkanForm(); setMode('satu'); bukaTab('buat'); F.nama.focus();
        toast('Kegiatan tersimpan. Lanjut isi data penerima, atau pilih "Banyak nama (Excel)".');
      } else {
        if (F.id_kegiatan.value === r.data.id) {
          isiPilihanPeran(); if (!S.teksManual) isiTeksBawaan(); if (!S.nomorManual) isiNomorOtomatis(); gambarPratinjau();
        }
        isiPeranBulk(); if (S.bulk) periksaBulk();
        toast('Perubahan kegiatan disimpan');
        await sinkronNomor(S.kegiatan.find(k => k.id === r.data.id), true);
      }
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  // sertifikat lama yang nomornya tidak sesuai pengaturan kegiatan sekarang
  function nomorBeda(keg) {
    if (!keg || !S.sertifikat) return [];
    const np = nomorPeran(keg);
    return S.sertifikat.filter(s => s.id_kegiatan === keg.id).map(s => {
      const urut = pad3(np[s.peran] || s.nomor_urut || String(s.nomor || '').split('/')[0]);
      const nomor = nomorLengkap(urut, keg);
      return nomor && nomor !== s.nomor ? { id: s.id, nomor, nomor_urut: urut, lama: s.nomor } : null;
    }).filter(Boolean);
  }

  async function sinkronNomor(keg, tanya) {
    const ubah = nomorBeda(keg);
    if (!ubah.length) return;
    const contoh = [...new Set(ubah.map(u => `${u.lama} → ${u.nomor}`))].slice(0, 4).join('\n');
    if (tanya && !confirm(`${ubah.length} sertifikat kegiatan ini nomornya belum sesuai:\n\n${contoh}\n\nPerbarui nomornya sekarang? Kode QR tetap sama; peserta cukup mengunduh ulang.`)) return;
    loading(true, `Memperbarui nomor ${ubah.length} sertifikat…`);
    try {
      const r = await api('perbaruiNomor', { ubah });
      if (!r.ok) throw new Error(r.pesan);
      const peta = {};
      ubah.forEach(u => (peta[u.id] = u));
      S.sertifikat.forEach(s => {
        const u = peta[s.id]; if (!u) return;
        s.nomor = u.nomor; s.nomor_urut = u.nomor_urut;
        try { const d = JSON.parse(s.data_json || '{}'); d.nomor = u.nomor; s.data_json = JSON.stringify(d); } catch (e) {}
      });
      renderDaftarKegiatan(); renderRiwayat();
      toast(`Nomor ${r.diperbarui} sertifikat diperbarui`);
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  }

  function renderDaftarKegiatan() {
    const urut = kegiatanUrut();
    $('#list-kegiatan').innerHTML = urut.length ? urut.map(k => {
      const np = nomorPeran(k);
      const daftarNo = Object.keys(np).filter(p => np[p]).map(p => `${esc(p)} ${esc(pad3(np[p]))}`).join(' · ');
      const buka = k.buka_publik === '1';
      return `
      <div class="item" data-id="${esc(k.id)}">
        <div class="item-main">
          <b>${esc(k.nama)}${buka ? '<span class="pill ok">Link peserta dibuka</span>' : ''}</b>
          <div class="item-sub">${esc(rentang(k.tgl_mulai, k.tgl_selesai))} · ${esc(k.moda)}${k.jpl ? ' · ' + esc(k.jpl) + ' JPL' : ''}${k.kota ? ' · ' + esc(k.kota) : ''}</div>
          <div class="item-sub">${daftarNo ? 'Nomor: ' + daftarNo : '<span class="warn-txt">Nomor per peran belum diatur</span>'}</div>
          ${nomorBeda(k).length ? `<div class="item-sub warn-txt">${nomorBeda(k).length} sertifikat memakai nomor lama</div>` : ''}
        </div>
        <div class="item-act">
          <button class="btn sm primary" data-k="pakai">Buat sertifikat</button>
          ${buka ? `<button class="btn sm" data-salin="${esc(linkPeserta(k))}">Salin link peserta</button>` : ''}
          ${nomorBeda(k).length ? '<button class="btn sm" data-k="nomor">Perbarui nomor</button>' : ''}
          <button class="btn sm" data-k="edit">Edit</button>
          <button class="btn sm ghost danger" data-k="hapus">Hapus</button>
        </div>
      </div>`;
    }).join('') : '<p class="kosong">Belum ada kegiatan.</p>';
  }

  $('#list-kegiatan').addEventListener('click', async e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = S.kegiatan.find(x => x.id === b.closest('.item').dataset.id); if (!k) return;
    if (b.dataset.k === 'pakai') {
      F.id_kegiatan.value = k.id; $('#bk-kegiatan').value = k.id;
      kosongkanForm(); setMode('satu'); bukaTab('buat'); return;
    }
    if (b.dataset.k === 'nomor') return sinkronNomor(k, true);
    if (b.dataset.k === 'edit') {
      ['id', 'nama', 'tgl_mulai', 'tgl_selesai', 'moda', 'jpl', 'kota', 'tgl_terbit', 'paragraf'].forEach(n => (FK[n].value = k[n] || ''));
      FK.buka_publik.checked = k.buka_publik === '1';
      if (!FK.paragraf.value) FK.paragraf.value = S.pengaturan.paragraf_default || '';
      const np = nomorPeran(k);
      S.np = Object.keys(np).length ? Object.keys(np).map(p => ({ peran: p, urut: np[p] })) : PERAN_AWAL.map(p => ({ peran: p, urut: '' }));
      $('#keg-judul').textContent = 'Edit kegiatan'; renderNp(); contohParagraf(); window.scrollTo(0, 0); FK.nama.focus();
      return;
    }
    if (b.dataset.k === 'hapus') {
      if (!confirm(`Hapus kegiatan "${k.nama}"?\nArsip sertifikat yang sudah dibuat tetap tersimpan, tetapi link peserta tidak berfungsi lagi.`)) return;
      loading(true, 'Menghapus…');
      try {
        const r = await api('deleteKegiatan', { id: k.id });
        if (!r.ok) throw new Error(r.pesan);
        S.kegiatan = S.kegiatan.filter(x => x.id !== k.id);
        isiPilihanKegiatan(); renderDaftarKegiatan(); isiPilihanPeran(); isiTeksBawaan(); isiNomorOtomatis(); gambarPratinjau(); toast('Kegiatan dihapus');
      } catch (err) { toast(err.message, true); } finally { loading(false); }
    }
  });

  /* ============ TAB PENGATURAN ============ */
  const FP = $('#f-peng');
  function isiFormPengaturan() {
    [...FP.elements].forEach(el => { if (el.name) el.value = S.pengaturan[el.name] || ''; });
  }
  FP.onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(FP).entries());
    const ttdBerubah = ['ttd_jabatan_1', 'ttd_jabatan_2', 'ttd_nama'].some(k => (S.pengaturan[k] || '') !== data[k]);
    loading(true, 'Menyimpan pengaturan…');
    try {
      const r = await api('savePengaturan', { data });
      if (!r.ok) throw new Error(r.pesan);
      S.pengaturan = { ...S.pengaturan, ...r.pengaturan };
      toast('Pengaturan disimpan'); gambarPratinjau();
      if (ttdBerubah) await perbaruiLatar(true);
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  function infoLatar() {
    $('#latar-info').textContent = S.pengaturan.latar_file_id ? 'Status: latar sudah tersedia.' : 'Status: latar belum dibuat. Unggah TTD dan stempel terlebih dahulu.';
  }
  async function perbaruiLatar(diam = false) {
    if (!Sertifikat.ada('ttd') || !Sertifikat.ada('stempel')) { if (!diam) toast('Unggah TTD dan stempel terlebih dahulu.', true); return; }
    try {
      const dataUrl = Sertifikat.buatLatar(S.pengaturan);
      const r = await api('uploadLatar', { dataUrl });
      if (!r.ok) throw new Error(r.pesan);
      S.pengaturan.latar_file_id = r.id;
      S.kegiatan.forEach(k => { if (!k.latar_id) k.latar_id = r.id; });
      infoLatar();
      if (!diam) toast('Latar halaman peserta diperbarui');
    } catch (err) { toast('Gagal memperbarui latar: ' + err.message, true); }
  }
  $('#b-latar').onclick = async () => { loading(true, 'Membuat latar…'); try { await perbaruiLatar(); } finally { loading(false); } };

  function kecilkanGambar(file, maks = 900) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const sk = Math.min(1, maks / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * sk); c.height = Math.round(img.height * sk);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/png'));
        };
        img.onerror = () => rej(new Error('File bukan gambar yang valid.'));
        img.src = fr.result;
      };
      fr.onerror = () => rej(new Error('Gagal membaca file.'));
      fr.readAsDataURL(file);
    });
  }
  $$('input[data-aset]').forEach(inp => (inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const jenis = inp.dataset.aset;
    loading(true, 'Mengunggah…');
    try {
      const dataUrl = await kecilkanGambar(f);
      const r = await api('uploadAset', { jenis, dataUrl });
      if (!r.ok) throw new Error(r.pesan);
      await Sertifikat.setAset(jenis, dataUrl);
      $('#img-' + jenis).src = dataUrl;
      const c = JSON.parse(LS.get('eserti_cache') || 'null');
      if (c) { c.aset = c.aset || {}; c.aset[jenis] = dataUrl; LS.set('eserti_cache', JSON.stringify(c)); }
      cekAset(); gambarPratinjau(); toast((jenis === 'ttd' ? 'TTD' : 'Stempel') + ' diperbarui');
      await perbaruiLatar(true);
    } catch (err) { toast(err.message, true); } finally { loading(false); inp.value = ''; }
  }));

  $('#f-pw').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    loading(true, 'Mengganti password…');
    try {
      const r = await api('gantiPassword', { lama: f.lama.value, baru: f.baru.value });
      if (!r.ok) throw new Error(r.pesan);
      f.reset(); toast('Password diganti');
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  $('#b-sinkron').onclick = async () => {
    loading(true, 'Memuat ulang…');
    try { await muatData(); S.sertifikat = null; isiSemua(); muatRiwayat(); toast('Data diperbarui'); }
    catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  /* ---------------- start ---------------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (S.token && S.api) mulai(); else tampilLogin();

  window.__eserti = { S, rentang, nomorLengkap, isiParagraf };
})();
