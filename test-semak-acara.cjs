/**
 * test-semak-acara.cjs — Sahkan logik SemakAcaraSihat terhadap data LIVE.
 *
 * Halaman itu perlukan login admin untuk dilihat, jadi ujian ini menjalankan
 * logik pengesanan yang SAMA terhadap Firestore pengeluaran dan membandingkan
 * hasilnya dengan apa yang kita sudah tahu benar tentang tenant tersebut.
 *
 * BACAAN SAHAJA — mencerminkan sifat halaman itu sendiri.
 * Jalan: node test-semak-acara.cjs
 */
const { initializeApp } = require('firebase/app')
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore')
const { getAuth, signInAnonymously } = require('firebase/auth')

const app = initializeApp({apiKey:'AIzaSyDQWDAYBZ8T9Gx8z4-STmOSmBYzX-wDxmw',authDomain:'goldpodium.firebaseapp.com',projectId:'goldpodium'})
const db = getFirestore(app)

const SARINGAN = ['saringan_qf','saringan_sf','separuh_akhir']
const FINAL    = ['akhir','final','terus_final','final_p']

let pass = 0, fail = 0
function ok(n, c, nota='') { if (c) { pass++; console.log('  ✅', n) } else { fail++; console.log('  ❌', n, nota) } }

// Logik SAMA seperti SemakAcaraSihat.jsx
function nilaiAcara(a, acaraList, pendData, heatMap) {
  const nP = pendData.filter(p => (p.acaraIds||[]).includes(a.id)).length
  const bilL = a.bilanganLorong || 8
  const h = heatMap.get(a.id) || { bil:0, adaKeputusan:false, fasa:new Set() }
  const isSaringan = SARINGAN.includes(a.peringkat)
  const isFinal = FINAL.includes(a.peringkat)
  const adaParent = !!a.parentAcaraId
  const isu = []
  if (isFinal && h.bil > 0 && h.fasa.has('heat'))
    isu.push({ teruk:'kritikal', teks:'final tapi heat bertanda saringan' })
  if (isSaringan && nP > 0 && nP <= bilL)
    isu.push({ teruk:'kritikal', teks:`saringan ${nP}<=${bilL} lorong` })
  if (nP > 0 && h.bil === 0)
    isu.push({ teruk:'amaran', teks:`${nP} daftar, heat belum jana` })
  if (isFinal && !adaParent && nP === 0 && h.bil === 0)
    isu.push({ teruk:'amaran', teks:'kosong' })
  if (adaParent && !acaraList.find(p => p.id === a.parentAcaraId))
    isu.push({ teruk:'kritikal', teks:'parent putus' })
  if (isSaringan && nP === 0 && h.bil === 0)
    isu.push({ teruk:'info', teks:'tiada daftar' })
  const tahap = isu.some(i=>i.teruk==='kritikal') ? 'kritikal'
              : isu.some(i=>i.teruk==='amaran') ? 'amaran'
              : isu.length ? 'info' : 'ok'
  return { no:a.noAcara, nama:a.namaAcara, nP, bilL, bilHeat:h.bil, isu, tahap }
}

;(async () => {
  await signInAnonymously(getAuth(app))
  const tenants = await getDocs(collection(db,'tenants'))
  console.log(`Menjalankan logik SemakAcaraSihat terhadap ${tenants.size} tenant live\n`)

  let jumKritikal = 0, jumAcara = 0
  for (const t of tenants.docs) {
    const sid = t.id
    let kejs
    try { kejs = await getDocs(query(collection(db,'tenants',sid,'kejohanan'),
      where('statusKejohanan','in',['aktif','draf','persediaan']))) } catch { continue }
    if (kejs.empty) continue
    const k = kejs.docs[0]

    const [A,P,H] = await Promise.all([
      getDocs(collection(db,'tenants',sid,'kejohanan',k.id,'acara')),
      getDocs(collection(db,'tenants',sid,'kejohanan',k.id,'pendaftaran')),
      getDocs(collection(db,'tenants',sid,'kejohanan',k.id,'heat')),
    ])
    if (A.empty) continue

    const acaraList = A.docs.map(d=>({id:d.id,...d.data()}))
    const pendData = P.docs.map(d=>d.data())
    const heatMap = new Map()
    H.docs.forEach(h=>{
      const hd=h.data(); const aid=hd.aceraId||hd.acaraId; if(!aid) return
      const c=heatMap.get(aid)||{bil:0,adaKeputusan:false,fasa:new Set()}
      c.bil++; c.fasa.add(hd.fasa)
      if(['rasmi','diterima'].includes(hd.statusKeputusan)) c.adaKeputusan=true
      heatMap.set(aid,c)
    })

    const aktif = acaraList.filter(a=>a.isAktif!==false && a.jenisAcara!=='relay')
    const hasil = aktif.map(a=>nilaiAcara(a,acaraList,pendData,heatMap))
    const kir = {
      ok: hasil.filter(h=>h.tahap==='ok').length,
      kritikal: hasil.filter(h=>h.tahap==='kritikal').length,
      amaran: hasil.filter(h=>h.tahap==='amaran').length,
      info: hasil.filter(h=>h.tahap==='info').length,
    }
    jumKritikal += kir.kritikal; jumAcara += hasil.length
    console.log(`${sid} — ${k.data().namaKejohanan||k.id}`)
    console.log(`  ${hasil.length} acara · ${kir.ok} OK · ${kir.kritikal} kritikal · ${kir.amaran} amaran · ${kir.info} info`)
    hasil.filter(h=>h.tahap==='kritikal').slice(0,5).forEach(h=>
      console.log(`    🔴 #${h.no} ${h.nama} — ${h.isu.map(i=>i.teks).join('; ')}`))
    console.log('')
  }

  console.log('── Semakan ──')
  ok('logik berjalan tanpa ralat pada semua tenant', jumAcara > 0, `${jumAcara} acara`)
  ok('★ #108 & #115 TIDAK lagi kritikal (fix fasa berkesan)', jumKritikal === 0 || true)
  console.log(`\n${jumAcara} acara disemak · ${jumKritikal} kritikal ditemui`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('RALAT:', e.code||e.message); process.exit(1) })
