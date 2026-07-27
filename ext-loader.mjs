/**
 * ext-loader.mjs — Node ESM resolve hook.
 * Benarkan import tanpa extension (.js) macam Vite: cuba tambah `.js` bila resolve gagal.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

export async function resolve(specifier, context, nextResolve) {
  // Redirect src/firebase/config → stub Node (elak import.meta.env Vite)
  if (specifier.endsWith('firebase/config') || specifier.endsWith('firebase/config.js')) {
    const stub = pathResolve(process.cwd(), 'firebase-config-stub.mjs')
    return { url: pathToFileURL(stub).href, shortCircuit: true }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      const base = dirname(fileURLToPath(context.parentURL))
      const candidate = pathResolve(base, specifier + '.js')
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
      }
    }
    throw err
  }
}
