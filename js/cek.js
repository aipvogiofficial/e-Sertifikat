/* =========================================================
 * Halaman publik: unduh sertifikat peserta & verifikasi QR
 * ========================================================= */
(() => {
  const $ = s => document.querySelector(s);
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const API = ((window.ESERTI_CONFIG && window.ESERTI_CONFIG.API_URL) || '').trim() ||
    ((() => { try { return localStorage.getItem('eserti_api'); } catch (e) { return ''; } })() || '');
  const params = new URLSearchParams(location.search);
  Sertifikat.setBasisVerif(new URL('.', location.href).href);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tgl = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };
  function rentang(a, b) {
    if (!a) return '';
    if (!b || a === b) return tgl(a);
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BULAN[m1 - 1]} ${y1}`;
    if (y1 === y2) return `${d1} ${BULAN[m1 - 1]} – ${d2} ${BULAN[m2 - 1]} ${y1}`;
    return `${tgl(a)} – ${tgl(b)}`;
  }
  let toastT;
  function toast(msg, err = false) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 3500);
  }
  const loading = (on, txt = 'Memproses…') => { $('#loading').hidden = !on; $('#loading-txt').textContent = txt; };

  async function api(aksi, payload = {}) {
    if (API === 'demo') return DemoApi.panggil(aksi, { aksi, ...payload });
    if (!API) throw new Error('Server belum dikonfigurasi.');
    let r;
    try {
      r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ aksi, ...payload }), redirect: 'follow' });
    } catch (e) { throw new Error('Tidak dapat terhubung. Periksa koneksi internet Anda.'); }
    try { return await r.json(); } catch (e) { throw new Error('Server sedang sibuk. Coba beberapa saat lagi.'); }
  }

  /* ---------------- verifikasi QR ---------------- */
  async function verifikasi(kode) {
    $('#v-verif').hidden = false;
    $('#verif-hasil').innerHTML = '<p class="muted" style="text-align:center">Memeriksa sertifikat…</p>';
    try {
      const r = await api('verifikasi', { kode });
      if (!r.ok) throw new Error(r.pesan);
      if (!r.sah) {
        $('#verif-hasil').innerHTML = `<div class="verif tidak"><div class="verif-ic">✕</div><h1>Tidak terdaftar</h1>
          <p class="muted">Kode <b>${esc(kode)}</b> tidak ditemukan dalam arsip sertifikat AIPVOGI. Sertifikat ini mungkin tidak sah, sudah dibatalkan, atau kodenya salah ketik.</p>
          <a class="btn" href="cek.html">Cek kode lain</a></div>`;
        return;
      }
      const d = r.data;
      $('#verif-hasil').innerHTML = `<div class="verif sah"><div class="verif-ic">✓</div><h1>Sertifikat SAH</h1>
        <p class="muted">Tercatat dalam arsip resmi AIPVOGI.</p>
        <table class="verif-tabel">
          <tr><th>Nama</th><td>${esc(d.nama)}</td></tr>
          <tr><th>Peran</th><td>${esc(d.peran)}</td></tr>
          <tr><th>Kegiatan</th><td>${esc(d.kegiatan)}</td></tr>
          ${d.tgl_mulai ? `<tr><th>Tanggal kegiatan</th><td>${esc(rentang(d.tgl_mulai, d.tgl_selesai))}</td></tr>` : ''}
          <tr><th>Nomor sertifikat</th><td>${esc(d.nomor)}</td></tr>
          ${d.tempat_tanggal ? `<tr><th>Diterbitkan</th><td>${esc(d.tempat_tanggal)}</td></tr>` : ''}
          ${d.penandatangan ? `<tr><th>Penandatangan</th><td>${esc(d.penandatangan)}</td></tr>` : ''}
          <tr><th>Kode verifikasi</th><td>${esc(d.kode)}</td></tr>
        </table></div>`;
    } catch (err) {
      $('#verif-hasil').innerHTML = `<p class="err" style="text-align:center">${esc(err.message)}</p>`;
    }
  }

  /* ---------------- unduh peserta ---------------- */
  const K = params.get('k');
  const latarCache = {};
  let aktif = null; // { d, cv }

  async function muatKegiatan() {
    $('#v-unduh').hidden = false;
    try {
      const r = await api('publikKegiatan', { k: K });
      const keg = r.kegiatan;
      if (keg) {
        $('#keg-nama').textContent = keg.nama;
        $('#keg-info').textContent = [rentang(keg.tgl_mulai, keg.tgl_selesai), keg.moda, keg.kota].filter(Boolean).join(' · ');
        document.title = 'Sertifikat ' + keg.nama;
      }
      if (!r.ok) {
        if (!keg) $('#keg-nama').textContent = 'Link tidak valid';
        $('#keg-tutup').textContent = r.pesan; $('#keg-tutup').hidden = false;
        return;
      }
      $('#f-cari').hidden = false;
      $('#f-cari').q.focus();
    } catch (err) {
      $('#keg-nama').textContent = 'Gagal memuat';
      $('#keg-tutup').textContent = err.message; $('#keg-tutup').hidden = false;
    }
  }

  $('#f-cari').onsubmit = async e => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    $('#cari-err').textContent = ''; $('#hasil-cari').innerHTML = ''; $('#hasil-sertifikat').hidden = true;
    if (q.replace(/[^a-z0-9]/gi, '').length < 4) { $('#cari-err').textContent = 'Ketik minimal 4 huruf nama Anda.'; return; }
    loading(true, 'Mencari…');
    try {
      const r = await api('cariPublik', { k: K, q });
      if (!r.ok) throw new Error(r.pesan);
      if (!r.data.length) {
        $('#hasil-cari').innerHTML = `<p class="kosong">Nama tidak ditemukan. Coba ketik sebagian nama saja (tanpa gelar), atau hubungi panitia.</p>`;
        return;
      }
      $('#hasil-cari').innerHTML = r.data.map(x => `
        <div class="hasil-item"><div><b>${esc(x.nama)}</b><span class="item-sub">${esc(x.peran)}</span></div>
        <button class="btn sm primary" data-kode="${esc(x.kode)}">Lihat sertifikat</button></div>`).join('') +
        (r.lebih ? '<p class="hint">Hasil dibatasi 10 nama. Ketik nama lebih lengkap untuk mempersempit.</p>' : '');
    } catch (err) { $('#cari-err').textContent = err.message; }
    finally { loading(false); }
  };

  $('#hasil-cari').addEventListener('click', async e => {
    const b = e.target.closest('[data-kode]'); if (!b) return;
    loading(true, 'Menyiapkan sertifikat…');
    try {
      const r = await api('ambilPublik', { k: K, kode: b.dataset.kode });
      if (!r.ok) throw new Error(r.pesan);
      await Sertifikat.siapkan({ statis: false });
      if (!latarCache[r.latar_id]) latarCache[r.latar_id] = await Sertifikat.muat(r.latar);
      const cv = document.createElement('canvas');
      Sertifikat.gambarKe(cv, r.data, { latar: latarCache[r.latar_id] });
      aktif = { d: r.data, cv };
      $('#hs-img').src = cv.toDataURL('image/jpeg', 0.7);
      $('#hs-judul').textContent = 'Sertifikat ' + r.data.nama;
      $('#hasil-sertifikat').hidden = false;
      $('#hasil-sertifikat').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { toast(err.message, true); }
    finally { loading(false); }
  });

  const namaFile = (d, ext) => `Sertifikat_${String(d.nama || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 50)}.${ext}`;
  function unduh(blob, nama) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nama;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
  $('#hs-pdf').onclick = () => { if (aktif) unduh(Sertifikat.kePdf(aktif.cv), namaFile(aktif.d, 'pdf')); };
  $('#hs-jpg').onclick = async () => { if (aktif) unduh(await Sertifikat.keBlobJpg(aktif.cv), namaFile(aktif.d, 'jpg')); };
  $('#hs-share').onclick = async () => {
    if (!aktif) return;
    const blob = Sertifikat.kePdf(aktif.cv);
    const file = new File([blob], namaFile(aktif.d, 'pdf'), { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Sertifikat ' + aktif.d.nama }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    unduh(blob, file.name); toast('Perangkat tidak mendukung bagikan langsung. File diunduh.');
  };

  /* ---------------- kode manual ---------------- */
  $('#f-kode').onsubmit = e => {
    e.preventDefault();
    const k = e.target.kode.value.trim().toUpperCase();
    if (k) location.search = '?v=' + encodeURIComponent(k);
  };

  /* ---------------- mulai ---------------- */
  if (params.get('v')) verifikasi(params.get('v').trim().toUpperCase());
  else if (K) muatKegiatan();
  else $('#v-kode').hidden = false;
})();
