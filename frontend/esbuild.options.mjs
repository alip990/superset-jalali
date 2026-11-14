// Shared by build.mjs and test/build.test.ts.
// ES modules can read their own URL (?smart_date=1); keep es2019 syntax otherwise, or esbuild turns import.meta into {}.
export const options = (version, outdir) => ({entryPoints:['src/index.ts'], bundle:true, format:'esm', minify:true, sourcemap:true, target:'es2019', supported:{'import-meta':true}, jsx:'transform', jsxFactory:'React.createElement', jsxFragment:'React.Fragment', entryNames:'jalali-[hash]', outdir, define:{__VERSION__:JSON.stringify(version)}, write:false, metafile:true});
export const forbidden = inputs => Object.keys(inputs).filter(p => /node_modules\/(react|react-dom|antd)\//.test(p));
