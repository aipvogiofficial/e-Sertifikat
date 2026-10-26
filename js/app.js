/* =========================================================
 * e-Serti AIPVOGI — logika aplikasi
 * ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const LS = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} }
  };

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  // URL server dari config.js bersifat tetap; kolom "Pengaturan server" disembunyikan
  const API_TETAP = ((window.ESERTI_CONFIG && window.ESERTI_CONFIG.API_URL) || '').trim();

  const S = {
    api: API_TETAP || LS.get('eserti_api') || '',
    token: LS.get('eserti_token'),
    user: JSON.parse(LS.get('eserti_user') || 'null'),
    kegiatan: [], pengaturan: {}, sertifikat: null,
    editId: null, teksManual: false, terakhir: null
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
  function nomorLengkap(urut, keg) {
    const n = String(urut || '').replace(/\D/g, '');
    if (!n || !keg || !keg.tgl_mulai) return '';
    const [y, m] = keg.tgl_mulai.split('-').map(Number);
    return `${n.padStart(3, '0')}/${S.pengaturan.kode_nomor || 'AIPVOGI/Sek'}/${ROMAWI[m - 1]}/${y}`;
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
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const namaFile = (d, ext) => `Sertifikat_${(d.nomor || '').split('/')[0]}_${(d.nama || 'penerima').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 50)}.${ext}`;

  let toastT;
  function toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 3500);
  }
  function loading(on, txt = 'Memproses…') { $('#loading').hidden = !on; $('#loading-txt').textContent = txt; }

  /* ---------------- API ---------------- */
  async function api(aksi, payload = {}) {
    const body = { aksi, token: S.token, ...payload };
    let res;
    if (demo()) res = await DemoApi.panggil(aksi, body);
    else {
      if (!S.api) throw new Error('URL server belum diisi. Buka "Pengaturan server" di layar login.');
      let r;
      try {
        r = await fetch(S.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      } catch (e) {
        throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');
      }
      try { res = await r.json(); } catch (e) { throw new Error('Balasan server tidak valid. Pastikan URL Apps Script benar dan sudah di-deploy untuk "Siapa saja".'); }
    }
    if (res && res.kode === 'SESI') { keluar(true); throw new Error(res.pesan); }
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
    } catch (err) {
      $('#login-err').textContent = err.message;
    } finally { loading(false); }
  };

  function keluar(sesiHabis = false) {
    if (!sesiHabis && S.token) api('logout').catch(() => {});
    S.token = null; S.user = null; S.sertifikat = null;
    ['eserti_token', 'eserti_user', 'eserti_cache'].forEach(LS.del);
    Sertifikat.setAset('ttd', null); Sertifikat.setAset('stempel', null);
    tampilLogin();
  }
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
      muatRiwayat(); // di latar belakang, untuk cek nomor ganda
    } catch (err) {
      toast(err.message, true);
    } finally { loading(false); }
  }

  function isiSemua() {
    isiPilihanKegiatan(); renderDaftarKegiatan(); isiFormPengaturan();
    resetKegiatanForm(); cekAset(); isiTeksBawaan(); gambarPratinjau();
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

  /* ============ TAB BUAT ============ */
  const F = $('#f-sert');
  const kegDipilih = () => S.kegiatan.find(k => k.id === F.id_kegiatan.value);
  const peranDipilih = () => F.peran.value === '__lain' ? F.peran_lain.value.trim() : F.peran.value;

  function isiPilihanKegiatan() {
    const urut = [...S.kegiatan].sort((a, b) => (b.tgl_mulai || '').localeCompare(a.tgl_mulai || ''));
    const lama = F.id_kegiatan.value;
    F.id_kegiatan.innerHTML = urut.map(k => `<option value="${esc(k.id)}">${esc(k.nama)} — ${esc(rentang(k.tgl_mulai, k.tgl_selesai))}</option>`).join('');
    if (lama && urut.some(k => k.id === lama)) F.id_kegiatan.value = lama;
    $('#kegiatan-kosong').hidden = urut.length > 0;
    $('#f-keg').innerHTML = '<option value="">Semua kegiatan</option>' + urut.map(k => `<option value="${esc(k.id)}">${esc(k.nama)}</option>`).join('');
  }

  function isiTeksBawaan() {
    const k = kegDipilih();
    if (!k) { F.paragraf.value = ''; F.tempat_tanggal.value = ''; return; }
    F.paragraf.value = isiParagraf(k.paragraf || S.pengaturan.paragraf_default, k);
    F.tempat_tanggal.value = tempatTanggal(k);
    S.teksManual = false;
  }

  function cekAset() { $('#aset-warn').hidden = Sertifikat.ada('ttd') && Sertifikat.ada('stempel'); }

  function dataSertifikat() {
    const k = kegDipilih() || {};
    const p = S.pengaturan;
    return {
      nomor: nomorLengkap(F.nomor_urut.value, k),
      nama: F.nama.value.trim(),
      peran: peranDipilih(),
      paragraf: F.paragraf.value,
      tempat_tanggal: F.tempat_tanggal.value,
      label_diberikan: p.label_diberikan, label_sebagai: p.label_sebagai,
      ttd_jabatan_1: p.ttd_jabatan_1, ttd_jabatan_2: p.ttd_jabatan_2, ttd_nama: p.ttd_nama
    };
  }

  let rafId;
  function gambarPratinjau() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const d = dataSertifikat();
      $('#o-nomor').textContent = d.nomor || '—';
      cekNomorGanda(d.nomor);
      try { Sertifikat.gambarKe($('#cv'), d, { areaAman: $('#c-aman').checked }); } catch (e) { /* aset belum siap */ }
    });
  }

  function cekNomorGanda(nomor) {
    const w = $('#nomor-warn');
    if (!nomor || !S.sertifikat) { w.textContent = ''; return; }
    const b = S.sertifikat.find(s => s.nomor === nomor && s.id !== S.editId);
    w.textContent = b ? `Nomor ini sudah dipakai: ${b.nama_penerima} (${b.nama_kegiatan})` : '';
  }

  F.addEventListener('input', e => {
    if (e.target.name === 'paragraf' || e.target.name === 'tempat_tanggal') S.teksManual = true;
    gambarPratinjau();
  });
  F.id_kegiatan.addEventListener('change', () => { isiTeksBawaan(); gambarPratinjau(); });
  F.peran.addEventListener('change', () => { $('#l-peran-lain').hidden = F.peran.value !== '__lain'; gambarPratinjau(); });
  $('#c-aman').onchange = gambarPratinjau;
  $('#b-reset-teks').onclick = () => { isiTeksBawaan(); gambarPratinjau(); };

  function sembunyikanStatus() { $('#ok-card').hidden = true; $('#edit-banner').hidden = true; }

  function kosongkanForm() {
    S.editId = null; S.terakhir = null;
    F.nomor_urut.value = ''; F.nama.value = ''; F.peran.value = 'Narasumber'; F.peran_lain.value = '';
    $('#l-peran-lain').hidden = true; sembunyikanStatus();
    isiTeksBawaan(); infoNomorTerakhir(); gambarPratinjau();
  }

  // sertifikat berikutnya: kegiatan & peran tetap, nomor +1, nama dikosongkan
  function berikutnya() {
    const urut = parseInt(String(F.nomor_urut.value).replace(/\D/g, ''), 10);
    S.editId = null; S.terakhir = null;
    F.nomor_urut.value = isNaN(urut) ? '' : String(urut + 1).padStart(3, '0');
    F.nama.value = '';
    sembunyikanStatus(); isiTeksBawaan(); infoNomorTerakhir(); gambarPratinjau();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    F.nama.focus();
  }

  function infoNomorTerakhir() {
    const el = $('#nomor-terakhir');
    if (!S.sertifikat || !S.sertifikat.length) { el.hidden = true; return; }
    const maks = Math.max(...S.sertifikat.map(s => parseInt(s.nomor_urut || String(s.nomor).split('/')[0], 10) || 0));
    el.textContent = `Nomor urut terakhir yang dipakai: ${String(maks).padStart(3, '0')}`;
    el.hidden = false;
  }

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
    if (!d.nomor) return 'Isi nomor urut sertifikat.';
    if (!d.nama) return 'Isi nama penerima.';
    if (!d.peran) return 'Isi peran penerima.';
    return null;
  }

  async function simpanSertifikat(d, force = false) {
    const k = kegDipilih();
    const r = await api('saveSertifikat', {
      force,
      data: {
        id: S.editId, nomor: d.nomor, nomor_urut: String(F.nomor_urut.value).replace(/\D/g, ''),
        id_kegiatan: k.id, nama_kegiatan: k.nama, nama_penerima: d.nama, peran: d.peran,
        data: { ...d, id_kegiatan: k.id }
      }
    });
    if (!r.ok && r.kode === 'DUPLIKAT') {
      if (!confirm(r.pesan + '\n\nTetap simpan dengan nomor yang sama?')) return null;
      return simpanSertifikat(d, true);
    }
    if (!r.ok) throw new Error(r.pesan);
    if (S.sertifikat) {
      const i = S.sertifikat.findIndex(s => s.id === r.data.id);
      if (i >= 0) S.sertifikat[i] = r.data; else S.sertifikat.unshift(r.data);
    }
    S.editId = r.data.id;
    infoNomorTerakhir();
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
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
      // pakai teks sertifikat yang baru tersimpan agar nama file sesuai
      // bila jenis 'share', jalankan setelah loading ditutup agar dialog bagikan tidak terhalang
      loading(false);
      S.terakhir = { data: d, format: b.dataset.out };
      $('#edit-banner').hidden = true;
      $('#ok-nomor').textContent = rec.nomor;
      $('#ok-nama').textContent = `${rec.nama_penerima} · ${rec.peran}`;
      $('#b-unduh-lagi').textContent = b.dataset.out === 'share' ? 'Bagikan lagi' : 'Unduh lagi (' + b.dataset.out.toUpperCase() + ')';
      $('#ok-card').hidden = false;
      $('#ok-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      await keluarkan(d, b.dataset.out);
    } catch (err) { toast(err.message, true); }
    finally { loading(false); $$('[data-out]').forEach(x => (x.disabled = false)); }
  }));

  function bukaUntukEdit(s) {
    let d = {};
    try { d = JSON.parse(s.data_json || '{}'); } catch (e) {}
    S.editId = s.id;
    if (S.kegiatan.some(k => k.id === s.id_kegiatan)) F.id_kegiatan.value = s.id_kegiatan;
    F.nomor_urut.value = s.nomor_urut || String(s.nomor || '').split('/')[0];
    F.nama.value = s.nama_penerima;
    const opsi = [...F.peran.options].map(o => o.value);
    if (opsi.includes(s.peran)) { F.peran.value = s.peran; $('#l-peran-lain').hidden = true; }
    else { F.peran.value = '__lain'; F.peran_lain.value = s.peran; $('#l-peran-lain').hidden = false; }
    F.paragraf.value = d.paragraf || ''; F.tempat_tanggal.value = d.tempat_tanggal || '';
    S.teksManual = true;
    S.terakhir = null; $('#ok-card').hidden = true;
    $('#edit-banner').hidden = false; $('#edit-nomor').textContent = s.nomor;
    bukaTab('buat');
  }

  /* ============ TAB RIWAYAT ============ */
  async function muatRiwayat() {
    $('#riwayat-info').textContent = 'Memuat…';
    try {
      const r = await api('listSertifikat');
      if (!r.ok) throw new Error(r.pesan);
      S.sertifikat = (r.data || []).reverse();
      renderRiwayat(); infoNomorTerakhir();
    } catch (err) { $('#riwayat-info').textContent = err.message; }
  }
  $('#b-muat-riwayat').onclick = muatRiwayat;
  $('#q').oninput = renderRiwayat;
  $('#f-keg').onchange = renderRiwayat;

  function renderRiwayat() {
    if (!S.sertifikat) return;
    const q = $('#q').value.toLowerCase().trim();
    const fk = $('#f-keg').value;
    const hasil = S.sertifikat.filter(s =>
      (!fk || s.id_kegiatan === fk) &&
      (!q || [s.nomor, s.nama_penerima, s.nama_kegiatan, s.peran].join(' ').toLowerCase().includes(q)));
    $('#riwayat-info').textContent = `${hasil.length} dari ${S.sertifikat.length} sertifikat`;
    $('#list-riwayat').innerHTML = hasil.length ? hasil.map(s => `
      <div class="item" data-id="${esc(s.id)}">
        <div class="item-main">
          <b>${esc(s.nama_penerima)}<span class="pill">${esc(s.peran)}</span></b>
          <div class="item-sub">${esc(s.nomor)} · ${esc(s.nama_kegiatan)}</div>
          <div class="item-sub">oleh ${esc(s.diubah_oleh || s.dibuat_oleh)} · ${esc((s.diubah_pada || s.dibuat_pada || '').slice(0, 16))}</div>
        </div>
        <div class="item-act">
          <button class="btn sm" data-r="jpg">JPG</button>
          <button class="btn sm" data-r="pdf">PDF</button>
          <button class="btn sm" data-r="edit">Buka</button>
          <button class="btn sm ghost danger" data-r="hapus" title="Hapus">Hapus</button>
        </div>
      </div>`).join('') : '<p class="kosong">Belum ada sertifikat.</p>';
  }

  $('#list-riwayat').addEventListener('click', async e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const s = S.sertifikat.find(x => x.id === b.closest('.item').dataset.id); if (!s) return;
    if (b.dataset.r === 'edit') return bukaUntukEdit(s);
    if (b.dataset.r === 'hapus') {
      if (!confirm(`Hapus arsip sertifikat ${s.nomor} (${s.nama_penerima})?`)) return;
      loading(true, 'Menghapus…');
      try {
        const r = await api('deleteSertifikat', { id: s.id });
        if (!r.ok) throw new Error(r.pesan);
        S.sertifikat = S.sertifikat.filter(x => x.id !== s.id); renderRiwayat(); toast('Arsip dihapus');
      } catch (err) { toast(err.message, true); } finally { loading(false); }
      return;
    }
    let d = {};
    try { d = JSON.parse(s.data_json || '{}'); } catch (e2) {}
    loading(true, 'Membuat file…');
    try { await keluarkan(d, b.dataset.r); } catch (err) { toast(err.message, true); } finally { loading(false); }
  });

  /* ============ TAB KEGIATAN ============ */
  const FK = $('#f-keg-form');

  function resetKegiatanForm() {
    FK.reset(); FK.id.value = '';
    FK.kota.value = S.pengaturan.kota_default || '';
    FK.paragraf.value = S.pengaturan.paragraf_default || '';
    $('#keg-judul').textContent = 'Tambah kegiatan';
    contohParagraf();
  }
  $('#b-keg-baru').onclick = resetKegiatanForm;

  function dataKegiatanForm() {
    const o = Object.fromEntries(new FormData(FK).entries());
    o.tgl_selesai = o.tgl_selesai || o.tgl_mulai;
    o.tgl_terbit = o.tgl_terbit || o.tgl_selesai;
    return o;
  }
  function contohParagraf() {
    const k = dataKegiatanForm();
    $('#o-paragraf').textContent = isiParagraf(k.paragraf, k) + '\n' + tempatTanggal(k) + (k.tgl_mulai ? `\nNomor: 001/${S.pengaturan.kode_nomor || 'AIPVOGI/Sek'}/${ROMAWI[+k.tgl_mulai.split('-')[1] - 1]}/${k.tgl_mulai.split('-')[0]}` : '');
  }
  FK.addEventListener('input', contohParagraf);

  FK.onsubmit = async e => {
    e.preventDefault();
    const d = dataKegiatanForm();
    if (d.tgl_selesai < d.tgl_mulai) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai.', true);
    loading(true, 'Menyimpan kegiatan…');
    try {
      const r = await api('saveKegiatan', { data: d });
      if (!r.ok) throw new Error(r.pesan);
      const i = S.kegiatan.findIndex(k => k.id === r.data.id);
      if (i >= 0) S.kegiatan[i] = { ...S.kegiatan[i], ...r.data }; else S.kegiatan.push(r.data);
      isiPilihanKegiatan(); renderDaftarKegiatan(); resetKegiatanForm();
      F.id_kegiatan.value = r.data.id; if (!S.teksManual) isiTeksBawaan();
      toast('Kegiatan disimpan');
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  function renderDaftarKegiatan() {
    const urut = [...S.kegiatan].sort((a, b) => (b.tgl_mulai || '').localeCompare(a.tgl_mulai || ''));
    $('#list-kegiatan').innerHTML = urut.length ? urut.map(k => `
      <div class="item" data-id="${esc(k.id)}">
        <div class="item-main">
          <b>${esc(k.nama)}</b>
          <div class="item-sub">${esc(rentang(k.tgl_mulai, k.tgl_selesai))} · ${esc(k.moda)}${k.jpl ? ' · ' + esc(k.jpl) + ' JPL' : ''}${k.kota ? ' · ' + esc(k.kota) : ''}</div>
        </div>
        <div class="item-act">
          <button class="btn sm primary" data-k="pakai">Buat sertifikat</button>
          <button class="btn sm" data-k="edit">Edit</button>
          <button class="btn sm ghost danger" data-k="hapus">Hapus</button>
        </div>
      </div>`).join('') : '<p class="kosong">Belum ada kegiatan.</p>';
  }

  $('#list-kegiatan').addEventListener('click', async e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = S.kegiatan.find(x => x.id === b.closest('.item').dataset.id); if (!k) return;
    if (b.dataset.k === 'pakai') { kosongkanForm(); F.id_kegiatan.value = k.id; isiTeksBawaan(); bukaTab('buat'); return; }
    if (b.dataset.k === 'edit') {
      ['id', 'nama', 'tgl_mulai', 'tgl_selesai', 'moda', 'jpl', 'kota', 'tgl_terbit', 'paragraf'].forEach(n => (FK[n].value = k[n] || ''));
      if (!FK.paragraf.value) FK.paragraf.value = S.pengaturan.paragraf_default || '';
      $('#keg-judul').textContent = 'Edit kegiatan'; contohParagraf(); window.scrollTo(0, 0); FK.nama.focus();
      return;
    }
    if (b.dataset.k === 'hapus') {
      if (!confirm(`Hapus kegiatan "${k.nama}"?\nArsip sertifikat yang sudah dibuat tetap tersimpan.`)) return;
      loading(true, 'Menghapus…');
      try {
        const r = await api('deleteKegiatan', { id: k.id });
        if (!r.ok) throw new Error(r.pesan);
        S.kegiatan = S.kegiatan.filter(x => x.id !== k.id);
        isiPilihanKegiatan(); renderDaftarKegiatan(); isiTeksBawaan(); gambarPratinjau(); toast('Kegiatan dihapus');
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
    loading(true, 'Menyimpan pengaturan…');
    try {
      const r = await api('savePengaturan', { data });
      if (!r.ok) throw new Error(r.pesan);
      S.pengaturan = { ...S.pengaturan, ...r.pengaturan };
      toast('Pengaturan disimpan'); gambarPratinjau();
    } catch (err) { toast(err.message, true); } finally { loading(false); }
  };

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
    try { await muatData(); S.sertifikat = null; isiSemua(); toast('Data diperbarui'); }
    catch (err) { toast(err.message, true); } finally { loading(false); }
  };

  /* ---------------- start ---------------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (S.token && S.api) mulai(); else tampilLogin();

  // untuk pengujian
  window.__eserti = { S, rentang, nomorLengkap, isiParagraf };
})();
