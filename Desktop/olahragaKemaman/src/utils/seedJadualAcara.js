/**
 * seedJadualAcara.js — Seed 62 acara standard KOAM
 *
 * Doc ID  : noAcara ("101", "201", dll)
 * Path    : kejohanan/{kejohananId}/acara/{noAcara}
 *
 * Nombor format:
 *   1XX = SR, 2XX = SM, 3XX = PPKI
 *   X0X = Lelaki, X1X = Perempuan
 *   cth: 101 = SR Lelaki ke-1, 111 = SR Perempuan ke-1
 */

import {
  collection, doc, getDoc, getDocs,
  setDoc, serverTimestamp, query, where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

// ─── Data acara ───────────────────────────────────────────────────────────────

const ACARA_LIST = [

  // ══════════════ SEKOLAH RENDAH LELAKI (101–110) ══════════════

  { noAcara:'101', namaAcara:'100m Lelaki SR',           kodAcara:'100M-L-SR',    kategori:'SR',   jantina:'L', jenisAcara:'lorong',        hari:1, masa:'08:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'102', namaAcara:'200m Lelaki SR',           kodAcara:'200M-L-SR',    kategori:'SR',   jantina:'L', jenisAcara:'lorong',        hari:1, masa:'10:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'103', namaAcara:'400m Lelaki SR',           kodAcara:'400M-L-SR',    kategori:'SR',   jantina:'L', jenisAcara:'lorong',        hari:1, masa:'14:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'104', namaAcara:'800m Lelaki SR',           kodAcara:'800M-L-SR',    kategori:'SR',   jantina:'L', jenisAcara:'mass_start',    hari:1, masa:'11:00', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'105', namaAcara:'1500m Lelaki SR',          kodAcara:'1500M-L-SR',   kategori:'SR',   jantina:'L', jenisAcara:'mass_start',    hari:2, masa:'08:00', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'106', namaAcara:'60m Lelaki SR',            kodAcara:'60M-L-SR',     kategori:'SR',   jantina:'L', jenisAcara:'lorong',        hari:2, masa:'10:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'107', namaAcara:'4x100m Lelaki SR',         kodAcara:'4X100M-L-SR',  kategori:'SR',   jantina:'L', jenisAcara:'relay',         hari:2, masa:'14:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'108', namaAcara:'Lompat Jauh Lelaki SR',    kodAcara:'LJ-L-SR',      kategori:'SR',   jantina:'L', jenisAcara:'padang_lompat', hari:1, masa:'09:30', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:4,    isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'109', namaAcara:'Lompat Tinggi Lelaki SR',  kodAcara:'LTG-L-SR',     kategori:'SR',   jantina:'L', jenisAcara:'padang_lompat', hari:2, masa:'09:30', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'110', namaAcara:'Lontar Peluru Lelaki SR',  kodAcara:'LP-L-SR',      kategori:'SR',   jantina:'L', jenisAcara:'padang_balin',  hari:1, masa:'09:30', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:4,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },

  // ══════════════ SEKOLAH RENDAH PEREMPUAN (111–120) ══════════════

  { noAcara:'111', namaAcara:'100m Perempuan SR',           kodAcara:'100M-P-SR',    kategori:'SR',   jantina:'P', jenisAcara:'lorong',        hari:1, masa:'08:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'112', namaAcara:'200m Perempuan SR',           kodAcara:'200M-P-SR',    kategori:'SR',   jantina:'P', jenisAcara:'lorong',        hari:1, masa:'10:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'113', namaAcara:'400m Perempuan SR',           kodAcara:'400M-P-SR',    kategori:'SR',   jantina:'P', jenisAcara:'lorong',        hari:1, masa:'14:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'114', namaAcara:'800m Perempuan SR',           kodAcara:'800M-P-SR',    kategori:'SR',   jantina:'P', jenisAcara:'mass_start',    hari:1, masa:'11:00', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'115', namaAcara:'1500m Perempuan SR',          kodAcara:'1500M-P-SR',   kategori:'SR',   jantina:'P', jenisAcara:'mass_start',    hari:2, masa:'08:00', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'116', namaAcara:'60m Perempuan SR',            kodAcara:'60M-P-SR',     kategori:'SR',   jantina:'P', jenisAcara:'lorong',        hari:2, masa:'10:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'117', namaAcara:'4x100m Perempuan SR',         kodAcara:'4X100M-P-SR',  kategori:'SR',   jantina:'P', jenisAcara:'relay',         hari:2, masa:'14:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'118', namaAcara:'Lompat Jauh Perempuan SR',    kodAcara:'LJ-P-SR',      kategori:'SR',   jantina:'P', jenisAcara:'padang_lompat', hari:1, masa:'09:30', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:4,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'119', namaAcara:'Lompat Tinggi Perempuan SR',  kodAcara:'LTG-P-SR',     kategori:'SR',   jantina:'P', jenisAcara:'padang_lompat', hari:2, masa:'09:30', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'120', namaAcara:'Lontar Peluru Perempuan SR',  kodAcara:'LP-P-SR',      kategori:'SR',   jantina:'P', jenisAcara:'padang_balin',  hari:1, masa:'09:30', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:4,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },

  // ══════════════ SEKOLAH MENENGAH LELAKI (201–215) ══════════════

  { noAcara:'201', namaAcara:'100m Lelaki SM',           kodAcara:'100M-L-SM',    kategori:'SM',   jantina:'L', jenisAcara:'lorong',        hari:1, masa:'08:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:true,  caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'202', namaAcara:'200m Lelaki SM',           kodAcara:'200M-L-SM',    kategori:'SM',   jantina:'L', jenisAcara:'lorong',        hari:1, masa:'10:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'203', namaAcara:'400m Lelaki SM',           kodAcara:'400M-L-SM',    kategori:'SM',   jantina:'L', jenisAcara:'lorong',        hari:1, masa:'14:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'204', namaAcara:'800m Lelaki SM',           kodAcara:'800M-L-SM',    kategori:'SM',   jantina:'L', jenisAcara:'mass_start',    hari:1, masa:'11:30', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:true,  adaSaringan:false, caraPilihFinal:'best_time', bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'205', namaAcara:'1500m Lelaki SM',          kodAcara:'1500M-L-SM',   kategori:'SM',   jantina:'L', jenisAcara:'mass_start',    hari:2, masa:'08:30', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'206', namaAcara:'3000m Lelaki SM',          kodAcara:'3000M-L-SM',   kategori:'SM',   jantina:'L', jenisAcara:'mass_start',    hari:2, masa:'09:00', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'207', namaAcara:'110m Batas Lelaki SM',     kodAcara:'110MH-L-SM',   kategori:'SM',   jantina:'L', jenisAcara:'lorong',        hari:2, masa:'10:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'208', namaAcara:'4x100m Lelaki SM',         kodAcara:'4X100M-L-SM',  kategori:'SM',   jantina:'L', jenisAcara:'relay',         hari:2, masa:'14:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'209', namaAcara:'4x400m Lelaki SM',         kodAcara:'4X400M-L-SM',  kategori:'SM',   jantina:'L', jenisAcara:'relay',         hari:2, masa:'15:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'210', namaAcara:'Lompat Jauh Lelaki SM',    kodAcara:'LJ-L-SM',      kategori:'SM',   jantina:'L', jenisAcara:'padang_lompat', hari:1, masa:'15:00', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'211', namaAcara:'Lompat Tinggi Lelaki SM',  kodAcara:'LTG-L-SM',     kategori:'SM',   jantina:'L', jenisAcara:'padang_lompat', hari:2, masa:'09:30', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'212', namaAcara:'Lompat Kijang Lelaki SM',  kodAcara:'LK-L-SM',      kategori:'SM',   jantina:'L', jenisAcara:'padang_lompat', hari:2, masa:'11:00', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'213', namaAcara:'Lontar Peluru Lelaki SM',  kodAcara:'LP-L-SM',      kategori:'SM',   jantina:'L', jenisAcara:'padang_balin',  hari:1, masa:'15:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'214', namaAcara:'Lempar Cakera Lelaki SM',  kodAcara:'LC-L-SM',      kategori:'SM',   jantina:'L', jenisAcara:'padang_balin',  hari:2, masa:'11:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'215', namaAcara:'Lempar Lembing Lelaki SM', kodAcara:'LL-L-SM',      kategori:'SM',   jantina:'L', jenisAcara:'padang_balin',  hari:2, masa:'15:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },

  // ══════════════ SEKOLAH MENENGAH PEREMPUAN (221–235) ══════════════

  { noAcara:'221', namaAcara:'100m Perempuan SM',           kodAcara:'100M-P-SM',    kategori:'SM',   jantina:'P', jenisAcara:'lorong',        hari:1, masa:'08:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:true,  caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'222', namaAcara:'200m Perempuan SM',           kodAcara:'200M-P-SM',    kategori:'SM',   jantina:'P', jenisAcara:'lorong',        hari:1, masa:'10:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'223', namaAcara:'400m Perempuan SM',           kodAcara:'400M-P-SM',    kategori:'SM',   jantina:'P', jenisAcara:'lorong',        hari:1, masa:'14:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:true,  adaSaringan:false, caraPilihFinal:'hybrid',    bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'224', namaAcara:'800m Perempuan SM',           kodAcara:'800M-P-SM',    kategori:'SM',   jantina:'P', jenisAcara:'mass_start',    hari:1, masa:'11:30', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:true,  adaSaringan:false, caraPilihFinal:'best_time', bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'225', namaAcara:'1500m Perempuan SM',          kodAcara:'1500M-P-SM',   kategori:'SM',   jantina:'P', jenisAcara:'mass_start',    hari:2, masa:'08:30', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'226', namaAcara:'3000m Perempuan SM',          kodAcara:'3000M-P-SM',   kategori:'SM',   jantina:'P', jenisAcara:'mass_start',    hari:2, masa:'09:00', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'227', namaAcara:'100m Batas Perempuan SM',     kodAcara:'100MH-P-SM',   kategori:'SM',   jantina:'P', jenisAcara:'lorong',        hari:2, masa:'10:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'228', namaAcara:'4x100m Perempuan SM',         kodAcara:'4X100M-P-SM',  kategori:'SM',   jantina:'P', jenisAcara:'relay',         hari:2, masa:'14:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'229', namaAcara:'4x400m Perempuan SM',         kodAcara:'4X400M-P-SM',  kategori:'SM',   jantina:'P', jenisAcara:'relay',         hari:2, masa:'15:30', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'230', namaAcara:'Lompat Jauh Perempuan SM',    kodAcara:'LJ-P-SM',      kategori:'SM',   jantina:'P', jenisAcara:'padang_lompat', hari:1, masa:'15:00', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:true,  hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'231', namaAcara:'Lompat Tinggi Perempuan SM',  kodAcara:'LTG-P-SM',     kategori:'SM',   jantina:'P', jenisAcara:'padang_lompat', hari:2, masa:'09:30', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'232', namaAcara:'Lompat Kijang Perempuan SM',  kodAcara:'LK-P-SM',      kategori:'SM',   jantina:'P', jenisAcara:'padang_lompat', hari:2, masa:'11:00', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'233', namaAcara:'Lontar Peluru Perempuan SM',  kodAcara:'LP-P-SM',      kategori:'SM',   jantina:'P', jenisAcara:'padang_balin',  hari:1, masa:'15:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'234', namaAcara:'Lempar Cakera Perempuan SM',  kodAcara:'LC-P-SM',      kategori:'SM',   jantina:'P', jenisAcara:'padang_balin',  hari:2, masa:'11:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'235', namaAcara:'Lempar Lembing Perempuan SM', kodAcara:'LL-P-SM',      kategori:'SM',   jantina:'P', jenisAcara:'padang_balin',  hari:2, masa:'15:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:6,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },

  // ══════════════ PPKI LELAKI (301–306) ══════════════

  { noAcara:'301', namaAcara:'100m Lelaki PPKI',          kodAcara:'100M-L-PPKI',   kategori:'PPKI', jantina:'L', jenisAcara:'lorong',        hari:1, masa:'09:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'302', namaAcara:'200m Lelaki PPKI',          kodAcara:'200M-L-PPKI',   kategori:'PPKI', jantina:'L', jenisAcara:'lorong',        hari:1, masa:'09:15', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'303', namaAcara:'400m Lelaki PPKI',          kodAcara:'400M-L-PPKI',   kategori:'PPKI', jantina:'L', jenisAcara:'mass_start',    hari:1, masa:'10:15', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'304', namaAcara:'4x100m Lelaki PPKI',        kodAcara:'4X100M-L-PPKI', kategori:'PPKI', jantina:'L', jenisAcara:'relay',         hari:2, masa:'14:45', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'305', namaAcara:'Lompat Jauh Lelaki PPKI',   kodAcara:'LJ-L-PPKI',     kategori:'PPKI', jantina:'L', jenisAcara:'padang_lompat', hari:1, masa:'13:00', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'306', namaAcara:'Lontar Peluru Lelaki PPKI', kodAcara:'LP-L-PPKI',     kategori:'PPKI', jantina:'L', jenisAcara:'padang_balin',  hari:1, masa:'13:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },

  // ══════════════ PPKI PEREMPUAN (311–316) ══════════════

  { noAcara:'311', namaAcara:'100m Perempuan PPKI',          kodAcara:'100M-P-PPKI',   kategori:'PPKI', jantina:'P', jenisAcara:'lorong',        hari:1, masa:'09:00', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'312', namaAcara:'200m Perempuan PPKI',          kodAcara:'200M-P-PPKI',   kategori:'PPKI', jantina:'P', jenisAcara:'lorong',        hari:1, masa:'09:15', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'313', namaAcara:'400m Perempuan PPKI',          kodAcara:'400M-P-PPKI',   kategori:'PPKI', jantina:'P', jenisAcara:'mass_start',    hari:1, masa:'10:15', lokasi:'Trek Utama', adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'314', namaAcara:'4x100m Perempuan PPKI',        kodAcara:'4X100M-P-PPKI', kategori:'PPKI', jantina:'P', jenisAcara:'relay',         hari:2, masa:'14:45', lokasi:'Trek Utama', adaLorong:true,  bilanganLorong:8, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:null, isWindReading:false, hadAtletPerSekolah:1, minPeserta:3 },
  { noAcara:'315', namaAcara:'Lompat Jauh Perempuan PPKI',   kodAcara:'LJ-P-PPKI',     kategori:'PPKI', jantina:'P', jenisAcara:'padang_lompat', hari:1, masa:'13:00', lokasi:'Padang A',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
  { noAcara:'316', namaAcara:'Lontar Peluru Perempuan PPKI', kodAcara:'LP-P-PPKI',     kategori:'PPKI', jantina:'P', jenisAcara:'padang_balin',  hari:1, masa:'13:00', lokasi:'Padang B',   adaLorong:false, bilanganLorong:0, adaHeat:false, adaSaringan:false, caraPilihFinal:'terus',     bilanganFinalis:8, bilanganCubaan:3,    isWindReading:false, hadAtletPerSekolah:2, minPeserta:3 },
]

export const TOTAL_ACARA = ACARA_LIST.length // 62

// ─── Seed function ────────────────────────────────────────────────────────────

/**
 * Seed jadual acara standard KOAM ke Firestore.
 *
 * @param {string}   kejohananId  - ID kejohanan aktif
 * @param {Function} onLog        - callback(msg: string) untuk log progress
 * @returns {{ berjaya, skip, gagal }}
 */
export async function seedJadualAcara(kejohananId, onLog) {
  if (!kejohananId) throw new Error('kejohananId diperlukan')

  onLog?.(`══ SEED JADUAL ACARA — ${ACARA_LIST.length} acara ══`)

  // Semak kejohanan wujud
  const kejSnap = await getDoc(doc(db, 'kejohanan', kejohananId))
  if (!kejSnap.exists()) throw new Error(`Kejohanan "${kejohananId}" tidak dijumpai.`)
  onLog?.(`✓ Kejohanan: ${kejSnap.data().namaKejohanan || kejohananId}`)

  let berjaya = 0, skip = 0, gagal = 0

  for (let i = 0; i < ACARA_LIST.length; i++) {
    const acara = ACARA_LIST[i]
    const ref   = doc(db, 'kejohanan', kejohananId, 'acara', acara.noAcara)

    try {
      const snap = await getDoc(ref)
      if (snap.exists()) {
        skip++
        if (i % 10 === 0 || i === ACARA_LIST.length - 1) {
          onLog?.(`  ↷ Skip ${acara.noAcara}: ${acara.namaAcara} (sudah wujud)`)
        }
      } else {
        await setDoc(ref, {
          ...acara,
          statusAcara: 'akan_datang',
          isSeedData:  true,
          createdAt:   serverTimestamp(),
          updatedAt:   serverTimestamp(),
        })
        berjaya++
        if (berjaya % 10 === 0 || i === ACARA_LIST.length - 1) {
          onLog?.(`  ✓ [${berjaya}] ${acara.noAcara}: ${acara.namaAcara}`)
        }
      }
    } catch (e) {
      gagal++
      onLog?.(`  ✗ ${acara.noAcara}: ${e.message}`)
    }
  }

  onLog?.(`\n── Selesai: ${berjaya} berjaya · ${skip} diskip · ${gagal} gagal ──`)
  return { berjaya, skip, gagal }
}

/**
 * Ambil kejohanan aktif — helper untuk panel seed.
 * @returns {{ id, nama } | null}
 */
export async function getKejohananAktif() {
  const snap = await getDocs(
    query(collection(db, 'kejohanan'), where('statusKejohanan', '==', 'aktif'))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, nama: d.data().namaKejohanan || d.id }
}
