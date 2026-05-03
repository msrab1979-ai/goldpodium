/**
 * AcaraSetup — /dashboard/acara
 *
 * Pengurusan acara per kejohanan.
 * Acara disimpan dalam sub-collection: kejohanan/{id}/acara/{aceraId}
 *
 * 5 Jenis Acara (standard MSSM/WA):
 *   lorong       — 100m, 200m, 400m (ada lorong + heat)
 *   mass_start   — 800m, 1500m, 3000m (tiada lorong tetap)
 *   padang_lompat— Lompat jauh, tinggi, kijang (giliran, cubaan)
 *   padang_balin — Peluru, cakera, lembing, tukul (giliran, cubaan)
 *   relay        — 4x100m, 4x400m (pasukan, 4 atlet)
 *
 * aceraId format: ACR-[KODACARA]-[JANTINA]-[KATEGORI]
 * Contoh: ACR-100M-L-A, ACR-LOMPAT_JAUH-P-B
 */

import { useState, useEffect, useCallback } from 'react'
import { seedJadualAcara2026, deleteJadualSeed, deleteAllAcara, JADUAL_2026 } from '../../utils/seedJadual2026'
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, where, writeBatch, getDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'

// ─── Konstanta ────────────────────────────────────────────────────────────────

const JENIS_ACARA = [
  {
    value: 'lorong',
    label: 'Larian Lorong',
    short: 'Lorong',
    contoh: '100m, 200m, 400m, 110mH',
    unit: 's',
    adaLorong: true,
    adaHeat: true,
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  {
    value: 'mass_start',
    label: 'Larian Mass Start',
    short: 'Mass Start',
    contoh: '800m, 1500m, 3000m, 5000m',
    unit: 's',
    adaLorong: false,
    adaHeat: true,
    color: 'bg-cyan-500',
    lightColor: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  },
  {
    value: 'padang_lompat',
    label: 'Padang — Melompat',
    short: 'Lompat',
    contoh: 'Lompat Jauh, Lompat Tinggi, Lompat Kijang',
    unit: 'm',
    adaLorong: false,
    adaHeat: false,
    color: 'bg-green-500',
    lightColor: 'bg-green-50 border-green-200 text-green-700',
  },
  {
    value: 'padang_balin',
    label: 'Padang — Membaling',
    short: 'Balin',
    contoh: 'Peluru, Cakera, Lembing, Tukul',
    unit: 'm',
    adaLorong: false,
    adaHeat: false,
    color: 'bg-orange-500',
    lightColor: 'bg-orange-50 border-orange-200 text-orange-700',
  },
  {
    value: 'relay',
    label: 'Relay / Berkumpulan',
    short: 'Relay',
    contoh: '4×100m, 4×400m',
    unit: 's',
    adaLorong: true,
    adaHeat: true,
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50 border-purple-200 text-purple-700',
  },
]

const JANTINA_OPTIONS = [
  { value: 'L', label: 'Lelaki' },
  { value: 'P', label: 'Perempuan' },
]

const CARA_FINAL_OPTIONS = [
  { value: 'hybrid',    label: 'Hybrid', desc: 'Top 1 setiap heat + wildcard best time — STANDARD KOAM' },
  { value: 'best_time', label: 'Best Time', desc: 'Rank semua masa gabungan, top N masuk' },
  { value: 'best_heat', label: 'Best Heat', desc: 'Top N dari setiap heat' },
]

// Seed standard acara MSSM — format: {namaAcara, jenisAcara, kategoriKod, jantina, ...}
const SEED_ACARA_STANDARD = [
  // ── Kategori A (SR, Bawah 10) ──────────────────────────────────────────────
  { namaAcara:'80m',          jenisAcara:'lorong',       kategoriKod:'A', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'80m',          jenisAcara:'lorong',       kategoriKod:'A', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'A', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'A', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'A', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'A', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'A', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'A', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },

  // ── Kategori B (SR, Bawah 12) ──────────────────────────────────────────────
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'B', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'B', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'B', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'B', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'B', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'B', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'B', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'B', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'B', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'B', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'B', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'B', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'B', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'B', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },

  // ── Kategori C (SM, Bawah 14) ─────────────────────────────────────────────
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'C', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'C', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'C', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'C', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'400m',         jenisAcara:'lorong',       kategoriKod:'C', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'400m',         jenisAcara:'lorong',       kategoriKod:'C', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'C', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'C', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'1500m',        jenisAcara:'mass_start',   kategoriKod:'C', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'1500m',        jenisAcara:'mass_start',   kategoriKod:'C', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'C', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'C', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'C', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'C', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'C', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'C', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lembing',      jenisAcara:'padang_balin', kategoriKod:'C', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lembing',      jenisAcara:'padang_balin', kategoriKod:'C', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'C', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'C', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },

  // ── Kategori D (SM, Bawah 16) ─────────────────────────────────────────────
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'D', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'D', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'D', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'D', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'400m',         jenisAcara:'lorong',       kategoriKod:'D', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'400m',         jenisAcara:'lorong',       kategoriKod:'D', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'110m Berpagar',jenisAcara:'lorong',       kategoriKod:'D', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'100m Berpagar',jenisAcara:'lorong',       kategoriKod:'D', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'D', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'D', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'1500m',        jenisAcara:'mass_start',   kategoriKod:'D', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'1500m',        jenisAcara:'mass_start',   kategoriKod:'D', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'3000m',        jenisAcara:'mass_start',   kategoriKod:'D', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'3000m',        jenisAcara:'mass_start',   kategoriKod:'D', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'D', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'D', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'D', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'D', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Kijang',jenisAcara:'padang_lompat',kategoriKod:'D', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'D', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'D', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lembing',      jenisAcara:'padang_balin', kategoriKod:'D', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lembing',      jenisAcara:'padang_balin', kategoriKod:'D', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Cakera',       jenisAcara:'padang_balin', kategoriKod:'D', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'D', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'D', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x400m',       jenisAcara:'relay',        kategoriKod:'D', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x400m',       jenisAcara:'relay',        kategoriKod:'D', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },

  // ── Kategori E (SM, Bawah 18) — sama D + 5000m ────────────────────────────
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'E', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'100m',         jenisAcara:'lorong',       kategoriKod:'E', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'E', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'200m',         jenisAcara:'lorong',       kategoriKod:'E', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'400m',         jenisAcara:'lorong',       kategoriKod:'E', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'400m',         jenisAcara:'lorong',       kategoriKod:'E', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'110m Berpagar',jenisAcara:'lorong',       kategoriKod:'E', jantina:'L', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'100m Berpagar',jenisAcara:'lorong',       kategoriKod:'E', jantina:'P', bilanganLorong:8, isWindReading:true,  hadAtletPerSekolah:2, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'E', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'800m',         jenisAcara:'mass_start',   kategoriKod:'E', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'1500m',        jenisAcara:'mass_start',   kategoriKod:'E', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'1500m',        jenisAcara:'mass_start',   kategoriKod:'E', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'3000m',        jenisAcara:'mass_start',   kategoriKod:'E', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'3000m',        jenisAcara:'mass_start',   kategoriKod:'E', jantina:'P', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'5000m',        jenisAcara:'mass_start',   kategoriKod:'E', jantina:'L', isWindReading:false, hadAtletPerSekolah:2, bilanganFinalis:12, caraPilihFinal:'best_time', wildcardSlot:0 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'E', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Jauh',  jenisAcara:'padang_lompat',kategoriKod:'E', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'E', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Tinggi',jenisAcara:'padang_lompat',kategoriKod:'E', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lompat Kijang',jenisAcara:'padang_lompat',kategoriKod:'E', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:true,  hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'E', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lontar Peluru',jenisAcara:'padang_balin', kategoriKod:'E', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lembing',      jenisAcara:'padang_balin', kategoriKod:'E', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Lembing',      jenisAcara:'padang_balin', kategoriKod:'E', jantina:'P', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'Cakera',       jenisAcara:'padang_balin', kategoriKod:'E', jantina:'L', bilanganCubaan:3, topFinalis:8, isWindReading:false, hadAtletPerSekolah:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'E', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x100m',       jenisAcara:'relay',        kategoriKod:'E', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x400m',       jenisAcara:'relay',        kategoriKod:'E', jantina:'L', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
  { namaAcara:'4x400m',       jenisAcara:'relay',        kategoriKod:'E', jantina:'P', bilanganLorong:8, isWindReading:false, hadAtletPerSekolah:1, bilanganFinalis:8, caraPilihFinal:'hybrid', wildcardSlot:2 },
]

const WA_CONFIG_DEFAULT = {
  windLimit: 2.0,
  falseStartRule: 'one',
  timeSystem: 'electronic',
  handTimeAdjustSprint: 0.24,
  handTimeAdjustOther: 0.14,
  cubaan: { peringkatAwal: 3, peringkatAkhir: 3, topFinalis: 8 },
  lorongStandard: 8,
  caraPilihFinal: 'hybrid',
  wildcardSlot: 2,
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003399]/25 focus:border-[#003399] bg-gray-50'

// ─── Auto-detect helpers ──────────────────────────────────────────────────────

function detectJenisFromNama(nama) {
  const n = nama.toLowerCase()
  if (/\d\s*x\s*\d|4\s*x/.test(n)) return 'relay'
  if (/jalan kaki|3000|5000|1500|800/.test(n)) return 'mass_start'
  if (/lompat jauh|lompat kijang|lompat tinggi/.test(n)) return 'padang_lompat'
  if (/lontar|lempar|rejam|peluru|cakera|lembing/.test(n)) return 'padang_balin'
  return 'lorong'
}
function detectWindFromNama(nama) {
  const n = nama.toLowerCase()
  return /100\s*m|200\s*m|lompat jauh|lompat kijang/.test(n)
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function JenisBadge({ jenis }) {
  const j = JENIS_ACARA.find(x => x.value === jenis)
  if (!j) return null
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${j.lightColor}`}>
      {j.short}
    </span>
  )
}

function JantinaBadge({ jantina }) {
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
      jantina === 'L' ? 'bg-blue-100 text-blue-700'
      : jantina === 'P' ? 'bg-pink-100 text-pink-700'
      : 'bg-gray-100 text-gray-600'
    }`}>{jantina}</span>
  )
}

const FormField = ({ label, hint, required, children }) => (
  <div>
    <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
  </div>
)

// ─── WA Config Panel ──────────────────────────────────────────────────────────

function WaConfigPanel({ kejohananId }) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState(WA_CONFIG_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open || !kejohananId) return
    getDoc(doc(db, 'wa_config', kejohananId)).then(d => {
      if (d.exists()) setCfg({ ...WA_CONFIG_DEFAULT, ...d.data() })
    })
  }, [open, kejohananId])

  const set = (k, v) => setCfg(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!kejohananId) return
    setSaving(true)
    try {
      await setDoc(doc(db, 'wa_config', kejohananId), { ...cfg, updatedAt: serverTimestamp() }, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#003399] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="text-xs font-bold text-gray-700">WA Config — Tetapan Peraturan Kejohanan</span>
          {!kejohananId && <span className="text-[10px] text-orange-500 font-semibold">Pilih kejohanan dahulu</span>}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && kejohananId && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3">

            <FormField label="Had Angin (m/s)" hint="Rekod sah jika ≤ had ini">
              <input type="number" step="0.1" value={cfg.windLimit}
                onChange={e => set('windLimit', parseFloat(e.target.value))} className={inputCls} />
            </FormField>

            <FormField label="False Start" hint="one=terus DQ, two=amaran dulu">
              <select value={cfg.falseStartRule} onChange={e => set('falseStartRule', e.target.value)} className={inputCls}>
                <option value="one">1 FS = terus DQ (WA standard)</option>
                <option value="two">2 FS = DQ (sekolah)</option>
              </select>
            </FormField>

            <FormField label="Sistem Masa">
              <select value={cfg.timeSystem} onChange={e => set('timeSystem', e.target.value)} className={inputCls}>
                <option value="electronic">Elektronik (FAT)</option>
                <option value="manual">Manual (jam tangan)</option>
              </select>
            </FormField>

            <FormField label="Cara Pilih Finalis" hint="Standard KOAM = hybrid">
              <select value={cfg.caraPilihFinal} onChange={e => set('caraPilihFinal', e.target.value)} className={inputCls}>
                {CARA_FINAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormField>

            <FormField label="Wildcard Slots" hint="Untuk cara hybrid">
              <input type="number" min={0} value={cfg.wildcardSlot}
                onChange={e => set('wildcardSlot', parseInt(e.target.value))} className={inputCls} />
            </FormField>

            <FormField label="Standard Lorong" hint="Bilangan lorong trek">
              <input type="number" min={4} max={10} value={cfg.lorongStandard}
                onChange={e => set('lorongStandard', parseInt(e.target.value))} className={inputCls} />
            </FormField>

            <FormField label="Cubaan Peringkat Awal" hint="Padang — semua peserta">
              <input type="number" min={1} value={cfg.cubaan?.peringkatAwal ?? 3}
                onChange={e => set('cubaan', { ...cfg.cubaan, peringkatAwal: parseInt(e.target.value) })} className={inputCls} />
            </FormField>

            <FormField label="Cubaan Peringkat Akhir" hint="Padang — top finalis">
              <input type="number" min={1} value={cfg.cubaan?.peringkatAkhir ?? 3}
                onChange={e => set('cubaan', { ...cfg.cubaan, peringkatAkhir: parseInt(e.target.value) })} className={inputCls} />
            </FormField>

            <FormField label="Top Finalis Padang" hint="Berapa masuk peringkat akhir">
              <input type="number" min={1} value={cfg.cubaan?.topFinalis ?? 8}
                onChange={e => set('cubaan', { ...cfg.cubaan, topFinalis: parseInt(e.target.value) })} className={inputCls} />
            </FormField>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
              {saving ? 'Menyimpan…' : 'Simpan WA Config'}
            </button>
            {saved && <span className="text-xs text-green-600 font-semibold">Tersimpan!</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AcaraModal ───────────────────────────────────────────────────────────────

function AcaraModal({ mode, initial, kejohananId, onClose, onSaved, kategoriList = [] }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState({
    noAcara:        initial?.noAcara        || '',
    namaAcaraPendek:initial?.namaAcaraPendek || '',
    jantina:        initial?.jantina        || 'L',
    kategoriKod:    initial?.kategoriKod    || '',
    tarikhAcara:    initial?.tarikhAcara    || '',
    masa:           initial?.masa           || '',
    lokasi:         initial?.lokasi         || 'Trek Utama',
    peringkat:      initial?.peringkat      || 'akhir',
    bilanganHeat:   initial?.bilanganHeat   || 1,
    sesi:           initial?.sesi           || 'Pagi',
    jenisAcara:     initial?.jenisAcara     || 'lorong',
    bilanganLorong: initial?.bilanganLorong || 8,
    bilanganFinalis:initial?.bilanganFinalis|| 8,
    caraPilihFinal: initial?.caraPilihFinal || 'hybrid',
    wildcardSlot:   initial?.wildcardSlot   || 2,
    bilanganCubaan: initial?.bilanganCubaan || 4,
    hadAtletPerSekolah: initial?.hadAtletPerSekolah || 2,
    isWindReading:  initial?.isWindReading  ?? false,
    jenisManual:    false,
    windManual:     false,
    showAdvanced:   false,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-detect jenis & wind dari nama acara
  useEffect(() => {
    if (!form.jenisManual && form.namaAcaraPendek) {
      const jenis = detectJenisFromNama(form.namaAcaraPendek)
      const wind  = detectWindFromNama(form.namaAcaraPendek)
      setForm(f => ({
        ...f,
        jenisAcara:   jenis,
        isWindReading: f.windManual ? f.isWindReading : wind,
      }))
    }
  }, [form.namaAcaraPendek, form.jenisManual])

  const selectedKat   = kategoriList.find(k => k.kod === form.kategoriKod)
  const umurLabel     = selectedKat ? `Bwh ${selectedKat.umurHad}` : form.kategoriKod
  const kelas         = form.kategoriKod ? `${form.jantina} ${umurLabel}` : form.jantina
  const namaAcaraFull = `${form.namaAcaraPendek} ${kelas}`.trim()
  const adaHeat       = form.peringkat === 'saringan_akhir'
  const isPadang      = ['padang_lompat', 'padang_balin'].includes(form.jenisAcara)
  const isLorong      = ['lorong', 'relay'].includes(form.jenisAcara)
  const jInfo         = JENIS_ACARA.find(j => j.value === form.jenisAcara)

  const oldNoAcara  = isEdit ? String(initial?.noAcara || initial?.aceraId || initial?.id || '').trim() : ''
  const noAcaraBeza = isEdit && String(form.noAcara).trim() !== oldNoAcara

  async function handleSave() {
    setErr('')
    const newDocId = String(form.noAcara).trim()
    if (!newDocId)                       return setErr('No Acara wajib diisi.')
    if (!form.namaAcaraPendek.trim())    return setErr('Nama Acara wajib diisi.')
    if (!form.kategoriKod)               return setErr('Kategori wajib dipilih.')
    if (!form.tarikhAcara)               return setErr('Tarikh wajib dipilih.')
    if (!form.masa)                      return setErr('Masa wajib diisi.')
    if (!kejohananId)                    return setErr('Tiada kejohanan dipilih.')

    const isMove = isEdit && noAcaraBeza
    setSaving(true)
    try {
      const newRef = doc(db, 'kejohanan', kejohananId, 'acara', newDocId)

      // Block duplikat untuk Tambah dan Move
      if (!isEdit || isMove) {
        const snap = await getDoc(newRef)
        if (snap.exists()) {
          setSaving(false)
          return setErr(`No Acara "${newDocId}" sudah wujud. Pilih nombor lain.`)
        }
      }

      const kategoriKod = form.kategoriKod
      const payload = {
        noAcara:           newDocId,
        aceraId:           newDocId,
        namaAcara:         namaAcaraFull,
        namaAcaraPendek:   form.namaAcaraPendek.trim(),
        kelas,
        jantina:           form.jantina,
        kategoriKod,
        jenisAcara:        form.jenisAcara,
        tarikhAcara:       form.tarikhAcara,
        masa:              form.masa,
        lokasi:            form.lokasi,
        sesi:              form.sesi,
        peringkat:         form.peringkat,
        adaHeat,
        bilanganHeat:      adaHeat ? Number(form.bilanganHeat) : 0,
        isWindReading:     !!form.isWindReading,
        unitUkuran:        isPadang ? 'm' : 's',
        bilanganLorong:    isLorong ? Number(form.bilanganLorong) : null,
        bilanganFinalis:   Number(form.bilanganFinalis),
        caraPilihFinal:    form.caraPilihFinal,
        wildcardSlot:      form.caraPilihFinal === 'hybrid' ? Number(form.wildcardSlot) : 0,
        bilanganCubaan:    isPadang ? Number(form.bilanganCubaan) : 0,
        hadAtletPerSekolah:Number(form.hadAtletPerSekolah),
        statusAcara:       isEdit ? (initial?.statusAcara || 'akan_datang') : 'akan_datang',
        updatedAt:         serverTimestamp(),
        ...(!isEdit ? { createdAt: serverTimestamp() } : {}),
      }
      const jadualPayload = {
        aceraId: newDocId, acaraId: newDocId, kejohananId,
        tarikhAcara: form.tarikhAcara, masaMula: form.masa,
        lokasi: form.lokasi, sesi: form.sesi,
        statusJadual: 'aktif', namaAcara: namaAcaraFull,
        updatedAt: serverTimestamp(),
      }

      if (isMove) {
        // 1. Cipta acara baru
        await setDoc(newRef, payload)

        // 2. Salin semua heat + padam yang lama
        const heatsSnap = await getDocs(collection(db, 'kejohanan', kejohananId, 'acara', oldNoAcara, 'heat'))
        const ops = []
        heatsSnap.docs.forEach(hd => {
          ops.push({ t:'s', ref: doc(db, 'kejohanan', kejohananId, 'acara', newDocId, 'heat', hd.id), data: hd.data() })
          ops.push({ t:'d', ref: hd.ref })
        })
        ops.push({ t:'d', ref: doc(db, 'kejohanan', kejohananId, 'acara', oldNoAcara) })
        ops.push({ t:'d', ref: doc(db, 'jadual_acara', `${kejohananId}-${oldNoAcara}`) })

        for (let i = 0; i < ops.length; i += 400) {
          const batch = writeBatch(db)
          ops.slice(i, i + 400).forEach(o => o.t === 's' ? batch.set(o.ref, o.data) : batch.delete(o.ref))
          await batch.commit()
        }

        // 3. Cipta jadual_acara baru
        await setDoc(doc(db, 'jadual_acara', `${kejohananId}-${newDocId}`), jadualPayload)

      } else if (isEdit) {
        await setDoc(newRef, payload, { merge: true })
        await setDoc(doc(db, 'jadual_acara', `${kejohananId}-${newDocId}`), jadualPayload, { merge: true })
      } else {
        await setDoc(newRef, payload)
        await setDoc(doc(db, 'jadual_acara', `${kejohananId}-${newDocId}`), jadualPayload)
      }

      onSaved()
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-800">{isEdit ? 'Edit Acara' : 'Tambah Acara'}</h2>
            {namaAcaraFull && (
              <p className="text-[10px] font-mono text-[#003399] mt-0.5">{namaAcaraFull}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* 1 — No Acara + Masa */}
          {noAcaraBeza && (
            <div className="bg-orange-50 border border-orange-300 rounded-lg px-3 py-2 text-[11px] text-orange-700">
              ⚠️ No Acara bertukar <strong>{oldNoAcara} → {form.noAcara}</strong> — semua heat akan dipindah ke nombor baru secara automatik.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="No Acara" required
              hint={isEdit ? (noAcaraBeza ? '' : 'Tukar = pindah semua data ke nombor baru') : ''}>
              <input type="text" inputMode="numeric" value={form.noAcara}
                onChange={e => set('noAcara', e.target.value.replace(/\D/g, ''))}
                placeholder="101"
                className={inputCls + (noAcaraBeza ? ' border-orange-400 bg-orange-50/50' : '')} />
            </FormField>
            <FormField label="Masa" required>
              <input type="time" value={form.masa}
                onChange={e => set('masa', e.target.value)} className={inputCls} />
            </FormField>
          </div>

          {/* 2 — Nama Acara */}
          <FormField label="Nama Acara" required hint="Cth: 100 Meter, Lompat Jauh, 4 x 100 Meter">
            <input value={form.namaAcaraPendek}
              onChange={e => set('namaAcaraPendek', e.target.value)}
              placeholder="100 Meter" className={inputCls} />
          </FormField>

          {/* 3 — Kelas = Jantina + Umur */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Kelas <span className="text-red-400">*</span>
              <span className="ml-2 font-mono text-[#003399] normal-case tracking-normal">{kelas}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] text-gray-400 mb-1">Jantina</p>
                <div className="flex gap-1.5 h-[38px]">
                  {[{v:'L'},{v:'P'},{v:'Campuran'}].map(o => (
                    <button key={o.v} type="button" onClick={() => set('jantina', o.v)}
                      className={`flex-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        form.jantina === o.v
                          ? o.v === 'L' ? 'bg-blue-600 text-white border-blue-600'
                          : o.v === 'P' ? 'bg-pink-500 text-white border-pink-500'
                          : 'bg-purple-500 text-white border-purple-500'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}>{o.v}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-gray-400 mb-1">Kategori</p>
                <select value={form.kategoriKod} onChange={e => set('kategoriKod', e.target.value)} className={inputCls}>
                  <option value="">— Pilih Kategori —</option>
                  {kategoriList.map(k => (
                    <option key={k.kod} value={k.kod}>
                      Kat {k.kod} — {k.nama || k.jenisSekolah} (Bwh {k.umurHad} thn)
                    </option>
                  ))}
                </select>
                {selectedKat && (
                  <p className="text-[9px] text-green-600 mt-0.5">{selectedKat.jenisSekolah} · Umur {selectedKat.umurMin}–{selectedKat.umurHad}</p>
                )}
              </div>
            </div>
          </div>

          {/* 4 — Peringkat */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Peringkat <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v:'akhir',          l:'Akhir',           d:'Terus final, tiada saringan' },
                { v:'saringan_akhir', l:'Saringan + Akhir', d:'Ada heat saringan sebelum final' },
              ].map(o => (
                <button key={o.v} type="button" onClick={() => set('peringkat', o.v)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    form.peringkat === o.v ? 'border-[#003399] bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <p className="text-xs font-bold text-gray-700">{o.l}</p>
                  <p className="text-[9px] text-gray-400">{o.d}</p>
                </button>
              ))}
            </div>
            {adaHeat && (
              <div className="mt-2">
                <FormField label="Bilangan Heat Saringan">
                  <input type="number" min={1} max={20} value={form.bilanganHeat}
                    onChange={e => set('bilanganHeat', e.target.value)} className={inputCls} />
                </FormField>
              </div>
            )}
          </div>

          {/* 5 — Tarikh + Lokasi */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tarikh" required>
              <input type="date" value={form.tarikhAcara}
                onChange={e => set('tarikhAcara', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="Lokasi">
              <select value={form.lokasi} onChange={e => set('lokasi', e.target.value)} className={inputCls}>
                {['Trek Utama','Padang A','Padang B','Padang C','Padang D','Gelanggang'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </FormField>
          </div>

          {/* 6 — Jenis auto-detect badge + Tetapan Lanjutan */}
          <div className={`rounded-xl px-3 py-2.5 flex items-center gap-2.5 border ${jInfo ? jInfo.lightColor : 'bg-gray-50 border-gray-100'}`}>
            {jInfo && <span className="text-[10px] font-black">{jInfo.short}</span>}
            <p className="text-[10px] text-gray-500 flex-1">Auto-detect dari nama acara</p>
            {form.isWindReading && <span className="text-[10px] text-sky-600 font-semibold">💨 Wind</span>}
            <button type="button" onClick={() => set('showAdvanced', !form.showAdvanced)}
              className="text-[10px] text-[#003399] font-bold underline">
              {form.showAdvanced ? 'Tutup' : 'Tetapan Lanjutan'}
            </button>
          </div>

          {form.showAdvanced && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/40">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tetapan Lanjutan</p>

              <FormField label="Jenis Acara (Override)">
                <div className="grid grid-cols-3 gap-1.5">
                  {JENIS_ACARA.map(j => (
                    <button key={j.value} type="button"
                      onClick={() => { set('jenisAcara', j.value); set('jenisManual', true) }}
                      className={`p-2 rounded-lg border text-[10px] font-bold text-left transition-all ${
                        form.jenisAcara === j.value ? `${j.lightColor} border-current` : 'bg-white border-gray-200'
                      }`}>{j.short}</button>
                  ))}
                </div>
              </FormField>

              {isLorong && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Bilangan Lorong">
                    <input type="number" min={4} max={10} value={form.bilanganLorong}
                      onChange={e => set('bilanganLorong', e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="Bilangan Finalis">
                    <input type="number" min={2} value={form.bilanganFinalis}
                      onChange={e => set('bilanganFinalis', e.target.value)} className={inputCls} />
                  </FormField>
                </div>
              )}

              {isPadang && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Bilangan Cubaan">
                    <input type="number" min={1} value={form.bilanganCubaan}
                      onChange={e => set('bilanganCubaan', e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="Had Atlet / Sekolah">
                    <input type="number" min={1} value={form.hadAtletPerSekolah}
                      onChange={e => set('hadAtletPerSekolah', e.target.value)} className={inputCls} />
                  </FormField>
                </div>
              )}

              <label className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-gray-700">Perlu Catat Angin</p>
                  <p className="text-[10px] text-gray-400">Wind reading wajib sebelum keputusan rasmi</p>
                </div>
                <button type="button" onClick={() => { set('isWindReading', !form.isWindReading); set('windManual', true) }}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${form.isWindReading ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.isWindReading ? 'translateX(18px)' : 'translateX(2px)' }} />
                </button>
              </label>
            </div>
          )}

          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50">
            {saving ? 'Menyimpan…' : isEdit ? (noAcaraBeza ? 'Pindah & Kemaskini' : 'Kemaskini') : 'Tambah Acara'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({ acara, kejohananId, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  async function handleDelete() {
    setDeleting(true)
    try {
      const aceraKey = acara.noAcara || acara.aceraId || acara.id
      const batch = writeBatch(db)
      batch.delete(doc(db, 'kejohanan', kejohananId, 'acara', aceraKey))
      batch.delete(doc(db, 'jadual_acara', `${kejohananId}-${aceraKey}`))
      await batch.commit()
      onDeleted(); onClose()
    } catch (e) { alert(e.message); setDeleting(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 text-center">
        <div className="w-11 h-11 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">Padam Acara?</h3>
        <p className="text-xs text-gray-500 mb-1 font-mono text-[10px]">{acara.aceraId}</p>
        <p className="text-xs text-gray-500 mb-4">Semua data heat dan keputusan dalam acara ini turut akan dipadam.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Batal</button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-2 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
            {deleting ? 'Memadamkan…' : 'Padam'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SeedPanel ────────────────────────────────────────────────────────────────

function SeedPanel({ kejohananId, kategoriList, onSeeded }) {
  const [open, setOpen] = useState(false)
  const [filterKat, setFilterKat] = useState('semua')
  const [seeding, setSeeding] = useState(false)
  const [done, setDone] = useState(false)

  const katList = [...new Set(SEED_ACARA_STANDARD.map(a => a.kategoriKod))]
  const filtered = filterKat === 'semua' ? SEED_ACARA_STANDARD
    : SEED_ACARA_STANDARD.filter(a => a.kategoriKod === filterKat)

  // Only seed acara for kategori that exist in Firestore
  const availableKat = new Set(kategoriList.map(k => k.kod))

  async function handleSeed() {
    if (!kejohananId) return alert('Pilih kejohanan dahulu.')
    setSeeding(true)
    try {
      const toSeed = (filterKat === 'semua' ? SEED_ACARA_STANDARD : filtered)
        .filter(a => availableKat.has(a.kategoriKod))

      // Batch write (max 500 per batch)
      const chunks = []
      for (let i = 0; i < toSeed.length; i += 400) chunks.push(toSeed.slice(i, i + 400))

      for (const chunk of chunks) {
        const batch = writeBatch(db)
        for (const a of chunk) {
          const aceraId = buatAceraId(a.namaAcara, a.jantina, a.kategoriKod)
          if (!aceraId) continue
          const ref = doc(db, 'kejohanan', kejohananId, 'acara', aceraId)
          batch.set(ref, {
            aceraId,
            namaAcara: a.namaAcara,
            jenisAcara: a.jenisAcara,
            kategoriKod: a.kategoriKod,
            jantina: a.jantina,
            unitUkuran: a.jenisAcara === 'padang_lompat' || a.jenisAcara === 'padang_balin' ? 'm' : 's',
            isRelay: a.jenisAcara === 'relay',
            isWindReading: !!a.isWindReading,
            isAktif: true,
            statusAcara: 'belum_mula',
            hadAtletPerSekolah: a.hadAtletPerSekolah ?? 2,
            minPeserta: 3,
            bilanganLorong: a.bilanganLorong ?? null,
            caraPilihFinal: a.caraPilihFinal ?? 'hybrid',
            bilanganFinalis: a.bilanganFinalis ?? 8,
            wildcardSlot: a.wildcardSlot ?? 2,
            bilanganCubaan: a.bilanganCubaan ?? null,
            topFinalis: a.topFinalis ?? null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true })
        }
        await batch.commit()
      }
      setDone(true)
      onSeeded()
    } catch (e) { alert('Ralat: ' + e.message) } finally { setSeeding(false) }
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-xl bg-gray-50 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
        <span>Muat Masuk Acara Standard MSSM Malaysia ({SEED_ACARA_STANDARD.length} acara)</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {!kejohananId && (
            <p className="text-xs text-orange-600 font-semibold">Pilih kejohanan dahulu sebelum muat masuk.</p>
          )}

          {/* Warning: standard kods missing */}
          {(() => {
            const standardKods = ['A','B','C','D','E','PPKI']
            const missing = standardKods.filter(k => !availableKat.has(k))
            if (missing.length === 0) return null
            return (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-xs font-bold text-red-700">Kategori tidak dijumpai: {missing.map(k => `Kat ${k}`).join(', ')}</p>
                  <p className="text-[10px] text-red-500 mt-0.5">
                    Acara untuk kategori ini tidak akan disemai. Pergi ke <strong>Setup Kategori</strong> dan pastikan kod kategori adalah tepat (<strong>A, B, C, D, E, PPKI</strong>). Kod tidak boleh ditukar selepas dicipta.
                  </p>
                </div>
              </div>
            )
          })()}

          {/* Filter by kat */}
          <div className="flex flex-wrap gap-1.5">
            {['semua', ...katList].map(k => (
              <button key={k} onClick={() => setFilterKat(k)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-colors ${
                  filterKat === k ? 'bg-[#003399] text-white border-[#003399]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}>
                {k === 'semua' ? 'Semua' : `Kat ${k}`}
              </button>
            ))}
          </div>

          {/* Mini table */}
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left font-bold text-gray-500">Acara</th>
                  <th className="px-2 py-1 text-center font-bold text-gray-500">Kat</th>
                  <th className="px-2 py-1 text-center font-bold text-gray-500">J</th>
                  <th className="px-2 py-1 text-left font-bold text-gray-500">Jenis</th>
                  <th className="px-2 py-1 text-center font-bold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => {
                  const katWujud = availableKat.has(a.kategoriKod)
                  return (
                    <tr key={i} className={`border-b border-gray-100 ${!katWujud ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-1 font-semibold text-gray-700">{a.namaAcara}</td>
                      <td className="px-2 py-1 text-center font-bold text-[#003399]">{a.kategoriKod}</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`font-black ${a.jantina === 'L' ? 'text-blue-600' : 'text-pink-600'}`}>{a.jantina}</span>
                      </td>
                      <td className="px-2 py-1">
                        <JenisBadge jenis={a.jenisAcara} />
                      </td>
                      <td className="px-2 py-1 text-center">
                        {katWujud
                          ? <span className="text-[9px] text-green-600 font-bold">✓</span>
                          : <span className="text-[9px] text-red-500 font-bold">✗ Tiada Kat</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-gray-400">
            Baris ✗ = kategori tiada dalam sistem — tidak akan disemai. Tambah kategori dengan kod yang betul dahulu.
          </p>

          {done && <p className="text-xs text-green-600 font-semibold">Berjaya dimuat masuk!</p>}
          <button onClick={handleSeed} disabled={seeding || !kejohananId}
            className="px-4 py-1.5 text-xs font-bold bg-[#003399] text-white rounded-lg hover:bg-[#002288] disabled:opacity-50 transition-colors">
            {seeding ? 'Memuat masuk…' : `Muat Masuk ${filterKat === 'semua' ? 'Semua' : `Kat ${filterKat}`} (${filtered.filter(a => availableKat.has(a.kategoriKod)).length} acara)`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MigratePanel ────────────────────────────────────────────────────────────

const VALID_KAT = new Set(['A','B','C','D','E','PPKI'])

function guessKategoriKod(kategoriUmur, kategoriList) {
  if (!kategoriUmur) return null
  if (kategoriUmur === 'Terbuka') {
    return kategoriList.find(k => k.kod === 'E')?.kod || null
  }
  const umur = parseInt(kategoriUmur)
  if (isNaN(umur)) return null
  // Exact match on umurHad
  const exact = kategoriList.find(k => k.umurHad === umur)
  if (exact) return exact.kod
  // Range match
  const range = kategoriList.find(k => umur >= (k.umurMin || 0) && umur <= k.umurHad)
  return range?.kod || null
}

function MigratePanel({ kejohananId, kategoriList, onMigrated }) {
  const [open,     setOpen]     = useState(false)
  const [scanning, setScanning] = useState(false)
  const [rows,     setRows]     = useState(null)   // null = belum scan
  const [migrating,setMigrating]= useState(false)
  const [done,     setDone]     = useState(false)

  async function handleScan() {
    if (!kejohananId) return alert('Pilih kejohanan dahulu.')
    setScanning(true)
    setDone(false)
    try {
      const snap = await getDocs(collection(db, 'kejohanan', kejohananId, 'acara'))
      const rosak = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a => !VALID_KAT.has(a.kategoriKod))
        .map(a => ({
          ...a,
          cadanganKod: guessKategoriKod(a.kategoriUmur, kategoriList),
        }))
      setRows(rosak)
    } catch (e) { alert('Ralat scan: ' + e.message) } finally { setScanning(false) }
  }

  async function handleMigrate() {
    if (!rows?.length) return
    const boleh = rows.filter(r => r.cadanganKod)
    if (!boleh.length) return alert('Tiada acara yang boleh di-migrate secara automatik.')
    if (!window.confirm(`Migrate ${boleh.length} acara? Tindakan ini akan tukar kategoriKod dalam Firestore.`)) return
    setMigrating(true)
    try {
      const chunks = []
      for (let i = 0; i < boleh.length; i += 400) chunks.push(boleh.slice(i, i + 400))
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        for (const a of chunk) {
          const ref = doc(db, 'kejohanan', kejohananId, 'acara', a.id)
          batch.update(ref, { kategoriKod: a.cadanganKod })
        }
        await batch.commit()
      }
      setDone(true)
      setRows(null)
      onMigrated()
    } catch (e) { alert('Ralat migrate: ' + e.message) } finally { setMigrating(false) }
  }

  const tiadaCadangan = rows?.filter(r => !r.cadanganKod) || []
  const bolehMigrate  = rows?.filter(r =>  r.cadanganKod) || []

  return (
    <div className="border border-dashed border-orange-300 rounded-xl bg-orange-50/40 overflow-hidden">
      <button onClick={() => { setOpen(o => !o); if (!open && !rows) handleScan() }}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-orange-700 hover:bg-orange-50 transition-colors">
        <span>Migrate Acara Lama (kategoriKod: SR/SM → A/B/C/D/E)</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[10px] text-orange-600">
            Acara lama yang disimpan dengan <code className="bg-orange-100 px-1 rounded">kategoriKod:'SR'</code> atau <code className="bg-orange-100 px-1 rounded">'SM'</code>
            akan dikesan dan dicadangkan kategori MSSM yang betul berdasarkan umur.
          </p>

          {scanning && <p className="text-xs text-gray-500 animate-pulse">Mengimbas acara…</p>}

          {done && (
            <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold">
              Migration selesai! Acara telah dikemaskini.
            </div>
          )}

          {rows !== null && !scanning && (
            rows.length === 0 ? (
              <p className="text-xs text-green-600 font-semibold">Semua acara sudah ada kategoriKod yang betul.</p>
            ) : (
              <>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-orange-200">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-orange-100">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-bold text-orange-700">No</th>
                        <th className="px-2 py-1.5 text-left font-bold text-orange-700">Acara</th>
                        <th className="px-2 py-1.5 text-center font-bold text-orange-700">Umur</th>
                        <th className="px-2 py-1.5 text-center font-bold text-orange-700">Lama</th>
                        <th className="px-2 py-1.5 text-center font-bold text-orange-700">→ Baru</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className={`border-b border-orange-100 ${!r.cadanganKod ? 'bg-red-50' : ''}`}>
                          <td className="px-2 py-1 font-mono text-gray-500">{r.noAcara || r.id}</td>
                          <td className="px-2 py-1 text-gray-700">{r.namaAcara || r.namaAcaraPendek}</td>
                          <td className="px-2 py-1 text-center text-gray-500">{r.kategoriUmur || '—'}</td>
                          <td className="px-2 py-1 text-center">
                            <span className="font-bold text-red-600">{r.kategoriKod || '—'}</span>
                          </td>
                          <td className="px-2 py-1 text-center">
                            {r.cadanganKod
                              ? <span className="font-bold text-green-700">Kat {r.cadanganKod}</span>
                              : <span className="text-[9px] text-red-500 font-bold">⚠ Manual</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {tiadaCadangan.length > 0 && (
                  <p className="text-[10px] text-red-600">
                    ⚠ {tiadaCadangan.length} acara bertanda "Manual" — edit secara manual selepas migrate.
                  </p>
                )}

                <div className="flex gap-2">
                  <button onClick={handleScan} disabled={scanning}
                    className="px-3 py-1.5 text-[10px] font-bold border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50">
                    Imbas Semula
                  </button>
                  {bolehMigrate.length > 0 && (
                    <button onClick={handleMigrate} disabled={migrating}
                      className="px-4 py-1.5 text-xs font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
                      {migrating ? 'Migrating…' : `Migrate ${bolehMigrate.length} Acara`}
                    </button>
                  )}
                </div>
              </>
            )
          )}

          {!scanning && rows === null && (
            <button onClick={handleScan} disabled={!kejohananId}
              className="px-4 py-1.5 text-xs font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">
              Imbas Acara
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── VerifikasiPanel ──────────────────────────────────────────────────────────

const HARI_TARIKH = { 1:'2026-06-28', 2:'2026-06-29', 3:'2026-06-30', 4:'2026-07-01', 5:'2026-07-02' }

function VerifikasiPanel({ acaraList, kejohananId, onRefresh }) {
  const [open,    setOpen]    = useState(false)
  const [filter,  setFilter]  = useState('masalah') // 'masalah' | 'ok' | 'beza' | 'tiada' | 'extra' | 'semua'
  const [seeding, setSeeding] = useState(null)

  // Build lookup maps
  const jadualMap    = new Map(JADUAL_2026.map(e => [String(e[0]), { noAcara:String(e[0]), masa:e[1], namaAcara:e[2], kelas:e[3], peringkat:e[4], hari:e[5], sesi:e[6], lokasi:e[7] }]))
  const firestoreMap = new Map(acaraList.map(a => [String(a.noAcara || a.id), a]))

  const allNos = new Set([...jadualMap.keys(), ...firestoreMap.keys()])
  const rows = [...allNos].sort((a, b) => Number(a) - Number(b)).map(no => {
    const j = jadualMap.get(no)
    const f = firestoreMap.get(no)
    let status = 'ok', masalah = []
    if (j && f) {
      const fNama = (f.namaAcara || '').trim()
      const fKelas = (f.kelas || '').trim()
      const fMasa = (f.masa || '').trim()
      if (j.namaAcara !== fNama)   masalah.push(`Nama: "${fNama}" ≠ "${j.namaAcara}"`)
      if (j.kelas !== fKelas)      masalah.push(`Kelas: "${fKelas}" ≠ "${j.kelas}"`)
      if (j.masa && j.masa !== fMasa) masalah.push(`Masa: "${fMasa}" ≠ "${j.masa}"`)
      status = masalah.length > 0 ? 'beza' : 'ok'
    } else if (j && !f) {
      status = 'tiada'
    } else {
      status = 'extra'
    }
    return { no, j, f, status, masalah }
  })

  const counts = {
    ok:    rows.filter(r => r.status === 'ok').length,
    beza:  rows.filter(r => r.status === 'beza').length,
    tiada: rows.filter(r => r.status === 'tiada').length,
    extra: rows.filter(r => r.status === 'extra').length,
  }
  const adaMasalah = counts.beza + counts.tiada + counts.extra

  const shown = filter === 'semua'   ? rows
    : filter === 'masalah' ? rows.filter(r => r.status !== 'ok')
    : rows.filter(r => r.status === filter)

  async function seedOne(row) {
    if (!kejohananId || !row.j) return
    setSeeding(row.no)
    try {
      const j = row.j
      const tarikhAcara = HARI_TARIKH[j.hari] || ''
      const acaraPayload = {
        noAcara: j.noAcara, aceraId: j.noAcara,
        namaAcara: j.namaAcara, kelas: j.kelas,
        peringkat: j.peringkat, masa: j.masa,
        lokasi: j.lokasi, sesi: j.sesi, hari: j.hari,
        tarikhAcara,
        jenisAcara:    detectJenisFromNama(j.namaAcara),
        isWindReading: detectWindFromNama(j.namaAcara),
        statusAcara:   'akan_datang',
        isSeedData:    true,
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      }
      await setDoc(doc(db, 'kejohanan', kejohananId, 'acara', j.noAcara), acaraPayload)
      await setDoc(doc(db, 'jadual_acara', `${kejohananId}-${j.noAcara}`), {
        aceraId: j.noAcara, acaraId: j.noAcara, kejohananId,
        tarikhAcara, masaMula: j.masa, lokasi: j.lokasi,
        sesi: j.sesi, namaAcara: j.namaAcara,
        statusJadual: 'aktif', isSeedData: true,
        updatedAt: serverTimestamp(),
      })
      onRefresh()
    } catch (e) { alert('Ralat: ' + e.message) }
    finally { setSeeding(null) }
  }

  const SCFG = {
    ok:    { label:'OK',           cls:'bg-green-100 text-green-700' },
    beza:  { label:'Content Beza', cls:'bg-amber-100 text-amber-700' },
    tiada: { label:'Tiada',        cls:'bg-red-100 text-red-700' },
    extra: { label:'Extra',        cls:'bg-purple-100 text-purple-700' },
  }

  return (
    <div className="border border-dashed border-blue-200 rounded-xl bg-blue-50/20 overflow-hidden mt-3">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
        <span className="flex items-center gap-2 flex-wrap">
          🔍 Semakan Jadual 2026
          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-bold">{JADUAL_2026.length} dijangka</span>
          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[9px] font-bold">{counts.ok} OK</span>
          {counts.tiada > 0 && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[9px] font-bold">{counts.tiada} tiada</span>}
          {counts.beza  > 0 && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold">{counts.beza} beza</span>}
          {counts.extra > 0 && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px] font-bold">{counts.extra} extra</span>}
        </span>
        <svg className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">

          {/* Summary cards — klik untuk tapis */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { k:'masalah', label:'Masalah',      cnt:adaMasalah,   cls:'bg-red-50 text-red-700' },
              { k:'ok',      label:'OK',            cnt:counts.ok,    cls:'bg-green-50 text-green-700' },
              { k:'beza',    label:'Content Beza',  cnt:counts.beza,  cls:'bg-amber-50 text-amber-700' },
              { k:'tiada',   label:'Tiada',         cnt:counts.tiada, cls:'bg-red-50 text-red-700' },
              { k:'extra',   label:'Extra',         cnt:counts.extra, cls:'bg-purple-50 text-purple-700' },
            ].map(s => (
              <button key={s.k} onClick={() => setFilter(s.k === filter ? 'masalah' : s.k)}
                className={`${s.cls} ${filter === s.k ? 'ring-2 ring-current' : 'opacity-70'} rounded-xl px-2 py-2 text-center transition-all hover:opacity-100`}>
                <p className="text-base font-black">{s.cnt}</p>
                <p className="text-[8px] uppercase tracking-wide leading-tight">{s.label}</p>
              </button>
            ))}
          </div>

          {/* Table */}
          {!kejohananId ? (
            <p className="text-xs text-red-600 font-semibold">Pilih kejohanan dahulu.</p>
          ) : shown.length === 0 ? (
            <div className="bg-white rounded-xl border border-green-200 py-6 text-center">
              <p className="text-2xl mb-1">✅</p>
              <p className="text-xs font-bold text-green-700">
                {filter === 'ok' ? `${counts.ok} acara tepat dan lengkap.` : 'Tiada masalah dijumpai!'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-[10px] min-w-[520px]">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-2 text-center text-gray-500 font-bold w-10">No</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-bold">Dijangka (JADUAL_2026)</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-bold">Firestore</th>
                      <th className="px-2 py-2 text-center text-gray-500 font-bold w-20">Status</th>
                      <th className="px-2 py-2 text-center text-gray-500 font-bold w-20">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(row => {
                      const sc = SCFG[row.status]
                      return (
                        <tr key={row.no} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="px-2 py-2 text-center font-mono font-black text-[#003399]">{row.no}</td>
                          <td className="px-2 py-2 max-w-[160px]">
                            {row.j ? (
                              <div>
                                <p className="font-semibold text-gray-700 truncate">{row.j.namaAcara}</p>
                                <p className="text-gray-400 text-[9px]">{row.j.kelas} · {row.j.peringkat} · {row.j.masa}</p>
                              </div>
                            ) : <span className="text-gray-300 italic">—</span>}
                          </td>
                          <td className="px-2 py-2 max-w-[180px]">
                            {row.f ? (
                              <div>
                                <p className={`font-semibold truncate ${row.status === 'beza' ? 'text-amber-700' : 'text-gray-700'}`}>
                                  {row.f.namaAcara || '—'}
                                </p>
                                <p className="text-gray-400 text-[9px]">{row.f.kelas} · {row.f.peringkat} · {row.f.masa}</p>
                                {row.masalah.length > 0 && (
                                  <p className="text-amber-600 text-[9px] mt-0.5 leading-tight">{row.masalah.join(' | ')}</p>
                                )}
                              </div>
                            ) : <span className="text-gray-300 italic">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sc.cls}`}>{sc.label}</span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {row.status === 'tiada' && (
                              <button onClick={() => seedOne(row)} disabled={seeding === row.no || !kejohananId}
                                className="px-2 py-1 text-[9px] font-bold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                                {seeding === row.no ? '…' : '+ Cipta'}
                              </button>
                            )}
                            {row.status === 'beza' && (
                              <span className="text-[9px] text-gray-400">Edit manual</span>
                            )}
                            {row.status === 'extra' && (
                              <span className="text-[9px] text-gray-400">Semak</span>
                            )}
                            {row.status === 'ok' && (
                              <span className="text-[9px] text-green-500">✓</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 px-3 py-1.5 border-t border-gray-100">
                {shown.length} acara dipapar · Klik kad di atas untuk tapis
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SeedJadual2026Panel ──────────────────────────────────────────────────────

function SeedJadual2026Panel({ kejohananId, namaKej, onSeeded }) {
  const [open,    setOpen]    = useState(false)
  const [log,     setLog]     = useState([])
  const [running, setRunning] = useState(false)
  const [done,    setDone]    = useState(false)

  function addLog(msg) { setLog(prev => [...prev, msg]) }

  async function handleSeed() {
    if (!kejohananId) return alert('Pilih kejohanan dahulu.')
    setRunning(true); setDone(false); setLog([])
    try {
      await seedJadualAcara2026(kejohananId, addLog)
      setDone(true)
      onSeeded()
    } catch (e) {
      addLog(`❌ Ralat: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  async function handleDelete() {
    if (!kejohananId) return
    if (!confirm(`Padam semua seed data (${JADUAL_2026.length} acara + jadual)?`)) return
    setRunning(true); setLog([])
    try {
      await deleteJadualSeed(kejohananId, addLog)
      onSeeded()
    } catch (e) {
      addLog(`❌ ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  async function handleDeleteAll() {
    if (!kejohananId) return
    const label = namaKej ? `"${namaKej}"` : kejohananId
    if (!confirm(`⚠️ PADAM SEMUA ACARA dalam kejohanan ${label}?\n\nTermasuk acara manual, seed, dan semua jadual_acara.\n\nTindakan ini tidak boleh dibatalkan.`)) return
    setRunning(true); setLog([])
    try {
      await deleteAllAcara(kejohananId, addLog)
      onSeeded()
    } catch (e) {
      addLog(`❌ ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="border border-dashed border-orange-300 rounded-xl bg-orange-50/30 overflow-hidden mt-3">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-orange-700 hover:bg-orange-50 transition-colors">
        <span>📅 Seed Jadual MSSM Kemaman 2026 ({JADUAL_2026.length} acara + jadual_acara)</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 text-[11px] text-orange-700 space-y-0.5">
            <p className="font-bold">Jadual MSSM Kemaman 2026 — 5 Hari | 9 Sesi</p>
            <p>📅 28 Jun – 2 Julai 2026 | SMK Sultan Ismail, Kemaman</p>
            <p>Akan mencipta <strong>acara</strong> dalam kejohanan + rekod <strong>jadual_acara</strong></p>
            {namaKej && (
              <p className="mt-1 font-bold text-orange-800 border-t border-orange-200 pt-1">
                Kejohanan: {namaKej}
              </p>
            )}
          </div>

          {!kejohananId && (
            <p className="text-xs text-red-600 font-semibold">Pilih kejohanan dahulu.</p>
          )}

          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSeed} disabled={running || !kejohananId}
              className="px-4 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {running ? 'Memuat masuk…' : `Seed ${JADUAL_2026.length} Acara`}
            </button>
            <button onClick={handleDelete} disabled={running || !kejohananId}
              className="px-4 py-1.5 text-xs font-bold bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors">
              Padam Seed
            </button>
            <button onClick={handleDeleteAll} disabled={running || !kejohananId}
              className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              ⚠️ Padam SEMUA Acara
            </button>
          </div>

          {done && <p className="text-xs text-green-600 font-semibold">✅ Seed selesai!</p>}

          {log.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto">
              {log.map((l, i) => (
                <p key={i} className={`text-[10px] font-mono ${
                  l.startsWith('❌') ? 'text-red-400' :
                  l.startsWith('✅') ? 'text-green-400' :
                  l.startsWith('⏭') ? 'text-gray-500' :
                  l.startsWith('📊') ? 'text-cyan-300 font-bold' :
                  'text-gray-300'
                }`}>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Halaman Utama ────────────────────────────────────────────────────────────

export default function AcaraSetup() {
  const [selectedKej, setSelectedKej]     = useState('')
  const [namaKej, setNamaKej]             = useState('')
  const [acaraList, setAcaraList]         = useState([])
  const [kategoriList, setKategoriList]   = useState([])
  const [loading, setLoading]             = useState(false)
  const [modal, setModal]                 = useState(null)
  const [delTarget, setDelTarget]         = useState(null)

  // Filters
  const [filterJenis, setFilterJenis]     = useState('semua')
  const [filterKat, setFilterKat]         = useState('semua')
  const [filterJantina, setFilterJantina] = useState('semua')
  const [search, setSearch]               = useState('')

  // Fetch kejohanan aktif + kategori (sekali)
  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'kejohanan'), where('statusKejohanan', 'in', ['aktif', 'persediaan']))),
      getDocs(query(collection(db, 'kategori'), orderBy('urutan'))),
    ]).then(([kej, kat]) => {
      if (!kej.empty) {
        const d = kej.docs[0]
        setSelectedKej(d.id)
        setNamaKej(d.data().namaKejohanan || '')
      }
      setKategoriList(kat.docs.map(d => ({ id: d.id, ...d.data() })))
    }).catch(() => {})
  }, [])

  // Fetch acara bila kejohanan berubah
  const fetchAcara = useCallback(async () => {
    if (!selectedKej) { setAcaraList([]); return }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'kejohanan', selectedKej, 'acara'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const na = Number(a.noAcara || a.id) || 0
        const nb = Number(b.noAcara || b.id) || 0
        return na - nb
      })
      setAcaraList(list)
    } catch { setAcaraList([]) } finally { setLoading(false) }
  }, [selectedKej])

  useEffect(() => { fetchAcara() }, [fetchAcara])

  // Toggle aktif
  async function toggleAktif(a) {
    try {
      await updateDoc(doc(db, 'kejohanan', selectedKej, 'acara', a.aceraId),
        { isAktif: !a.isAktif, updatedAt: serverTimestamp() })
      setAcaraList(l => l.map(x => x.aceraId === a.aceraId ? { ...x, isAktif: !x.isAktif } : x))
    } catch (e) { alert(e.message) }
  }

  // Filter
  const filtered = acaraList.filter(a => {
    if (filterJenis !== 'semua' && a.jenisAcara !== filterJenis) return false
    if (filterKat !== 'semua' && a.kategoriKod !== filterKat) return false
    if (filterJantina !== 'semua' && a.jantina !== filterJantina) return false
    if (search) {
      const q = search.toLowerCase()
      return a.namaAcara?.toLowerCase().includes(q) || a.aceraId?.toLowerCase().includes(q)
    }
    return true
  })

  const katOptions = [...new Set(acaraList.map(a => a.kategoriKod))].sort()

  // Stats
  const stats = {
    total: acaraList.length,
    lorong:   acaraList.filter(a => a.jenisAcara === 'lorong').length,
    padang:   acaraList.filter(a => ['padang_lompat','padang_balin'].includes(a.jenisAcara)).length,
    relay:    acaraList.filter(a => a.jenisAcara === 'relay').length,
    aktif:    acaraList.filter(a => a.isAktif).length,
  }

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Setup Acara</h1>
          <p className="text-xs text-gray-400 mt-0.5">Urus acara kejohanan — lorong, mass start, padang, relay</p>
          {namaKej && <p className="text-xs font-semibold text-[#003399] mt-0.5">{namaKej}</p>}
        </div>
        <button
          onClick={() => { if (!selectedKej) return; setModal({ mode: 'add' }) }}
          className="flex items-center gap-2 px-4 py-2 bg-[#003399] text-white text-xs font-bold rounded-lg hover:bg-[#002288] shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tambah Acara
        </button>
      </div>

      {selectedKej && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Jumlah',   val: stats.total,  color: 'text-[#003399]', bg: 'bg-blue-50' },
              { label: 'Lorong',   val: stats.lorong, color: 'text-blue-600',  bg: 'bg-blue-50' },
              { label: 'Padang',   val: stats.padang, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Relay',    val: stats.relay,  color: 'text-purple-600',bg: 'bg-purple-50' },
              { label: 'Aktif',    val: stats.aktif,  color: 'text-emerald-600',bg: 'bg-emerald-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl px-3 py-2.5 text-center`}>
                <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari acara…"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#003399]/25" />

            {/* Jenis filter */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
              {['semua', ...JENIS_ACARA.map(j => j.value)].map(f => (
                <button key={f} onClick={() => setFilterJenis(f)}
                  className={`px-2.5 py-1.5 font-semibold transition-colors ${filterJenis === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {f === 'semua' ? 'Semua' : JENIS_ACARA.find(j => j.value === f)?.short}
                </button>
              ))}
            </div>

            {/* Jantina */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
              {['semua', 'L', 'P'].map(f => (
                <button key={f} onClick={() => setFilterJantina(f)}
                  className={`px-2.5 py-1.5 font-semibold transition-colors ${filterJantina === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {f === 'semua' ? 'L+P' : f}
                </button>
              ))}
            </div>

            {/* Kategori */}
            {katOptions.length > 0 && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] bg-white">
                {['semua', ...katOptions].map(f => (
                  <button key={f} onClick={() => setFilterKat(f)}
                    className={`px-2.5 py-1.5 font-bold transition-colors ${filterKat === f ? 'bg-[#003399] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                    {f === 'semua' ? 'Kat' : f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-400">Memuatkan…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">{acaraList.length === 0 ? 'Tiada acara. Tambah atau muat masuk standard MSSM.' : 'Tiada hasil carian.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Acara</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Kat</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">J</th>
                      <th className="px-3 py-2.5 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wide">Jenis</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Finalis</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Had/Skl</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Angin</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="px-3 py-2.5 text-center text-[9px] font-bold text-gray-400 uppercase tracking-wide">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => (
                      <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${!a.isAktif ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-gray-800">{a.namaAcara}</p>
                          <p className="text-[9px] font-mono text-gray-400 mt-0.5">{a.aceraId}</p>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-black text-[#003399]">{a.kategoriKod}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <JantinaBadge jantina={a.jantina} />
                        </td>
                        <td className="px-3 py-2.5">
                          <JenisBadge jenis={a.jenisAcara} />
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {a.bilanganFinalis ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {a.hadAtletPerSekolah ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {a.isWindReading
                            ? <span className="text-blue-500 font-bold text-[10px]">✓ Wajib</span>
                            : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => toggleAktif(a)}>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-pointer ${
                              a.isAktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                            }`}>{a.isAktif ? 'Aktif' : 'Nyahaktif'}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => setModal({ mode: 'edit', data: a })}
                              className="p-1 text-gray-400 hover:text-[#003399] hover:bg-blue-50 rounded transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => setDelTarget(a)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Verifikasi */}
          <VerifikasiPanel acaraList={acaraList} kejohananId={selectedKej} onRefresh={fetchAcara} />

          {/* WA Config */}
          <WaConfigPanel kejohananId={selectedKej} />

          {/* Migrate Acara Lama */}
          <MigratePanel kejohananId={selectedKej} kategoriList={kategoriList} onMigrated={fetchAcara} />

          {/* Seed Standard */}
          <SeedPanel kejohananId={selectedKej} kategoriList={kategoriList} onSeeded={fetchAcara} />

          {/* Seed Jadual 2026 */}
          <SeedJadual2026Panel kejohananId={selectedKej} namaKej={namaKej} onSeeded={fetchAcara} />
        </>
      )}

      {/* Modals */}
      {modal?.mode === 'add' && (
        <AcaraModal mode="add" kejohananId={selectedKej} kategoriList={kategoriList}
          onClose={() => setModal(null)} onSaved={fetchAcara} />
      )}
      {modal?.mode === 'edit' && (
        <AcaraModal mode="edit" initial={modal.data} kejohananId={selectedKej} kategoriList={kategoriList}
          onClose={() => setModal(null)} onSaved={fetchAcara} />
      )}
      {delTarget && (
        <DeleteModal acara={delTarget} kejohananId={selectedKej}
          onClose={() => setDelTarget(null)} onDeleted={fetchAcara} />
      )}
    </div>
  )
}
