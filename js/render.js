/* =========================================================
 * render.js — menggambar sertifikat di canvas (A4 300 dpi)
 * Semua koordinat dalam piksel kanvas 3508 × 2480.
 * Area aman teks: x 420–3088 (lebar 2668), y 190–2330.
 * ========================================================= */
const Sertifikat = (() => {
  const W = 3508, H = 2480;
  const CX = W / 2;
  const LEBAR_AMAN = 2640;          // lebar maksimum teks (di dalam bingkai + bebas ornamen)
  const AREA_AMAN = { x: 434, y: 200, w: 2640, h: 2120 };
  const FONT = 'Arimo, Arial, Helvetica, sans-serif';
  const HITAM = '#1d1d1d';
  const BIRU_PERAN = '#2E3192';

  // Tata letak (diukur dari sertifikat contoh AIPVOGI)
  const L = {
    logo:      { cy: 372, d: 368 },
    judul:     { cy: 682, w: 1060 },
    nomor:     { y: 815,  size: 50 },
    diberikan: { y: 990,  size: 50 },
    nama:      { y: 1112, size: 100, min: 52 },
    sebagai:   { y: 1228, size: 50 },
    peran:     { y: 1352, size: 108, min: 60 },
    paragraf:  { top: 1448, maxH: 250, size: 56, min: 38, lh: 1.22 },
    tempat:    { y: 1748, size: 50 },
    jabatan1:  { y: 1858, size: 50 },
    jabatan2:  { y: 1918, size: 50 },
    stempel:   { cx: 1525, cy: 2052, h: 372 },
    ttd:       { cx: 1700, cy: 2048, h: 330 },
    namaTtd:   { y: 2205, size: 50 }
  };

  const gambar = {};

  function muat(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Gagal memuat ' + String(src).slice(0, 60)));
      img.src = src;
    });
  }

  async function siapkan() {
    if (!gambar.template) {
      [gambar.template, gambar.judul, gambar.logo] = await Promise.all([
        muat('assets/template.jpg'), muat('assets/judul-sertifikat.png'), muat('assets/logo.png')
      ]);
    }
    await Promise.all([
      document.fonts.load(`400 50px Arimo`),
      document.fonts.load(`700 50px Arimo`)
    ]).catch(() => {});
  }

  async function setAset(jenis, dataUrl) {
    gambar[jenis] = dataUrl ? await muat(dataUrl).catch(() => null) : null;
  }

  function teks(ctx, isi, y, size, { bold = false, warna = HITAM, maxW = LEBAR_AMAN, min = 30 } = {}) {
    let s = size;
    ctx.fillStyle = warna;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    do {
      ctx.font = `${bold ? 700 : 400} ${s}px ${FONT}`;
      if (ctx.measureText(isi).width <= maxW) break;
      s -= 2;
    } while (s > min);
    ctx.fillText(isi, CX, y);
    return { size: s, width: Math.min(ctx.measureText(isi).width, maxW) };
  }

  function bungkus(ctx, isi, maxW) {
    const baris = [];
    String(isi).split(/\n/).forEach(par => {
      const kata = par.trim().split(/\s+/).filter(Boolean);
      let cur = '';
      kata.forEach(k => {
        const coba = cur ? cur + ' ' + k : k;
        if (ctx.measureText(coba).width <= maxW || !cur) cur = coba;
        else { baris.push(cur); cur = k; }
      });
      if (cur) baris.push(cur);
    });
    return baris;
  }

  function paragraf(ctx, isi) {
    const p = L.paragraf;
    let s = p.size, baris;
    for (;;) {
      ctx.font = `700 ${s}px ${FONT}`;
      baris = bungkus(ctx, isi, LEBAR_AMAN);
      const tinggi = baris.length * s * p.lh;
      const lebarOk = baris.every(b => ctx.measureText(b).width <= LEBAR_AMAN);
      if ((tinggi <= p.maxH && lebarOk) || s <= p.min) break;
      s -= 2;
    }
    const lh = s * p.lh;
    const total = baris.length * lh;
    const mulai = p.top + (p.maxH - total) / 2 + lh / 2;
    ctx.fillStyle = HITAM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    baris.forEach((b, i) => ctx.fillText(b, CX, mulai + i * lh));
  }

  function gambarTengah(ctx, img, cx, cy, h, { multiply = false, alpha = 1 } = {}) {
    if (!img) return;
    const w = img.width * (h / img.height);
    ctx.save();
    if (multiply) ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }

  /**
   * d = { nomor, nama, peran, paragraf, tempat_tanggal,
   *       label_diberikan, label_sebagai, ttd_jabatan_1, ttd_jabatan_2, ttd_nama }
   */
  function gambarKe(canvas, d, { areaAman = false } = {}) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(gambar.template, 0, 0, W, H);

    // logo & judul
    const lg = L.logo;
    ctx.drawImage(gambar.logo, CX - lg.d / 2, lg.cy - lg.d / 2, lg.d, lg.d);
    const jw = L.judul.w, jh = gambar.judul.height * (jw / gambar.judul.width);
    ctx.drawImage(gambar.judul, CX - jw / 2, L.judul.cy - jh / 2, jw, jh);

    teks(ctx, `Nomor : ${d.nomor || '…'}`, L.nomor.y, L.nomor.size);
    teks(ctx, d.label_diberikan || 'Diberikan Kepada :', L.diberikan.y, L.diberikan.size);
    teks(ctx, d.nama || 'Nama Penerima', L.nama.y, L.nama.size, { bold: true, min: L.nama.min });
    teks(ctx, d.label_sebagai || 'Atas Partisipasinya Sebagai', L.sebagai.y, L.sebagai.size);
    teks(ctx, String(d.peran || '').toUpperCase(), L.peran.y, L.peran.size, { bold: true, warna: BIRU_PERAN, min: L.peran.min });
    paragraf(ctx, d.paragraf || '');
    teks(ctx, d.tempat_tanggal || '', L.tempat.y, L.tempat.size);
    teks(ctx, d.ttd_jabatan_1 || '', L.jabatan1.y, L.jabatan1.size, { bold: true });
    teks(ctx, d.ttd_jabatan_2 || '', L.jabatan2.y, L.jabatan2.size, { bold: true });

    // stempel lalu tanda tangan (multiply → latar putih tidak menutupi teks)
    gambarTengah(ctx, gambar.stempel, L.stempel.cx, L.stempel.cy, L.stempel.h, { multiply: true, alpha: 0.9 });
    gambarTengah(ctx, gambar.ttd, L.ttd.cx, L.ttd.cy, L.ttd.h, { multiply: true });

    // nama penandatangan + garis bawah
    const nt = teks(ctx, d.ttd_nama || '', L.namaTtd.y, L.namaTtd.size, { bold: true });
    if (d.ttd_nama) {
      ctx.fillStyle = HITAM;
      ctx.fillRect(CX - nt.width / 2, L.namaTtd.y + nt.size * 0.55, nt.width, Math.max(3, nt.size * 0.07));
    }

    if (areaAman) {
      ctx.save();
      ctx.strokeStyle = '#E24B4A';
      ctx.lineWidth = 6;
      ctx.setLineDash([30, 20]);
      ctx.strokeRect(AREA_AMAN.x, AREA_AMAN.y, AREA_AMAN.w, AREA_AMAN.h);
      ctx.restore();
    }
    return canvas;
  }

  function keBlobJpg(canvas) {
    return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
  }

  function kePdf(canvas) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
    return pdf.output('blob');
  }

  return { siapkan, setAset, gambarKe, keBlobJpg, kePdf, ada: j => !!gambar[j], W, H };
})();
